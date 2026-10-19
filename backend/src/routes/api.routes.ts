import { KairosHttpServer, RouteHandler } from "../server";
import { AppError } from "../errors";
import { registerAuthRoutes } from "./auth.routes";
import { registerCatalogRoutes } from "./catalog.routes";
import { registerTradeRoutes } from "./trade.routes";
import { registerAdminRoutes } from "./admin.routes";
import { registerAgentRoutes } from "./agent.routes";
import { registerStreamRoutes } from "./stream.routes";
import { registerLabsRoutes } from "./labs.routes";
import { registerAnalyticsRoutes } from "./analytics.routes";
import { registerEligibilityRoutes } from "./eligibility.routes";

/**
 * Route aggregator (contracts §12). Wraps every handler so thrown AppErrors
 * map to their HTTP status + typed error code instead of a blanket 500 —
 * the PRD requires typed codes (QUOTE_EXPIRED, SLIPPAGE_EXCEEDED, …).
 */
function wrap(handler: RouteHandler): RouteHandler {
  return async (req, reply) => {
    try {
      return await handler(req, reply);
    } catch (err) {
      const appErr = AppError.from(err);
      if (appErr.status && appErr.status >= 400) {
        reply.status(appErr.status).send({ error: appErr.code, message: appErr.message });
        return;
      }
      console.error(`[api] unhandled error on ${req.params ? "" : ""}:`, err);
      reply.status(500).send({ error: "INTERNAL_SERVER_ERROR", message: appErr.message });
      return;
    }
  };
}

function withErrorMapping(app: KairosHttpServer): KairosHttpServer {
  const register = (method: "get" | "post" | "put" | "delete") => (path: string, handler: RouteHandler) =>
    app[method](path, wrap(handler));
  return {
    ...app,
    get: register("get"),
    post: register("post"),
    put: register("put"),
    delete: register("delete"),
  } as KairosHttpServer;
}

export function registerRoutes(app: KairosHttpServer): void {
  const wrapped = withErrorMapping(app);
  registerAuthRoutes(wrapped);
  registerCatalogRoutes(wrapped);
  registerTradeRoutes(wrapped);
  registerAdminRoutes(wrapped);
  registerAgentRoutes(wrapped);
  registerStreamRoutes(wrapped);
  registerLabsRoutes(wrapped);
  registerAnalyticsRoutes(wrapped);
  registerEligibilityRoutes(wrapped);
}
