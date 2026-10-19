import { config } from "../config";
import { repository } from "../db/repository";
import { notificationsService } from "../services/notifications.service";

/**
 * Outbox worker (PRD §4.9): claims durable rows, hands them to an explicit
 * transport, and acknowledges only a positive transport response. A console
 * write is diagnostic output; it is not used by the worker as delivery proof.
 */

const POLL_INTERVAL_MS = 2_000;

export interface OutboxDelivery {
  id: string;
  event: string;
  payload: unknown;
  attempts: number;
  leaseUntilMs: number;
  leaseToken: string;
}

export type OutboxTransportAck = boolean | { acknowledged: boolean; transport?: string };

export interface OutboxTransport {
  deliver(event: OutboxDelivery): Promise<OutboxTransportAck>;
}

/**
 * The devnet transport is intentionally local and observable. Its returned
 * acknowledgement represents acceptance by this local transport, while the
 * log remains useful diagnostics. Production transports can replace it without
 * changing claim, lease, or persistence semantics.
 */
export const devnetLocalOutboxTransport: OutboxTransport = {
  async deliver(event) {
    console.log(
      `[outbox:devnet-local] deliver event=${event.event} payload=${JSON.stringify(event.payload).slice(0, 300)}`
    );
    return { acknowledged: true, transport: "devnet-local" };
  },
};

let transport: OutboxTransport | undefined = config.isDevnet() ? devnetLocalOutboxTransport : undefined;

/** Configure a transport, or pass null to leave claimed rows pending. */
export function setOutboxTransport(next: OutboxTransport | null): void {
  transport = next ?? undefined;
}

function acknowledged(result: OutboxTransportAck): boolean {
  return result === true || (typeof result === "object" && result.acknowledged === true);
}

/** Best-effort wallet extraction from an outbox payload (execution status events). */
function executionWalletOf(payload: unknown): string | null {
  let candidate = payload;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const record = candidate as Record<string, unknown>;
  const wallet = record.walletAddress ?? record.wallet_address ?? record.wallet;
  return typeof wallet === "string" && wallet.length > 0 ? wallet : null;
}

async function drainOnce(): Promise<number> {
  const events = await repository.claimOutbox(20);
  for (const event of events) {
    if (!transport) continue;
    try {
      // FR-18 preferences: a wallet that muted in-app/execution updates keeps
      // the exactly-once ledger row but is not interrupted. Delivery failure
      // here must never block the queue, so preference lookup is best-effort.
      try {
        const walletAddress = executionWalletOf(event.payload);
        if (walletAddress) {
          const prefs = await repository.getNotificationPreferences(walletAddress);
          if (
            !prefs.inApp ||
            !notificationsService.interestedInClass(prefs, notificationsService.classifyEvent(event.event))
          ) {
            await repository.acknowledgeOutbox(event.id, event.leaseToken);
            continue;
          }
        }
      } catch (err) {
        console.warn(`[outbox] preference lookup failed id=${event.id}:`, err);
      }
      const result = await transport.deliver(event);
      if (!acknowledged(result)) {
        console.warn(`[outbox] transport did not acknowledge id=${event.id}; leaving pending`);
        continue;
      }
      const delivered = await repository.acknowledgeOutbox(event.id, event.leaseToken);
      if (!delivered) {
        console.warn(`[outbox] lease lost before acknowledgement id=${event.id}; leaving pending`);
      }
    } catch (err) {
      // Keep the lease until it expires so a crash or transient transport
      // failure cannot cause duplicate work within the same lease.
      console.error(`[outbox] delivery failed id=${event.id}:`, err);
    }
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

let timer: ReturnType<typeof setInterval> | null = null;

export { drainOnce as drainOutboxOnce };
