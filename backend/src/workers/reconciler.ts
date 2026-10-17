import { PublicKey } from "@solana/web3.js";
import { config } from "../config";
import { repository } from "../db/repository";
import { Position } from "../db/schema";
import { getConnection } from "../chain/connection";
import { getTokenBalances } from "../chain/balances";
import {
  DUST_THRESHOLD_USDC,
  getAllKnownPositions,
  portfolioService,
  priceOf,
  resolveUsdcAsset,
} from "../services/portfolio.service";

/**
 * Reconciler worker (PFOLIO lane, contracts.md §10; PRD §4.5).
 *
 * Every RECONCILE_INTERVAL_MS (default 5 min): for every ACTIVE/MODIFIED
 * position, compare REAL on-chain token balances against the stored
 * last_known_amount:
 *   - a leg differing by > 0.5% (and >= dust in USD) → position MODIFIED
 *   - a previously-held leg that went to zero externally → position MODIFIED
 * MODIFIED positions get autoRebalance turned off, an audit entry with
 * before/after amounts (POSITION_MODIFIED_EXTERNALLY) and an outbox
 * "position.modified" event — all handled by portfolioService.markPositionModified.
 *
 * Changes within tolerance are absorbed: last_known_amount is updated so tiny
 * rounding differences never accumulate into a false positive.
 *
 * startReconciler() never crashes the process: the initial run and every tick
 * are guarded, errors are logged.
 */

/** Relative drift above which a leg counts as externally changed. */
const DRIFT_TOLERANCE = 0.005; // 0.5%

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

export interface ReconcileLegDiff {
  mint: string;
  lastKnownAmount: number;
  onChainAmount: number;
  deltaPct: number;
  valueDeltaUsdc: number;
  wentToZero: boolean;
}

