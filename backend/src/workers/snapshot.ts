import { recordSnapshots } from "../services/pricing.service";

/**
 * Snapshot worker (PRD §4.3): minute-cadence price snapshots so charts,
 * staleness guards and backtests have fresh data on devnet.
 */

const SNAPSHOT_INTERVAL_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let runs = 0;

export function startSnapshotWorker(): void {
  if (timer) return;
  timer = setInterval(() => {
    try {
      const written = recordSnapshots();
      runs++;
      if (runs % 10 === 1) console.log(`[snapshots] run ${runs}: ${written} prices recorded`);
    } catch (err) {
      console.error("[snapshots] run failed:", (err as Error).message);
    }
  }, SNAPSHOT_INTERVAL_MS);
  console.log(`[snapshots] worker started (interval ${SNAPSHOT_INTERVAL_MS / 1000}s)`);
}
