import { createHash, randomUUID } from "node:crypto";
import { KairosHttpServer } from "../server";
import { repository } from "../db/repository";
import { authService } from "../services/auth.service";
import { rateLimit } from "../middleware";
import { config } from "../config";

/**
 * FE-09 / NFR-12 anonymized page-view analytics.
 *
 * The PRD allows "anonymized page-view events only (no PII)". This endpoint
 * therefore:
 *   - accepts a closed allow-list of event names;
 *   - stores the path only after stripping query strings and ids are hashed;
 *   - never reads or stores the client IP, user agent, or wallet address
 *     (the wallet, when signed in, is folded into a salted hash so a single
 *     session can be counted without being identified);
 *   - is fire-and-forget: analytics failures never break a page.
 */

const ALLOWED_EVENTS = new Set([
  "page_view",
  "basket_view",
  "invest_started",
  "invest_submitted",
  "position_view",
  "settings_view",
  "labs_view",
  "simulation_run",
]);

function pathOnly(raw: unknown): string {
  const value = typeof raw === "string" ? raw : "/";
  const withoutQuery = value.split("?")[0].split("#")[0];
  // Collapse id-bearing segments so no wallet/position/execution id is stored.
  return withoutQuery
    .split("/")
    .map((segment) => (/^[A-Za-z0-9_-]{16,}$/.test(segment) ? ":id" : segment))
    .join("/")
    .slice(0, 200) || "/";
}

function sessionHash(req: { headers: Record<string, string | string[] | undefined> }): string {
  const auth = authService.requireAuth(req);
  const raw =
    auth?.walletAddress ||
    (typeof req.headers["x-analytics-session"] === "string" ? req.headers["x-analytics-session"] : "") ||
    randomUUID();
  return createHash("sha256").update(`${config.jwtSecret}:analytics:${raw}`).digest("hex").slice(0, 32);
}

export function registerAnalyticsRoutes(app: KairosHttpServer): void {
  const guard = rateLimit("analytics", { max: 600, windowMs: 60_000 });

  app.post("/v1/analytics/page-view", async (req, reply) => {
    if (!guard(req, reply)) return;
    const { name, path, region } = (req.body || {}) as {
      name?: string;
      path?: string;
      region?: string;
    };
    const event = typeof name === "string" && ALLOWED_EVENTS.has(name) ? name : "page_view";
    await repository.recordAnalyticsEvent({
      name: event,
      path: pathOnly(path),
      region: typeof region === "string" ? region.slice(0, 4) : null,
      sessionHash: sessionHash(req),
    });
    return reply.status(202).send({ accepted: true });
  });
}