export interface ReconcileSummary {
  ranAt: string;
  checked: number;
  modified: Array<{ positionId: string; walletAddress: string; reason: string; diffs: ReconcileLegDiff[] }>;
  absorbed: number;
  errors: Array<{ positionId: string; error: string }>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toUiAmount(rawBaseUnits: number, decimals: number): number {
  return Number((rawBaseUnits / Math.pow(10, decimals)).toFixed(Math.min(decimals, 9)));
}

/**
 * One reconciliation pass over every ACTIVE/MODIFIED position. Never throws:
 * per-position failures are captured in the summary.
 */
export async function runReconcilerOnce(): Promise<ReconcileSummary> {
  // Simulation mode has no on-chain truth source — comparing stored ledger
  // amounts against a real chain would falsely flag every position MODIFIED.
  if (config.simulateLanding) {
    return { ranAt: new Date().toISOString(), checked: 0, modified: [], absorbed: 0, errors: [] };
  }
  const summary: ReconcileSummary = {
    ranAt: new Date().toISOString(),
    checked: 0,
    modified: [],
    absorbed: 0,
    errors: [],
  };

  let positions: Position[];
  try {
    positions = (await getAllKnownPositions()).filter((p) => p.status === "ACTIVE" || p.status === "MODIFIED");
  } catch (err) {
    console.error(`[reconciler] failed to list positions: ${errMsg(err)}`);
    summary.errors.push({ positionId: "*", error: errMsg(err) });
    return summary;
  }

  const usdc = (await resolveUsdcAsset());

  for (const pos of positions) {
    if (pos.legs.length === 0) continue;
    summary.checked += 1;
    try {
      const mints = [...new Set([...pos.legs.map((l) => l.mint), usdc.mint])];
      const owner = new PublicKey(pos.walletAddress);
      const onChain = await getTokenBalances(
        getConnection(),
        owner,
        mints.map((m) => new PublicKey(m))
      );

      const diffs: ReconcileLegDiff[] = [];
      for (const leg of pos.legs) {
        const decimals = (await repository.getToken(leg.mint))?.decimals ?? 6;
        const raw = onChain[leg.mint] ?? 0;
        const onChainAmount = toUiAmount(raw, decimals);
        const lastKnown = leg.currentAmount;
        const price = (await priceOf(leg.mint));

        const valueDeltaUsdc = Number((Math.abs(onChainAmount - lastKnown) * price).toFixed(4));
        const relative =
          lastKnown > 0 ? Math.abs(onChainAmount - lastKnown) / lastKnown : onChainAmount > 0 ? Infinity : 0;
        const wentToZero = lastKnown > 0 && raw === 0;

        if (lastKnown === 0 && onChainAmount > 0 && onChainAmount * price >= DUST_THRESHOLD_USDC) {
          // Tokens appeared in an account we thought was empty → external transfer in.
          diffs.push({
            mint: leg.mint,
            lastKnownAmount: lastKnown,
            onChainAmount,
            deltaPct: Infinity,
            valueDeltaUsdc,
            wentToZero: false,
          });
        } else if (
          lastKnown > 0 &&
          raw > 0 &&
          relative > DRIFT_TOLERANCE &&
          valueDeltaUsdc >= DUST_THRESHOLD_USDC
        ) {
          diffs.push({
            mint: leg.mint,
            lastKnownAmount: lastKnown,
            onChainAmount,
            deltaPct: Number((relative * 100).toFixed(2)),
            valueDeltaUsdc,
            wentToZero: false,
          });
        } else if (wentToZero) {
          diffs.push({
            mint: leg.mint,
            lastKnownAmount: lastKnown,
            onChainAmount,
            deltaPct: 100,
            valueDeltaUsdc,
            wentToZero: true,
          });
        }

        // Absorb sub-tolerance drift so it never accumulates.
        if (diffs.find((d) => d.mint === leg.mint) === undefined) {
          leg.currentAmount = onChainAmount;
        }
      }

      if (diffs.length > 0) {
        const reason = `RECONCILER: ${diffs.length} leg(s) changed externally (${diffs
          .map((d) => `${d.mint}${d.wentToZero ? " went to zero" : ` ${d.deltaPct}%`}`)
          .join(", ")})`;
        (await portfolioService.markPositionModified(pos.id, reason, {
          before: {
            legs: diffs.map((d) => ({ mint: d.mint, lastKnownAmount: d.lastKnownAmount })),
          },
          after: {
            legs: diffs.map((d) => ({ mint: d.mint, onChainAmount: d.onChainAmount })),
            status: "MODIFIED",
            autoRebalance: false,
          },
        }));
        summary.modified.push({
          positionId: pos.id,
          walletAddress: pos.walletAddress,
          reason,
          diffs,
        });
        console.warn(`[reconciler] position ${pos.id} marked MODIFIED: ${reason}`);
      } else {
        // Re-price + persist absorbed amounts (values may still move with price).
        let total = 0;
        for (const leg of pos.legs) {
          leg.currentValueUsd = Number((leg.currentAmount * (await priceOf(leg.mint))).toFixed(2));
          total += leg.currentValueUsd;
        }
        pos.currentValueUsd = Number(total.toFixed(2));
        (await portfolioService.persistRefresh(pos));
        summary.absorbed += 1;
      }
    } catch (err) {
      summary.errors.push({ positionId: pos.id, error: errMsg(err) });
      console.error(`[reconciler] error reconciling position ${pos.id}: ${errMsg(err)}`);
    }
  }

  return summary;
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the reconciler loop: one guarded run immediately, then every
 * RECONCILE_INTERVAL_MS (default 5 min). Returns the interval handle so the
 * boot path can clear it on shutdown.
 */
export async function startReconciler(): Promise<ReturnType<typeof setInterval>> {
  const intervalMs = Number(process.env.RECONCILE_INTERVAL_MS) || DEFAULT_INTERVAL_MS;

  const tick = async () => {
    try {
      runReconcilerOnce()
        .then((summary) => {
          if (summary.modified.length > 0 || summary.errors.length > 0) {
            console.log(
              `[reconciler] pass done: checked=${summary.checked} modified=${summary.modified.length} absorbed=${summary.absorbed} errors=${summary.errors.length}`
            );
          }
        })
        .catch((err) => console.error(`[reconciler] run failed: ${errMsg(err)}`));
    } catch (err) {
      console.error(`[reconciler] tick failed: ${errMsg(err)}`);
    }
  };

  (await tick()); // initial run (guarded, non-blocking)
  timer = setInterval(tick, intervalMs);
  timer.unref?.(); // never keep the process alive just for the reconciler
  return timer;
}

/** Stop the loop (tests / graceful shutdown). */
export function stopReconciler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
