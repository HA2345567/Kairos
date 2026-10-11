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

/** Sanctioned regions blocked at the edge (PRD §10) — ISO 3166-1 alpha-2. */
export const RESTRICTED_REGIONS: readonly string[] = ["KP", "IR", "CU", "SY"];

function headerValue(req: MiddlewareRequest, name: string): string | undefined {
  const raw =
    req.headers[name] ?? req.headers[name.toLowerCase()] ?? req.headers[name.toUpperCase()];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
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
