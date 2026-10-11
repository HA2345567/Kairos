import { KairosHttpServer } from "../server";
import { repository } from "../db/repository";
import { backtestService, BacktestWindow } from "../services/backtest.service";
import { rateLimit } from "../middleware";

/** /v1/tokens + /v1/baskets/* — registry & catalog reads (PRD §4.2, §6). */
export function registerCatalogRoutes(app: KairosHttpServer): void {
  const readGuard = rateLimit("catalog-read", { max: 120, windowMs: 60_000 });

  app.get("/v1/tokens", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    return { tokens: repository.getAllTokens() };
  });

  app.get("/v1/baskets", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    return { baskets: repository.getAllBaskets() };
  });

  app.get("/v1/baskets/:slug", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { slug } = req.params;
    const basket = repository.getBasketBySlug(slug);
    if (!basket) return reply.status(404).send({ error: "BASKET_NOT_FOUND" });
    const version = repository.getBasketVersion(basket.activeVersionId);
    return { basket, activeVersion: version ?? null };
  });

  app.get("/v1/baskets/:slug/performance", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { slug } = req.params;
    const basket = repository.getBasketBySlug(slug);
    if (!basket) return reply.status(404).send({ error: "BASKET_NOT_FOUND" });
    const { window } = req.query as { window?: string };
    try {
      if (window && backtestService.WINDOWS.includes(window as BacktestWindow)) {
        const result = backtestService.backtest(slug, window as BacktestWindow);
        return { ...result, seedPerformance: basket.performance };
      }
      const performance = backtestService.getPerformance(slug);
      return { ...performance, seedPerformance: basket.performance };
    } catch (err) {
      return reply.status(422).send({ error: "BACKTEST_UNAVAILABLE", message: (err as Error).message });
    }
  });

  app.get("/v1/baskets/:slug/rebalances", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { slug } = req.params;
    const basket = repository.getBasketBySlug(slug);
    if (!basket) return reply.status(404).send({ error: "BASKET_NOT_FOUND" });
    return { versions: repository.getVersionsForBasket(basket.id) };
  });
}
