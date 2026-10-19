/**
 * Kairos devnet acceptance driver (PRD §11.4 / §14).
 *
 * Run from backend/ AFTER `bun run setup` has provisioned the mints and the
 * relayer has SOL:   KAIROS_E2E_WALLET=<path-to-keypair.json> bun scripts/e2e-invest.ts
 * (omitting KAIROS_E2E_WALLET generates a throwaway wallet and prints its
 * secret so balances can be inspected on the explorer).
 *
 * Flow: faucet → quote → prepare → sign → submit → poll → position check →
 * close → poll → USDC back. Prints PASS/FAIL per step.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";
import { VersionedTransaction } from "@solana/web3.js";
import { config } from "../src/config";

const BASE = `http://localhost:${config.port}`;
const BASKET = process.env.KAIROS_E2E_BASKET || "solana-infra-governance";
const USDC = Number(process.env.KAIROS_E2E_USDC || 50);

const results: Array<{ step: string; ok: boolean; detail: string }> = [];
function step(name: string, ok: boolean, detail: string): void {
  results.push({ step: name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}

async function post(path: string, body: unknown) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
async function get(path: string) {
  const res = await fetch(BASE + path);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  console.log(`[e2e] target ${BASE} basket=${BASKET} usdc=${USDC}`);

  // 0. wallet
  let wallet: Keypair;
  const walletPath = process.env.KAIROS_E2E_WALLET;
  if (walletPath && existsSync(walletPath)) {
    wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8"))));
  } else {
    wallet = Keypair.generate();
    mkdirSync(config.dataDir, { recursive: true });
    const out = join(config.dataDir, "e2e-wallet.json");
    writeFileSync(out, JSON.stringify(Array.from(wallet.secretKey)));
    console.log(`[e2e] generated throwaway wallet -> ${out} (${wallet.publicKey.toBase58()})`);
  }
  const address = wallet.publicKey.toBase58();
  console.log(`[e2e] wallet ${address}  https://explorer.solana.com/address/${address}?cluster=devnet`);

  // 1. faucet
  const faucet = await post("/v1/faucet/airdrop", { walletAddress: address });
  step("faucet", faucet.status === 200 && (faucet.json as { success?: boolean }).success === true, JSON.stringify(faucet.json).slice(0, 120));
  if (faucet.status !== 200) return finish();
  await sleep(3_000); // let the mint land

  // 2. quote
  const quote = await post("/v1/quotes", { basket: BASKET, usdcAmount: USDC });
  step("quote", quote.status === 200, `fee=${(quote.json.quote as { platformFeeUsdc?: number })?.platformFeeUsdc}`);
  if (quote.status !== 200) return finish();

  // 3. prepare
  const idem = `e2e-${Date.now()}`;
  const prep = await post("/v1/positions/prepare", { basket: BASKET, usdc: USDC, walletAddress: address, idempotencyKey: idem });
  const execution = prep.json.execution as { id?: string; preparedTxs?: string[]; legs?: unknown[] } | undefined;
  step("prepare", prep.status === 200 && !!execution?.preparedTxs?.length, `executionId=${execution?.id} legs=${execution?.legs?.length}`);
  if (prep.status !== 200 || !execution) return finish();

  // idempotent replay returns the same execution
  const prep2 = await post("/v1/positions/prepare", { basket: BASKET, usdc: USDC, walletAddress: address, idempotencyKey: idem });
  step("idempotent prepare", (prep2.json.execution as { id?: string })?.id === execution.id, `same id=${(prep2.json.execution as { id?: string })?.id === execution.id}`);

  // 4. sign (wallet adds its signature to each partially-signed tx)
  const signed = execution.preparedTxs!.map((b64) => {
    const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
    tx.sign([wallet]);
    return Buffer.from(tx.serialize()).toString("base64");
  });

  // 5. submit
  const submit = await post("/v1/positions/submit", { executionId: execution.id, signedTxs: signed });
  step("submit", submit.status === 200, `status=${(submit.json.execution as { status?: string })?.status}`);
  if (submit.status !== 200) return finish();

  // duplicate submit must not double-land (idempotent return)
  const dup = await post("/v1/positions/submit", { executionId: execution.id, signedTxs: signed });
  step("duplicate submit safe", dup.status === 200 && (dup.json.execution as { id?: string })?.id === execution.id, "");

  // 6. poll to terminal
  let final = "";
  for (let i = 0; i < 60; i++) {
    await sleep(2_000);
    const poll = await get(`/v1/executions/${execution.id}`);
    final = (poll.json.execution as { status?: string })?.status ?? "";
    if (["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(final)) break;
  }
  step("landing", final === "COMPLETED", `final=${final} (PARTIALLY_COMPLETED → use /retry or /unwind)`);

  // 7. position
  const positions = await get(`/v1/positions?walletAddress=${address}`);
  const list = (positions.json.positions as Array<{ id: string; basketId: string; currentValueUsd: number; legs: unknown[] }>) ?? [];
  const pos = list.find((p) => p.legs.length > 0);
  step("position derived", !!pos, pos ? `id=${pos.id} value=$${pos.currentValueUsd}` : "none");

  // 8. close
  if (pos) {
    const closeIdem = `e2e-close-${Date.now()}`;
    const close = await post(`/v1/positions/${pos.id}/close/prepare`, { idempotencyKey: closeIdem, walletAddress: address });
    const closeExec = close.json.execution as { id?: string; preparedTxs?: string[] } | undefined;
    step("close prepare", close.status === 200 && !!closeExec?.preparedTxs?.length, `executionId=${closeExec?.id}`);
    if (closeExec?.preparedTxs?.length) {
      const signedClose = closeExec.preparedTxs.map((b64) => {
        const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
        tx.sign([wallet]);
        return Buffer.from(tx.serialize()).toString("base64");
      });
      const closeSubmit = await post("/v1/positions/submit", { executionId: closeExec.id, signedTxs: signedClose });
      step("close submit", closeSubmit.status === 200, "");
      let closeFinal = "";
      for (let i = 0; i < 60; i++) {
        await sleep(2_000);
        const poll = await get(`/v1/executions/${closeExec.id}`);
        closeFinal = (poll.json.execution as { status?: string })?.status ?? "";
        if (["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(closeFinal)) break;
      }
      step("close landing", closeFinal === "COMPLETED", `final=${closeFinal}`);
    }
  }

  finish();
}

function finish(): void {
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== E2E summary: ${passed}/${results.length} steps passed ===`);
  for (const r of results) console.log(` ${r.ok ? "✓" : "✗"} ${r.step}`);
  process.exitCode = results.every((r) => r.ok) ? 0 : 1;
}

main().catch((err) => {
  console.error("[e2e] crashed:", err);
  process.exitCode = 1;
});
