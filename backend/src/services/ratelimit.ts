// In-memory sliding-window rate-limit store (Lane A3 "AUTH").
//
// Single-process, Map-based, self-pruning:
//  - each key (routeId + client IP) holds the timestamps of the last allowed hits
//  - a hit is allowed while fewer than `max` timestamps fall inside the trailing window
//  - blocked requests are NOT recorded, so hammering a limiter never extends the window
//  - per-key pruning happens on every check; an amortized global sweep (every
//    SWEEP_EVERY checks) drops empty buckets so idle keys cannot leak memory
//
// middleware.ts stays thin by delegating here.

export interface RateLimitOptions {
  max: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Hits inside the current window (after this decision was applied). */
  count: number;
  /** For blocked requests: ms until the oldest hit leaves the window. */
  retryAfterMs: number;
}

interface Bucket {
  hits: number[];
  windowMs: number;
}

const buckets = new Map<string, Bucket>();

/** Longest window seen so far — the horizon for the amortized global sweep. */
let maxWindowMs = 0;
let opsSinceSweep = 0;
const SWEEP_EVERY = 1024;

function sweep(nowMs: number): void {
  const horizon = nowMs - maxWindowMs;
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => t >= horizon);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

function maybeSweep(nowMs: number): void {
  opsSinceSweep++;
  if (opsSinceSweep >= SWEEP_EVERY) {
    opsSinceSweep = 0;
    sweep(nowMs);
  }
}

/**
 * Record/evaluate one request against the sliding window for `key`.
 * Pure in-memory; deterministic under the optional `nowMs` (tests).
 */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
  nowMs: number = Date.now()
): RateLimitDecision {
  if (!Number.isFinite(max) || max < 1) {
    // A non-positive budget can never be reached legitimately; deny rather than
    // misbehave on a misconfigured route.
    return { allowed: false, count: 0, retryAfterMs: windowMs };
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    return { allowed: true, count: 0, retryAfterMs: 0 };
  }

  maxWindowMs = Math.max(maxWindowMs, windowMs);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [], windowMs };
    buckets.set(key, bucket);
  } else {
    bucket.windowMs = Math.max(bucket.windowMs, windowMs);
  }

  // Prune hits that left the trailing window.
  bucket.hits = bucket.hits.filter((t) => nowMs - t < windowMs);

  const allowed = bucket.hits.length < max;
  if (allowed) {
    bucket.hits.push(nowMs);
  }
  const retryAfterMs = allowed
    ? 0
    : bucket.hits.length > 0
      ? Math.max(0, bucket.hits[0] + windowMs - nowMs)
      : 0;

  maybeSweep(nowMs);
  return { allowed, count: bucket.hits.length, retryAfterMs };
}

/** Drop all rate-limit state (tests / admin resets). */
export function resetRateLimits(): void {
  buckets.clear();
  opsSinceSweep = 0;
}

/** Number of live buckets (observability/tests). */
export function rateLimitBucketCount(): number {
  return buckets.size;
}
