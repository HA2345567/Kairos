import dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
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
  pythHermesUrl: string;
  pythApiKey: string;
  pythFeeds: Record<string, string>;
  pythPollMs: number;
  pythMaxAgeSec: number;
  jwtSecret: string;
  jwtAccessSec: 900;
  jwtRefreshSec: 604800;
  platformFeeBps: number; // PLATFORM_FEE_BPS ?? 20
  rebalanceFeeBps: number; // REBALANCE_FEE_BPS ?? 10, per side
  minBasketUsdc: number; // 25
  quoteValiditySec: number; // 60
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

function feeEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 0 || value > 75) {
    throw new Error(`${name} must be an integer between 0 and 75 basis points`);
  }
  return value;
}

function boolEnv(name: string): boolean | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return undefined;
  return raw === "1" || raw.toLowerCase() === "true";
}

function pythFeedMap(): Record<string, string> {
  const raw = process.env.PYTH_FEEDS_JSON;
  if (!raw) return {};
  let values: unknown;
  try {
    values = JSON.parse(raw);
  } catch {
    throw new Error("PYTH_FEEDS_JSON must be a JSON object mapping mint addresses to feed IDs.");
  }
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("PYTH_FEEDS_JSON must be a JSON object mapping mint addresses to feed IDs.");
  }
  return Object.fromEntries(Object.entries(values).map(([mint, value]) => {
    try {
      new PublicKey(mint);
    } catch {
      throw new Error(`PYTH_FEEDS_JSON contains an invalid mint: ${mint}`);
    }
    const feedId = String(value).replace(/^0x/i, "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(feedId)) throw new Error(`PYTH_FEEDS_JSON contains an invalid Pyth feed ID for ${mint}`);
    return [mint, `0x${feedId}`];
  }));
}

// backend/src -> backend/data (absolute, resolved from this module)
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(moduleDir, "..", ".env") });
const dataDir = path.resolve(
  process.env.KAIROS_DATA_DIR || path.join(moduleDir, "..", "data")
);

// Public, deterministic key material is permitted only for isolated tests.
const testRelayerSeed = new Uint8Array(32);
testRelayerSeed.fill(42);
const cluster = (process.env.SOLANA_NETWORK as Config["cluster"]) || "devnet";
const configuredJwtSecret = process.env.JWT_SECRET;
if (configuredJwtSecret?.startsWith("replace-")) throw new Error("Replace the JWT_SECRET example before starting Kairos.");
if (configuredJwtSecret && Buffer.byteLength(configuredJwtSecret) < 32) {
  throw new Error("JWT_SECRET must contain at least 32 bytes.");
}
if (cluster === "mainnet-beta" && !configuredJwtSecret) {
  throw new Error("JWT_SECRET must be configured before starting on mainnet.");
}
const jwtSecret = configuredJwtSecret || randomBytes(32).toString("base64url");
const isTestRuntime = process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);
const configuredRelayerSecret = process.env.RELAYER_KEYPAIR?.trim();
let relayerKeypair: Keypair;
if (configuredRelayerSecret) {
  try {
    const secretKey = bs58.decode(configuredRelayerSecret);
    if (secretKey.length !== 64) throw new Error("invalid length");
    relayerKeypair = Keypair.fromSecretKey(secretKey);
  } catch {
    throw new Error("RELAYER_KEYPAIR must be a base58-encoded 64-byte Solana secret key.");
  }
} else if (isTestRuntime) {
  relayerKeypair = Keypair.fromSeed(testRelayerSeed);
} else {
  throw new Error("RELAYER_KEYPAIR must be configured with a secret key outside tests.");
}
const pythFeeds = pythFeedMap();
const pythHermesUrl = (process.env.PYTH_HERMES_URL || "https://pyth.dourolabs.app/hermes").replace(/\/$/, "");
if (new URL(pythHermesUrl).protocol !== "https:") throw new Error("PYTH_HERMES_URL must use HTTPS.");

export const config: Config = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || "0.0.0.0",
  cluster,
  rpcUrl: process.env.SOLANA_RPC_URL || (process.env.HELIUS_API_KEY && !process.env.HELIUS_API_KEY.includes("replace")
    ? `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : "https://api.devnet.solana.com"),
  pythHermesUrl,
  pythApiKey: process.env.PYTH_API_KEY || "",
  pythFeeds,
  pythPollMs: Math.max(5_000, Math.floor(numEnv("PYTH_POLL_MS") ?? 15_000)),
  pythMaxAgeSec: Math.max(1, Math.floor(numEnv("PYTH_MAX_AGE_SEC") ?? 60)),
  // Provider keys come ONLY from gitignored env (never tracked files).
  // With HELIUS_API_KEY set, the failover endpoint is Helius; otherwise the
  // fallback is the public endpoint (withFailover then acts as a retry).
  fallbackRpcUrl:
    process.env.SOLANA_FALLBACK_RPC_URL ||
    "https://api.devnet.solana.com",
  jwtSecret,
  jwtAccessSec: 900,
  jwtRefreshSec: 604800,
  platformFeeBps: feeEnv("PLATFORM_FEE_BPS", 20),
  rebalanceFeeBps: feeEnv("REBALANCE_FEE_BPS", 10),
  minBasketUsdc: 25,
  quoteValiditySec: 60,
  stalePriceSec: 60,
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
  relayerKeypair,
  killSwitchActive: false,
};
