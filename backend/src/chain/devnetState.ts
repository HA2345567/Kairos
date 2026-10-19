import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";
import { config } from "../config";
import type { DevnetState } from "../db/schema";

/**
 * Devnet state (contracts.md §5 DevnetState, §6 devnetState.ts).
 *
 * Mock token mints and the test treasury are derived deterministically from
 * labels so setup can recover after a devnet reset. The transaction relayer
 * is separate and must use a secret key from environment configuration.
 *
 * The DevnetState shape is owned by the DB lane (src/db/schema.ts) and
 * re-exported here for chain/ consumers.
 */

export type { DevnetState };
export type DevnetAssetState = DevnetState["assets"][number];

/** Exact deterministic keypair labels used by scripts/devnet-setup.ts. */
export const DEVNET_LABELS = {
  usdcMint: "kairos-devnet-usdc-v1",
  treasury: "kairos-devnet-treasury-v1",
  assetMint: (symbol: string) => `kairos-devnet-asset-${symbol}-v1`,
};

export function deterministicKeypair(label: string): Keypair {
  return Keypair.fromSeed(createHash("sha256").update(label).digest());
}

export function devnetStatePath(): string {
  const fromConfig = (config as { devnetStatePath?: string }).devnetStatePath;
  if (fromConfig) return fromConfig;
  const here = dirname(fileURLToPath(import.meta.url)); // backend/src/chain
  return join(here, "..", "..", "data", "devnet-state.json");
}

/** Read backend/data/devnet-state.json; null when missing/corrupt. */
export function loadDevnetState(): DevnetState | null {
  const p = devnetStatePath();
  try {
    if (!existsSync(p)) return null;
    const parsed = JSON.parse(readFileSync(p, "utf8")) as DevnetState;
    if (parsed?.cluster !== "devnet" || !parsed?.usdc?.mint || !Array.isArray(parsed?.assets)) {
      console.warn(`[chain] ${p} is not a valid DevnetState file; ignoring`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`[chain] failed to load ${p}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
