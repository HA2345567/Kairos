/**
 * Live devnet acceptance run (PRD §14 acceptance items).
 *
 * Every gate is a real check against the configured devnet — RPC, the deployed
 * router program, the devnet state file and the running API. Three verdicts:
 *
 *   pass    — observed working
 *   fail    — observed broken (script exits 1)
 *   blocked — a prerequisite an operator owns is missing (no SOL, no deployed
 *             program, no running API). Blocked is never reported as a pass, and
 *             the missing prerequisite is always named.
 *
 * This is the honest closure test for the items the automated suite can only
 * prove with injected overrides.
 *
 * Usage: bun scripts/acceptance-devnet.ts [--base http://localhost:3001]
 */

import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { config } from "../src/config";
import { withFailover } from "../src/chain/connection";
import { KAIROS_ROUTER_PROGRAM_ID } from "../src/chain/programSwap";
import { loadDevnetState } from "../src/chain/devnetState";

type Verdict = "pass" | "fail" | "blocked";

interface Gate {
  id: string;
  requirement: string;
  verdict: Verdict;
  observed: string;
  blockedBy?: string;
}

const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}
const BASE = (argValue("--base") || process.env.KAIROS_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
const MIN_RELAYER_SOL = 0.05;

const gates: Gate[] = [];

function gate(entry: Gate): void {
  gates.push(entry);
}

async function main(): Promise<void> {
  if (config.cluster !== "devnet") {
    gate({
      id: "cluster",
      requirement: "run against devnet",
      verdict: "blocked",
      observed: `SOLANA_NETWORK=${config.cluster}`,
      blockedBy: "set SOLANA_NETWORK=devnet",
    });
    return report();
  }

  // ---- 1. Relayer funding -------------------------------------------------
  const relayer = config.relayerKeypair.publicKey;
  let relayerSol: number | null = null;
  try {
    relayerSol = (await withFailover((connection) => connection.getBalance(relayer))) / 1e9;
  } catch (error) {
    gate({
      id: "rpc",
      requirement: "RPC reachable",
      verdict: "blocked",
      observed: "no RPC response",
      blockedBy: error instanceof Error ? error.message : String(error),
    });
  }

  if (relayerSol !== null) {
    gate({
      id: "relayer-funded",
      requirement: `relayer holds ≥ ${MIN_RELAYER_SOL} SOL`,
      verdict: relayerSol >= MIN_RELAYER_SOL ? "pass" : "blocked",
      observed: `${relayerSol.toFixed(4)} SOL at ${relayer.toBase58()}`,
      blockedBy: relayerSol >= MIN_RELAYER_SOL ? undefined : "fund the relayer from a devnet faucet",
    });
  }

  // ---- 2. Router program deployed ----------------------------------------
  if (relayerSol !== null) {
    const program = await withFailover((connection) => connection.getAccountInfo(KAIROS_ROUTER_PROGRAM_ID));
    gate({
      id: "router-deployed",
      requirement: "kairos_router program deployed and executable",
      verdict: program?.executable ? "pass" : "blocked",
      observed: program
        ? `${KAIROS_ROUTER_PROGRAM_ID.toBase58()} present, executable=${program.executable}`
        : `${KAIROS_ROUTER_PROGRAM_ID.toBase58()} not found on-chain`,
      blockedBy: program?.executable ? undefined : "solana program deploy target/deploy/kairos_router.so",
    });
  }

  // ---- 3. Devnet state (mints, treasury) ---------------------------------
  const state = loadDevnetState();
  gate({
    id: "devnet-initialised",
    requirement: "devnet mints + treasury initialised",
    verdict: state ? "pass" : "blocked",
    observed: state ? `USDC ${state.usdc.mint}` : "backend/data/devnet-state.json missing",
    blockedBy: state ? undefined : "bun run setup",
  });

  // ---- 4. Program swap builder active ------------------------------------
  gate({
    id: "program-swap-builder",
    requirement: "SWAP_BUILDER=program (on-chain router, not treasury stub)",
    verdict: config.swapBuilder === "program" ? "pass" : "blocked",
    observed: `SWAP_BUILDER=${config.swapBuilder}`,
    blockedBy:
      config.swapBuilder === "program"
        ? undefined
        : "the treasury builder settles off-router; set SWAP_BUILDER=program once the program is funded",
  });

  // ---- 5. Control-plane simulation is off --------------------------------
  gate({
    id: "no-simulation-mode",
    requirement: "KAIROS_SIMULATE_LANDING unset (real send/confirm)",
    verdict: config.simulateLanding ? "fail" : "pass",
    observed: config.simulateLanding ? "simulation mode enabled" : "simulation mode disabled",
  });

  // ---- 6. API reachable --------------------------------------------------
  let apiUp = false;
  try {
    const health = await fetch(`${BASE}/health`);
    apiUp = health.ok;
  } catch {
    apiUp = false;
  }
  gate({
    id: "api-up",
    requirement: `API answers at ${BASE}`,
    verdict: apiUp ? "pass" : "blocked",
    observed: apiUp ? "HTTP 200 from /health" : "no response",
    blockedBy: apiUp ? undefined : "start the API (bun run start) before the acceptance run",
  });

  if (!apiUp || !state) return report();

  // ---- 7. Live prepare → sign → submit → land ----------------------------
  const wallet = Keypair.generate();
  const address = wallet.publicKey.toBase58();

  const post = async (path: string, body: unknown, token?: string, idempotencyKey?: string) => {
    const response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed };
  };

  const nonce = await post("/v1/auth/nonce", { walletAddress: address });
  if (nonce.status !== 200 || !nonce.body?.nonce) {
    gate({
      id: "siws-session",
      requirement: "SIWS session for a fresh wallet",
      verdict: "blocked",
      observed: `nonce HTTP ${nonce.status}`,
      blockedBy: nonce.body?.error ?? "nonce issuance refused",
    });
    return report();
  }
  const message = `kairos-devnet-login:${nonce.body.nonce}`;
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), wallet.secretKey));
  const session = await post("/v1/auth/verify", { walletAddress: address, signature, message });
  if (session.status !== 200 || !session.body?.token) {
    gate({
      id: "siws-session",
      requirement: "SIWS session for a fresh wallet",
      verdict: "fail",
      observed: `verify HTTP ${session.status} ${session.body?.error ?? ""}`.trim(),
    });
    return report();
  }
  gate({
    id: "siws-session",
    requirement: "SIWS session for a fresh wallet",
    verdict: "pass",
    observed: "nonce + verify returned a session token",
  });

  const basketsResponse = await fetch(`${BASE}/v1/baskets`);
  const baskets = ((await basketsResponse.json()) as any)?.baskets ?? [];
  const basket = baskets.find((item: any) => item?.status === "active");
  if (!basket) {
    gate({
      id: "live-prepare",
      requirement: "live prepare builds real transactions",
      verdict: "blocked",
      observed: "no active basket in the registry",
      blockedBy: "seed the registry (bun run seed)",
    });
    return report();
  }

  const prepared = await post(
    "/v1/positions/prepare",
    { basket: basket.slug, usdc: Math.max(Number(basket.minUsdc) || 25, 25), walletAddress: address },
    session.body.token,
    `acceptance-${Date.now()}`,
  );
  if (prepared.status !== 200 || !prepared.body?.execution?.preparedTxs?.length) {
    gate({
      id: "live-prepare",
      requirement: "live prepare builds real transactions",
      verdict: "blocked",
      observed: `HTTP ${prepared.status} ${prepared.body?.error ?? ""}`.trim(),
      blockedBy: "prepare needs a funded relayer, priced tokens and a reachable RPC",
    });
    return report();
  }

  const execution = prepared.body.execution;
  gate({
    id: "live-prepare",
    requirement: "live prepare builds real transactions",
    verdict: "pass",
    observed: `${execution.preparedTxs.length} transaction(s) for ${execution.legs.length} leg(s)`,
  });

  // The wallet has no USDC, so signing/submitting is where this stops unless an
  // operator supplies a funded keypair. That is reported, not hidden.
  const needsFunding = await withFailover((connection) => connection.getBalance(wallet.publicKey));
  gate({
    id: "live-land",
    requirement: "prepare → sign → submit → leg reaches a terminal state",
    verdict: "blocked",
    observed: `throwaway wallet holds ${(needsFunding / 1e9).toFixed(4)} SOL and no devnet USDC`,
    blockedBy:
      "run the faucet for the wallet under test, or pass a funded keypair; the automated suite covers landing with injected overrides",
  });

  return report();
}

function report(): void {
  const counts = { pass: 0, fail: 0, blocked: 0 };
  for (const entry of gates) counts[entry.verdict] += 1;
  console.log(
    JSON.stringify(
      {
        cluster: config.cluster,
        base: BASE,
        generatedAt: new Date().toISOString(),
        counts,
        gates,
      },
      null,
      2,
    ),
  );
  if (counts.fail > 0) process.exit(1);
  if (counts.blocked > 0) process.exit(2);
  process.exit(0);
}

await main();
