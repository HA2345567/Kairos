/**
 * Audit driver (temporary): chaos partial-failure → retry, and publish-v2 →
 * manual rebalance. Requires the server running with
 * KAIROS_CHAOS_FORCE_LEG_FAIL_MINT=<a basket leg mint>.
 */
import { randomUUID } from "node:crypto";
import { Keypair, VersionedTransaction } from "@solana/web3.js";

const BASE = "http://localhost:3001";
const BASKET = "solana-infra-governance";
const results: Array<{ step: string; ok: boolean; detail: string }> = [];
function step(name: string, ok: boolean, detail: string) {
  results.push({ step: name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}
async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}
async function get(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(BASE + path, { headers });
  return { status: res.status, json: (await res.json()) as any };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function signAndSubmit(exec: any, wallet: Keypair): Promise<string> {
  const signed = (exec.preparedTxs as string[]).map((b64) => {
    const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
    tx.sign([wallet]);
    return Buffer.from(tx.serialize()).toString("base64");
  });
  const sub = await post("/v1/positions/submit", { executionId: exec.id, signedTxs: signed });
  return sub.json.execution?.status ?? `http ${sub.status}`;
}

async function settle(execId: string): Promise<any> {
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    const poll = await get(`/v1/executions/${execId}`);
    const st = poll.json.execution?.status ?? poll.json.status;
    if (["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(st)) return poll.json.execution ?? poll.json;
  }
  throw new Error("did not settle in 60s");
}

async function main() {
  const wallet = Keypair.generate();
  const address = wallet.publicKey.toBase58();
  console.log(`[audit] wallet ${address}`);
  const faucet = await post("/v1/faucet/airdrop", { walletAddress: address });
  step("faucet", faucet.status === 200, JSON.stringify(faucet.json).slice(0, 80));
  await sleep(2000);

  // 1) invest with a forced leg failure (server has chaos mint set)
  const idem = `audit-${randomUUID().slice(0, 8)}`;
  const prep = await post("/v1/positions/prepare", { basket: BASKET, usdc: 50, walletAddress: address, idempotencyKey: idem });
  step("prepare", prep.status === 200, `legs=${prep.json.execution?.legs?.length}`);
  const status1 = await signAndSubmit(prep.json.execution, wallet);
  step("submit", status1 === "SUBMITTED", status1);
  const exec1 = await settle(prep.json.execution.id);
  step("chaos → PARTIALLY_COMPLETED", exec1.status === "PARTIALLY_COMPLETED",
    exec1.legs.map((l: any) => `${l.symbol}:${l.status}`).join(" "));

  // 2) retry failed legs
  const retry = await post(`/v1/executions/${exec1.id}/retry`, { walletAddress: address, idempotencyKey: idem + "-retry" });
  step("retry prepare", retry.status === 200, `legs=${retry.json.execution?.legs?.length} fee=${retry.json.execution?.feeUsdc}`);
  if (retry.status === 200) {
    await signAndSubmit(retry.json.execution, wallet);
    const exec2 = await settle(retry.json.execution.id);
    step("retry lands COMPLETED", exec2.status === "COMPLETED", exec2.status);
  }

  // 3) position exists with landed legs
  const positions = await get(`/v1/positions?walletAddress=${address}`);
  const pos = (positions.json.positions ?? []).find((p: any) => p.basketId?.includes("solana-infra"));
  step("position derived", !!pos, pos ? `value=$${pos.currentValueUsd} drift=${pos.driftPct}%` : "none");

  // 4) publish v2 (weight change) via admin → manual rebalance
  const version = await get(`/v1/baskets/${BASKET}`);
  const legs = version.json.basket?.activeVersion?.legs ?? version.json.activeVersion?.legs ?? [];
  const adminToken = process.env.ADMIN_TOKEN;
  const approverToken = process.env.ADMIN_APPROVER_TOKEN;
  if (legs.length >= 2) {
    const newLegs = legs.map((l: any, i: number) => ({
      mint: l.mint,
      weightBps: i === 0 ? l.weightBps + 500 : l.weightBps - Math.floor(500 / (legs.length - 1)),
      legType: l.legType ?? "spl",
    }));
    const last = newLegs[newLegs.length - 1];
    last.weightBps += 500 - Math.floor(500 / (legs.length - 1)) * (legs.length - 1); // exact 10000
    const pub = await post(`/v1/admin/baskets/${BASKET}/publish`,
      { version: 2, changelog: "audit v2", legs: newLegs }, {
        "x-admin-token": adminToken ?? "",
      });
    const proposalId = pub.json.proposal?.id;
    step("propose v2", pub.status === 202 && !!proposalId, JSON.stringify(pub.json).slice(0, 80));
    if (proposalId) {
      const approval = await post(`/v1/admin/basket-publish-proposals/${proposalId}/approve`,
        { note: "audit approval" }, { "x-admin-approver-token": approverToken ?? "" });
      step("approve v2", approval.status === 200, JSON.stringify(approval.json).slice(0, 80));
    }
    const reb = await post(`/v1/positions/${pos.id}/rebalance/prepare`, { walletAddress: address, idempotencyKey: idem + "-reb" });
    step("rebalance prepare", reb.status === 200,
      reb.status === 200 ? `sells=${reb.json.execution?.preview?.sells?.length ?? "?"} buys=${reb.json.execution?.preview?.buys?.length ?? "?"}` : JSON.stringify(reb.json).slice(0, 100));
    if (reb.status === 200) {
      await signAndSubmit(reb.json.execution, wallet);
      const exec3 = await settle(reb.json.execution.id);
      step("rebalance lands COMPLETED", exec3.status === "COMPLETED", exec3.status);
    }
  }

  // 5) close
  const close = await post(`/v1/positions/${pos.id}/close/prepare`, { walletAddress: address, idempotencyKey: idem + "-close" });
  step("close prepare", close.status === 200, `legs=${close.json.execution?.legs?.length}`);
  if (close.status === 200) {
    await signAndSubmit(close.json.execution, wallet);
    const exec4 = await settle(close.json.execution.id);
    step("close lands COMPLETED", exec4.status === "COMPLETED", exec4.status);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== audit summary: ${results.length - failed}/${results.length} passed ===`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("[audit] crashed:", e); process.exit(1); });
