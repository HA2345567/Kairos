/**
 * Kairos devnet bootstrap (plan.md §4, PRD §11).
 *
 * Run from repository root: bun run --cwd backend setup
 *
 * Everything is deterministic (labels -> sha256 seeds), so re-runs are
 * idempotent and survive devnet resets:
 *   1. fund the relayer (fee payer) via airdrop, best-effort
 *   2. ensure the deterministic USDC mint (6 decimals)
 *   3. ensure the 10 deterministic asset mints (6 decimals each)
 *   4. create + fund the treasury's ATAs (10M UI per asset, 1M USDC)
 *      — the treasury IS the devnet "liquidity pool" our mock swaps trade against
 *   5. write backend/data/devnet-state.json (schema: src/db/schema.ts DevnetState)
 *
 * Mint authorities are the per-mint deterministic keypairs themselves,
 * re-derived on demand from their labels (never stored in plaintext files).
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { LAMPORTS_PER_SOL, Connection, PublicKey } from "@solana/web3.js";
import { config } from "../src/config";
import { getBalance, getConnection, getFallbackConnection, getSignatureStatuses } from "../src/chain/connection";
import { DEVNET_LABELS, deterministicKeypair } from "../src/chain/devnetState";
import { ensureFundedAta, ensureMint } from "../src/chain/mints";
import { relayerService } from "../src/services/relayer.service";
import type { DevnetState } from "../src/db/schema";
import { DEVNET_ASSETS } from "../src/chain/devnet-assets";

const DECIMALS = 6;
const TREASURY_ASSET_UI = 10_000_000;
const TREASURY_USDC_UI = 1_000_000;
const AIRDROP_SOL = 2;
const AIRDROP_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const explorer = (kind: "address" | "tx", id: string) =>
  `https://explorer.solana.com/${kind}/${id}?cluster=devnet`;

function log(step: string, msg: string): void {
  console.log(`[devnet-setup] ${step.padEnd(22)} ${msg}`);
}

function safeEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  for (const key of url.searchParams.keys()) {
    if (/key|token|secret|auth|password/i.test(key)) url.searchParams.set(key, "[redacted]");
  }
  return url.toString();
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(process.env.HELIUS_API_KEY || "\0", "[redacted]")
    .replace(/([?&][^=]*(?:key|token|secret|auth|password)=)[^&\s]*/gi, "$1[redacted]");
}

/** Best-effort airdrop with signature confirmation; alternates primary/fallback RPC. */
async function airdrop(
  connections: Connection[],
  pubkey: PublicKey,
  lamports: number
): Promise<{ ok: boolean; signature?: string }> {
  for (let attempt = 1; attempt <= AIRDROP_ATTEMPTS; attempt++) {
    const conn = connections[(attempt - 1) % connections.length];
    try {
      const signature = await conn.requestAirdrop(pubkey, lamports);
      for (let poll = 0; poll < 8; poll++) {
        await sleep(2_000);
        const res = await getSignatureStatuses([signature]);
        const status = res?.value?.[0];
        if (status && !status.err) {
          const cs = status.confirmationStatus;
          if (cs === "confirmed" || cs === "finalized") return { ok: true, signature };
        }
      }
      log("airdrop", `attempt ${attempt}: signature ${signature} not confirmed in time`);
    } catch (err) {
      log(
        "airdrop",
        `attempt ${attempt} on ${safeEndpoint(conn.rpcEndpoint)} failed: ${safeError(err)}`
      );
    }
    await sleep(3_000);
  }
  return { ok: false };
}

