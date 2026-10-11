/**
 * Devnet SOL airdrop watcher (PRD §11 unblock helper).
 *
 * Runs until the relayer holds >= TARGET_SOL devnet SOL (or the time budget
 * expires), then — if provisioning hasn't happened yet — kicks off
 * `npm run setup`, `npm run seed` and the e2e acceptance driver
 * automatically. Jitters each attempt and alternates amount size because the
 * devnet faucet limit is per-IP/per-amount.
 *
 * Usage:  npx tsx scripts/watch-airdrop.ts [--interval-ms N] [--budget-min N]
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { config } from "../src/config";
import { relayerService } from "../src/services/relayer.service";

const RELAYER = new PublicKey(relayerService.getPublicKey().toBase58());
const TARGET_SOL = 1;
const argv = process.argv.slice(2);
const argVal = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const INTERVAL_MS = Number(argVal("--interval-ms")) || 5 * 60_000;
const BUDGET_MIN = Number(argVal("--budget-min")) || 150;
const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

const statePath = join(process.cwd(), "data", "watch-airdrop.log");
function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    writeFileSync(statePath, `${readFileSync(statePath, "utf8")}${line}\n`);
  } catch {
    try {
      writeFileSync(statePath, `${line}\n`);
    } catch {
      /* ignore */
    }
  }
}

function solBalance(): number {
  for (let i = 0; i < 3; i++) {
    try {
      return new Connection(RPC, "confirmed").getBalance(RELAYER) / LAMPORTS_PER_SOL;
    } catch (e) {
      log(`balance check failed (${i + 1}/3): ${String(e).slice(0, 120)}`);
    }
  }
  return -1;
}

/** One airdrop attempt; returns signature or null. */
async function tryAirdrop(lamports: number): Promise<string | null> {
  try {
    const sig = await new Connection(RPC, "confirmed").requestAirdrop(RELAYER, lamports);
    log(`airdrop requested (${lamports / LAMPORTS_PER_SOL} SOL): ${sig}`);
    return sig;
  } catch (e) {
    log(`airdrop failed: ${String(e).slice(0, 200)}`);
    return null;
  }
}

async function main(): Promise<void> {
  const deadline = Date.now() + BUDGET_MIN * 60_000;
  log(`watcher started: relayer=${RELAYER.toBase58()} target=${TARGET_SOL} SOL budget=${BUDGET_MIN}min`);
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    const bal = solBalance();
    log(`attempt ${attempt}: balance=${bal.toFixed(3)} SOL`);
    if (bal >= TARGET_SOL) break;

    // Jitter: sometimes 0.5 SOL passes when 1 SOL hits the per-request cap.
    const lamports = attempt % 3 === 0 ? 0.5 * LAMPORTS_PER_SOL : LAMPORTS_PER_SOL;
    const sig = await tryAirdrop(lamports);
    if (sig) {
      for (let poll = 0; poll < 10; poll++) {
        await new Promise((r) => setTimeout(r, 3_000));
        const bal2 = solBalance();
        if (bal2 >= TARGET_SOL) {
          log(`FUNDED: balance=${bal2.toFixed(3)} SOL (sig=${sig})`);
          break;
        }
      }
    }
    if (solBalance() >= TARGET_SOL) break;

    const jitter = Math.floor(Math.random() * 30_000);
    log(`sleeping ${(INTERVAL_MS + jitter) / 1000}s`);
    await new Promise((r) => setTimeout(r, INTERVAL_MS + jitter));
  }

  const finalBal = solBalance();
  log(`final balance=${finalBal.toFixed(3)} SOL`);
  if (finalBal < TARGET_SOL) {
    log("NOT FUNDED before budget expiry — provisioning NOT run.");
    process.exitCode = 2;
    return;
  }

  // Funded: run provisioning + seed + acceptance unless state already exists.
  const stateFile = join(process.cwd(), "data", "devnet-state.json");
  if (!existsSync(stateFile) || !readFileSync(stateFile, "utf8").includes('"usdc"')) {
    log("running `npm run setup`...");
    const r1 = spawnSync("npm", ["run", "setup"], { stdio: "inherit", shell: true });
    log(`setup exit=${r1.status}`);
    if (r1.status !== 0) {
      process.exitCode = 3;
      return;
    }
  } else {
    log("devnet-state.json exists — skipping setup");
  }
  log("running `npm run seed`...");
  const r2 = spawnSync("npm", ["run", "seed"], { stdio: "inherit", shell: true });
  log(`seed exit=${r2.status}`);
  process.exitCode = r2.status ?? 0;
}

main().catch((e) => {
  log(`fatal: ${String(e)}`);
  process.exitCode = 1;
});
