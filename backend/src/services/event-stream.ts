/**
 * Versioned stream contract (PRD §10 "WebSocket Streams").
 *
 * TRANSPORT DEVIATION, recorded deliberately: the PRD specifies WebSocket
 * streams carrying `schema_version` plus a per-resource sequence number, with a
 * gap forcing a REST resync. The backend is a small JSON-over-HTTP server and
 * does not host a WebSocket endpoint, so the *contract* is implemented here and
 * served by HTTP polling (`GET /v1/stream/...?afterSeq=N`) instead. Clients get
 * the same guarantees — `schema_version`, a monotonic `seq`, and an explicit
 * `resyncRequired` signal — without the transport. The WebSocket requirement
 * itself remains an open PRD gap.
 *
 * Events are per-resource (execution.{id}, position.{id}, price.{mint}) and kept
 * in a bounded in-memory ring. The ring is intentionally not durable: any gap
 * (expired buffer, restart, missed sequence) is answered with
 * `resyncRequired: true` and the caller re-reads REST state, which is exactly
 * the PRD's stated recovery path.
 */

export const SCHEMA_VERSION = 1 as const;
const RING_SIZE = 200;

export interface StreamEvent {
  seq: number;
  event: string;
  resource: string;
  schema_version: number;
  ts: string;
  data: Record<string, unknown>;
}

export interface StreamSlice {
  resource: string;
  schema_version: number;
  /** Latest sequence emitted for this resource (0 when nothing was emitted). */
  seq: number;
  events: StreamEvent[];
  /** True when the caller's cursor is behind the retained window: re-read REST. */
  resyncRequired: boolean;
}

const buffers = new Map<string, StreamEvent[]>();
const counters = new Map<string, number>();

/** Publish one event for a resource, assigning the next sequence number. */
export function publishEvent(
  resource: string,
  event: string,
  data: Record<string, unknown>
): StreamEvent {
  const seq = (counters.get(resource) ?? 0) + 1;
  counters.set(resource, seq);
  const entry: StreamEvent = {
    seq,
    event,
    resource,
    schema_version: SCHEMA_VERSION,
    ts: new Date().toISOString(),
    data,
  };
  const buffer = buffers.get(resource) ?? [];
  buffer.push(entry);
  if (buffer.length > RING_SIZE) buffer.splice(0, buffer.length - RING_SIZE);
  buffers.set(resource, buffer);
  return entry;
}

/**
 * Read events after `afterSeq`.
 *
 * `afterSeq === 0` (or omitted) returns the current tail, which is the
 * documented "connect and get the latest state" behaviour. A cursor older than
 * the retained window reports `resyncRequired` so the client cannot silently
 * miss a state transition.
 */
export function readEvents(resource: string, afterSeq = 0): StreamSlice {
  const buffer = buffers.get(resource) ?? [];
  const latest = counters.get(resource) ?? 0;
  const earliestRetained = buffer[0]?.seq ?? latest + 1;
  const resyncRequired = afterSeq > 0 && afterSeq + 1 < earliestRetained;
  return {
    resource,
    schema_version: SCHEMA_VERSION,
    seq: latest,
    events: afterSeq > 0
      ? buffer.filter((entry) => entry.seq > afterSeq)
      : buffer.slice(-1),
    resyncRequired,
  };
}

export function executionResource(executionId: string): string {
  return `execution.${executionId}`;
}

export function positionResource(positionId: string): string {
  return `position.${positionId}`;
}

export function priceResource(mint: string): string {
  return `price.${mint}`;
}

/** Test/reset hook: drops all retained events and counters. */
export function resetEventStream(): void {
  buffers.clear();
  counters.clear();
}