async function main(): Promise<void> {
  if (!config.isDevnet()) {
    throw new Error(`Refusing to run devnet-setup against cluster "${config.cluster}"`);
  }

  const conn = getConnection();
  const fallbackConn = getFallbackConnection();
  log("connect", `primary ${safeEndpoint(conn.rpcEndpoint)} / fallback ${safeEndpoint(fallbackConn.rpcEndpoint)}`);

  const relayer = relayerService.getKeypair();
  const treasury = deterministicKeypair(DEVNET_LABELS.treasury);

  // ---- 1. fund the relayer (fee payer for mints, ATAs and leg transactions) ----
  let relayerSol = (await getBalance(undefined, relayer.publicKey)) / LAMPORTS_PER_SOL;
  log("relayer", `${relayer.publicKey.toBase58()} balance ${relayerSol.toFixed(4)} SOL`);
  if (relayerSol >= AIRDROP_SOL) {
    log("relayer", `already funded (>= ${AIRDROP_SOL} SOL); skipping airdrop`);
  } else {
    const res = await airdrop([conn, fallbackConn], relayer.publicKey, AIRDROP_SOL * LAMPORTS_PER_SOL);
    relayerSol = (await getBalance(undefined, relayer.publicKey)) / LAMPORTS_PER_SOL;
    log(
      "relayer",
      res.ok
        ? `airdrop confirmed (sig ${res.signature}) -> balance ${relayerSol.toFixed(4)} SOL`
        : `airdrop did NOT confirm after ${AIRDROP_ATTEMPTS} attempts; continuing (balance ${relayerSol.toFixed(4)} SOL)`
    );
  }
  if (relayerSol <= 0.05) {
    throw new Error("Relayer has insufficient SOL after faucet attempts; no mint setup was attempted.");
  }

  // ---- 2. USDC mint ----
  const usdcKp = deterministicKeypair(DEVNET_LABELS.usdcMint);
  await ensureMint(conn, relayer, DEVNET_LABELS.usdcMint, DECIMALS, usdcKp.publicKey);
  log("mint", `USDC  ${usdcKp.publicKey.toBase58()} (${DECIMALS} dp)`);

  // ---- 3. asset mints + 4. funded treasury ATAs ----
  const assetEntries: DevnetState["assets"] = [];
  for (const spec of DEVNET_ASSETS) {
    const label = DEVNET_LABELS.assetMint(spec.symbol);
    const mintKp = deterministicKeypair(label);
    await ensureMint(conn, relayer, label, DECIMALS, mintKp.publicKey);
    const ata = await ensureFundedAta(
      conn,
      relayer,
      mintKp.publicKey,
      treasury.publicKey,
      mintKp,
      TREASURY_ASSET_UI
    );
    log(
      "mint",
      `${spec.symbol.padEnd(8)} ${mintKp.publicKey.toBase58()} treasury ATA ${ata.ata.toBase58()} funded ${TREASURY_ASSET_UI.toLocaleString()} UI`
    );
    assetEntries.push({
      symbol: spec.symbol,
      mint: mintKp.publicKey.toBase58(),
      decimals: DECIMALS,
      priceUsd: spec.priceUsd,
      legType: spec.legType,
      ...(spec.marketClosed ? { marketClosed: true } : {}),
    });
  }

  // treasury USDC ATA (the side user payments and fees flow into)
  const treasuryUsdcAta = await ensureFundedAta(
    conn,
    relayer,
    usdcKp.publicKey,
    treasury.publicKey,
    usdcKp,
    TREASURY_USDC_UI
  );
  log("treasury", `USDC ATA ${treasuryUsdcAta.ata.toBase58()} funded ${TREASURY_USDC_UI.toLocaleString()} UI`);

  // ---- 5. write devnet-state.json ----
  const state: DevnetState = {
    cluster: "devnet",
    usdc: {
      mint: usdcKp.publicKey.toBase58(),
      decimals: DECIMALS,
      authority: usdcKp.publicKey.toBase58(), // deterministic keypair re-derived from label
    },
    treasury: { pubkey: treasury.publicKey.toBase58() },
    relayer: { pubkey: relayer.publicKey.toBase58() },
    assets: assetEntries,
    updatedAt: new Date().toISOString(),
  };
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(config.devnetStatePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  log("state", `wrote ${config.devnetStatePath} (state hash ${createHash("sha256").update(JSON.stringify(state)).digest("hex").slice(0, 16)})`);

  // ---- summary ----
  console.log("\n=== Kairos devnet summary ===");
  console.log(`cluster      devnet (rpc ${safeEndpoint(conn.rpcEndpoint)})`);
  console.log(`relayer      ${relayer.publicKey.toBase58()}  (${relayerSol.toFixed(4)} SOL)`);
  console.log(`             ${explorer("address", relayer.publicKey.toBase58())}`);
  console.log(`treasury     ${treasury.publicKey.toBase58()}`);
  console.log(`             ${explorer("address", treasury.publicKey.toBase58())}`);
  console.log(`usdc mint    ${usdcKp.publicKey.toBase58()}`);
  console.log(`             ${explorer("address", usdcKp.publicKey.toBase58())}`);
  console.log("\nsymbol   mint                                      decimals  priceUsd   legType  marketClosed");
  for (const a of assetEntries) {
    console.log(
      `${a.symbol.padEnd(8)} ${a.mint}  ${String(a.decimals).padEnd(9)}  ${String(a.priceUsd).padEnd(10)} ${a.legType.padEnd(8)} ${a.marketClosed ? "yes" : "-"}`
    );
  }

  // recent relayer-paid signatures as creation evidence
  try {
    const sigs = await conn.getSignaturesForAddress(relayer.publicKey, { limit: 15 });
    if (sigs.length > 0) {
      console.log("\nrecent relayer transactions:");
      for (const s of sigs.slice(0, 10)) {
        console.log(`  ${s.signature}  ${s.err ? "ERR " : "ok  "} ${explorer("tx", s.signature)}`);
      }
    }
  } catch {
    /* evidence only */
  }
  console.log("\n[devnet-setup] done. Next: bun run --cwd backend seed");
}

main().catch((err) => {
  console.error("[devnet-setup] FAILED:", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
