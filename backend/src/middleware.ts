// HTTP middleware guards (Lane A3 "AUTH") — contracts.md §8.
//
// Designed for the custom server's route-handler shapes (src/server.ts):
//   req   = { params, query, body, headers }
//   reply = { status(code) -> { send(data) }, send(data) }
//
// Usage inside a route handler (wired by the GLUE lane):
//
//   const nonceLimiter = rateLimit("auth-nonce", { max: 5, windowMs: 60_000 });
//   app.post("/v1/auth/nonce", async (req, reply) => {
//     if (!nonceLimiter(req, reply)) return;          // 429 already sent
//     if (!geoCheck(req, reply)) return;              // 403 already sent
//     ...
//   });

import { checkRateLimit, type RateLimitOptions } from "./services/ratelimit";
import { authService } from "./services/auth.service";
import { config } from "./config";

// Structural types matching the custom server's req/reply (server.ts RouteHandler).
// Kept local + minimal so this module has no runtime dependency on the server.
export interface MiddlewareRequest {
  headers: Record<string, string | string[] | undefined>;
}

export interface MiddlewareReply {
  status(code: number): { send(data: any): any };
  send(data: any): any;
}

export type RateLimitGuard = (req: MiddlewareRequest, reply: MiddlewareReply) => boolean;

/** Sanctioned regions blocked at the edge (PRD §10) — ISO 3166-1 alpha-2.
 *  Configurable so the list can be widened without a code change. */
export const RESTRICTED_REGIONS: readonly string[] = config.restrictedRegions;

function headerValue(req: MiddlewareRequest, name: string): string | undefined {
  const raw =
    req.headers[name] ?? req.headers[name.toLowerCase()] ?? req.headers[name.toUpperCase()];
  const candidate = raw ?? Object.entries(req.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  if (typeof candidate === "string") return candidate;
  if (Array.isArray(candidate) && typeof candidate[0] === "string") return candidate[0];
  return undefined;
}

/**
 * Best-effort client IP. The custom server does not surface the socket address,
 * so we fall back to x-forwarded-for (first hop) and finally "local".
 */
export function clientIp(req: MiddlewareRequest): string {
  const xff = headerValue(req, "x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  return "local";
}

/**
 * Build a per-route rate-limit guard. The guard returns true when the request
 * is allowed; when over limit it answers the reply itself with
 * 429 { error: "RATE_LIMITED" } and returns false.
 *
 * Keyed by `routeId + client IP`; in-memory sliding window (single process).
 */
/**
 * Per-wallet budget guard (PRD §10: prepares are budgeted per wallet, not per IP).
 *
 * The wallet comes from the authenticated session, so an unauthenticated request
 * passes through and is answered by the handler's own 401/400 — the guard never
 * becomes a way to probe which wallets exist.
 */
export function walletRateLimit(routeId: string, opts: RateLimitOptions): RateLimitGuard {
  return (req, reply) => {
    const walletAddress = authService.requireAuth(req)?.walletAddress;
    if (!walletAddress) return true;
    const decision = checkRateLimit(`wallet:${routeId}:${walletAddress}`, opts.max, opts.windowMs);
    if (!decision.allowed) {
      reply.status(429).send({ error: "RATE_LIMITED" });
      return false;
    }
    return true;
  };
}

export function rateLimit(routeId: string, opts: RateLimitOptions): RateLimitGuard {
  return (req, reply) => {
    const ip = clientIp(req);
    const decision = checkRateLimit(`${routeId}:${ip}`, opts.max, opts.windowMs);
    if (!decision.allowed) {
      reply.status(429).send({ error: "RATE_LIMITED" });
      return false;
    }
    return true;
  };
}

/**
 * Geo gate (PRD §10): requests declaring a restricted region via the
 * `x-region` header are answered with 403 { error: "REGION_BLOCKED" }.
 * Missing/unknown headers are allowed by default. Returns true when allowed.
 */
export function geoCheck(req: MiddlewareRequest, reply: MiddlewareReply): boolean {
  const region = headerValue(req, "x-region");
  if (region && RESTRICTED_REGIONS.includes(region.trim().toUpperCase())) {
    reply.status(403).send({ error: "REGION_BLOCKED" });
    return false;
  }
  return true;
}

/**
 * Require the PRD's canonical Idempotency-Key header for money mutations.
 *
 * Existing callers may continue to include the legacy body `idempotencyKey`,
 * but only as a compatibility echo: the header is still mandatory and the
 * values must match exactly. The normalized header value is always returned
 * to the route, so a body-only key can never weaken the header contract.
 */
export function requireIdempotencyKey(
  req: MiddlewareRequest,
  reply: MiddlewareReply,
  bodyKey?: unknown,
): string | null {
  const headerKey = headerValue(req, "idempotency-key")?.trim();
  if (!headerKey) {
    reply.status(400).send({ error: "MISSING_IDEMPOTENCY_KEY" });
    return null;
  }
  if (bodyKey !== undefined && bodyKey !== headerKey) {
    reply.status(400).send({ error: "IDEMPOTENCY_KEY_MISMATCH" });
    return null;
  }
  return headerKey;
}
