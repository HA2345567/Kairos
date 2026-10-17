import { repository } from "../db/repository";

/**
 * Outbox worker (PRD §4.9): drains the outbox table and "delivers" events.
 * Devnet transport is the structured console log — the interface (claim →
 * deliver → mark sent) is what matters; a real email/push/Telegram transport
 * plugs in here later. Rows persist across crashes (at-least-once delivery).
 */

const POLL_INTERVAL_MS = 2_000;

let timer: ReturnType<typeof setInterval> | null = null;

async function drainOnce(): Promise<number> {
  const events = (await repository.claimOutbox(20));
  for (const evt of events) {
    console.log(`[outbox] deliver event=${evt.event} payload=${JSON.stringify(evt.payload).slice(0, 300)}`);
    (await repository.markOutboxSent(evt.id));
  }
  return events.length;
}

export function startOutboxWorker(): void {
  if (timer) return;
  timer = setInterval(async () => {
    await drainOnce().catch((err) => console.error("[outbox] drain failed:", err));
  }, POLL_INTERVAL_MS);
  console.log(`[outbox] worker started (interval ${POLL_INTERVAL_MS}ms)`);
}

export { drainOnce as drainOutboxOnce };
