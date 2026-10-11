import { createHash } from "node:crypto";
import { repository } from "../db/repository";
import { config } from "../config";

/**
 * Pricing service (PRD §4.3, §4.7): live price resolution + snapshot recording.
 *
 * Live price source of record is the token registry (seeded from
 * devnet-state.json); the snapshot worker refreshes it every minute with a
 * deterministic ±0.1% jitter and appends price_snapshots rows (also the
 * backtest history). Price staleness matters only for the quote guard: a
 * snapshot older than the effective stale window means the feed stopped
 * updating — QUOTE_STALE. Chaos: KAIROS_CHAOS_STALE_PRICE_SEC forces the
 * window so the stale path is testable on demand (PRD §11.3).
 */

const DEFAULT_STALE_SEC = 300; // devnet snapshot cadence is 60 s

export interface LivePrice {
  priceUsd: number;
  ts: string;
  source: "snapshot" | "registry";
  stale: boolean;
  ageSec: number;
}

function effectiveStaleSec(): number {
  return config.chaos.stalePriceSec ?? DEFAULT_STALE_SEC;
}

function jitterFor(mint: string, minuteBucket: number): number {
  // Deterministic per (mint, minute) so restarts agree; range ±0.1%.
  const h = createHash("sha256").update(`${mint}:${minuteBucket}`).digest();
  const unit = h.readUInt16BE(0) / 0xffff; // 0..1
  return (unit - 0.5) * 0.002;
}

export function getLivePrice(mint: string): LivePrice {
  const token = repository.getToken(mint);
  if (!token) throw new Error(`TOKEN_NOT_FOUND:${mint}`);

  const latest = repository.latestPrice(mint);
  const now = Date.now();
  if (latest) {
    const ageSec = (now - new Date(latest.ts).getTime()) / 1000;
    // Recent snapshot wins; ancient snapshots (seeded backtest history) do not.
    if (ageSec >= 0 && ageSec <= DEFAULT_STALE_SEC * 2) {
      return {
        priceUsd: latest.priceUsd > 0 ? latest.priceUsd : token.priceUsd,
        ts: latest.ts,
        source: "snapshot",
        stale: ageSec > effectiveStaleSec(),
        ageSec: Math.round(ageSec),
      };
    }
  }
  // Registry price: the seeded "live" price on devnet (never stale by itself —
  // chaos forces staleness via KAIROS_CHAOS_STALE_PRICE_SEC + snapshot age).
  return { priceUsd: token.priceUsd, ts: new Date().toISOString(), source: "registry", stale: false, ageSec: 0 };
}

/** One snapshot per registry token: deterministic random walk + registry refresh. */
export function recordSnapshots(): number {
  const now = new Date();
  const minuteBucket = Math.floor(now.getTime() / 60_000);
  const tsIso = now.toISOString();
  let written = 0;
  for (const token of repository.getAllTokens()) {
    if (token.type === "stablecoin") continue; // USDC stays $1
    const next = Number((token.priceUsd * (1 + jitterFor(token.mint, minuteBucket))).toFixed(10));
    if (next <= 0) continue;
    repository.updateTokenPrice(token.mint, next);
    repository.addSnapshot(token.mint, tsIso, next, "kairos-sim");
    written++;
  }
  return written;
}

/**
 * Simple price-impact model for the quote guard (documented heuristic):
 * 0.05% impact per $1,000 of leg notional. Curators get the default 1% cap
 * (config.maxPriceImpactPct).
 */
export function priceImpactPct(notionalUsdc: number): number {
  return (notionalUsdc / 1000) * 0.05;
}

export const pricingService = { getLivePrice, recordSnapshots, priceImpactPct };
