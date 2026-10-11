import "dotenv/config";
import { Keypair } from "@solana/web3.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface Policy {
  allowlistMints: string[];
  maxSpendUsdcPerRebalance: number;
  maxSlippageBps: number;
}

export interface Config {
  port: number; // PORT ?? 3001
  host: string; // HOST ?? "0.0.0.0"
  cluster: "devnet" | "mainnet-beta"; // SOLANA_NETWORK ?? devnet
  rpcUrl: string;
  fallbackRpcUrl: string;
  jwtSecret: string;
  jwtAccessSec: 900;
  jwtRefreshSec: 604800;
  platformFeeBps: number; // PLATFORM_FEE_BPS ?? 20
  minBasketUsdc: number; // 25
  quoteValiditySec: number; // 60
  maxPriceImpactPct: number; // 1
  stalePriceSec: number; // 10
  dustThresholdUsdc: number; // 1
  dataDir: string; // backend/data (absolute, resolved from this module)
  devnetStatePath: string; // backend/data/devnet-state.json
  // Chaos switches (all optional env, prefixed KAIROS_CHAOS_*)
  chaos: {
    forceLegFailMint?: string;
    slowConfirmMs?: number;
    forceQuoteExpirySec?: number;
    stalePriceSec?: number;
    forceSimulationFail?: boolean;
  };
  isDevnet(): boolean;
  /** KAIROS_SIMULATE_LANDING=1: control-plane simulation mode (PRD §11.2 "test
   *  data" labelling). Real transactions are built + byte-verified, but
   *  send/confirm/balance/faucet are stubbed — for when no validator/faucet
   *  is reachable (no-AVX CPU, dry faucet). NEVER enable on mainnet. */
  simulateLanding: boolean;
  /** SWAP_BUILDER=treasury (default, devnet) | program (on-chain kairos_router
   *  via Raydium CPMM — activates once the program is deployed + funded). */
  swapBuilder: "treasury" | "program";

  // --- backward-compat fields (still referenced by existing services) ---
  treasuryWallet: string;
  relayerKeypair: Keypair;
  killSwitchActive: boolean;
}

function numEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function boolEnv(name: string): boolean | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return undefined;
  return raw === "1" || raw.toLowerCase() === "true";
}

// backend/src -> backend/data (absolute, resolved from this module)
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(
  process.env.KAIROS_DATA_DIR || path.join(moduleDir, "..", "data")
);

// Deterministic 32-byte seed for devnet/test gas relayer (stable address)
const relayerSeed = new Uint8Array(32);
relayerSeed.fill(42);

export const config: Config = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || "0.0.0.0",
  cluster: (process.env.SOLANA_NETWORK as Config["cluster"]) || "devnet",
  rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  // Provider keys come ONLY from gitignored env (never tracked files).
  // With HELIUS_API_KEY set, the failover endpoint is Helius; otherwise the
  // fallback is the public endpoint (withFailover then acts as a retry).
  fallbackRpcUrl:
    process.env.SOLANA_FALLBACK_RPC_URL ||
    (process.env.HELIUS_API_KEY
      ? `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
      : "https://api.devnet.solana.com"),
  jwtSecret: process.env.JWT_SECRET || "kairos-super-secure-devnet-secret-key-2026",
  jwtAccessSec: 900,
  jwtRefreshSec: 604800,
  platformFeeBps: Number(process.env.PLATFORM_FEE_BPS || 20),
  minBasketUsdc: 25,
  quoteValiditySec: 60,
  maxPriceImpactPct: 1,
  stalePriceSec: 10,
  dustThresholdUsdc: 1,
  dataDir,
  devnetStatePath: path.join(dataDir, "devnet-state.json"),
  chaos: {
    forceLegFailMint: process.env.KAIROS_CHAOS_FORCE_LEG_FAIL_MINT || undefined,
    slowConfirmMs: numEnv("KAIROS_CHAOS_SLOW_CONFIRM_MS"),
    forceQuoteExpirySec: numEnv("KAIROS_CHAOS_FORCE_QUOTE_EXPIRY_SEC"),
    stalePriceSec: numEnv("KAIROS_CHAOS_STALE_PRICE_SEC"),
    forceSimulationFail: boolEnv("KAIROS_CHAOS_FORCE_SIMULATION_FAIL"),
  },
  isDevnet() {
    return config.cluster === "devnet";
  },
  simulateLanding: boolEnv("KAIROS_SIMULATE_LANDING") === true,
  /** SWAP_BUILDER=treasury (default, devnet) | program (on-chain kairos_router
   *  via Raydium CPMM — activates once the program is deployed + funded). */
  swapBuilder: (process.env.SWAP_BUILDER as "treasury" | "program") || "treasury",

  treasuryWallet:
    process.env.TREASURY_WALLET || "KairosTreasury111111111111111111111111111",
  relayerKeypair: Keypair.fromSeed(relayerSeed),
  killSwitchActive: false,
};
