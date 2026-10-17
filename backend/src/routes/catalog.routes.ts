import { KairosHttpServer } from "../server";
import { repository } from "../db/repository";
import { backtestService, BacktestWindow } from "../services/backtest.service";
import { rateLimit } from "../middleware";

/** /v1/tokens + /v1/baskets/* — registry & catalog reads (PRD §4.2, §6). */
export function registerCatalogRoutes(app: KairosHttpServer): void {
  const readGuard = rateLimit("catalog-read", { max: 120, windowMs: 60_000 });
  const withComposition = async (basket: NonNullable<Awaited<ReturnType<typeof repository.getBasketBySlug>>>) => {
    const activeVersion = (await repository.getBasketVersion(basket.activeVersionId)) ?? null;
    const tokens = (await Promise.all((activeVersion?.legs ?? []).map(async (leg) => {
      const token = (await repository.getToken(leg.mint));
      return token ? [{ ...token, weightBps: leg.weightBps }] : [];
    }))).flat();
    return { ...basket, activeVersion, tokens };
  };

  app.get("/v1/tokens", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    return { tokens: (await repository.getAllTokens()) };
  });

  app.get("/v1/baskets", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    return { baskets: await Promise.all((await repository.getAllBaskets()).map(withComposition)) };
  });

  app.get("/v1/baskets/:slug", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { slug } = req.params;
    const basket = (await repository.getBasketBySlug(slug));
    if (!basket) return reply.status(404).send({ error: "BASKET_NOT_FOUND" });
    const composed = (await withComposition(basket));
    return { basket, activeVersion: composed.activeVersion, tokens: composed.tokens };
  });

  app.get("/v1/baskets/:slug/performance", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { slug } = req.params;
    const basket = (await repository.getBasketBySlug(slug));
    if (!basket) return reply.status(404).send({ error: "BASKET_NOT_FOUND" });
    const { window } = req.query as { window?: string };
    try {
      if (window && backtestService.WINDOWS.includes(window as BacktestWindow)) {
        const result = (await backtestService.backtest(slug, window as BacktestWindow));
        return result;
      }
      return (await backtestService.getPerformance(slug));
    } catch (err) {
      return reply.status(422).send({ error: "BACKTEST_UNAVAILABLE", message: (err as Error).message });
    }
  });

  app.get("/v1/baskets/:slug/nav-history", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { slug } = req.params;
    const basket = (await repository.getBasket(slug)) ?? (await repository.getBasketBySlug(slug));
    if (!basket) return reply.status(404).send({ error: "BASKET_NOT_FOUND" });

    try {
      const result = (await backtestService.backtest(basket.slug, "3Y"));
      return {
        history: result.series.map(({ ts, value }) => ({ timestamp: Date.parse(ts), navValue: value })),
        benchmarkHistory: [],
        returnPct: result.returnPct,
        benchmarkReturnPct: result.benchmarkReturnPct,
        alphaPct: result.alphaPct,
        benchmarkLabel: result.benchmarkLabel,
        isHypothetical: result.isHypothetical,
        disclaimer: result.disclaimer,
      };
    } catch (err) {
      return reply.status(422).send({ error: "BACKTEST_UNAVAILABLE", message: (err as Error).message });
    }
  });

  app.get("/v1/baskets/:slug/rebalances", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { slug } = req.params;
    const basket = (await repository.getBasketBySlug(slug));
    if (!basket) return reply.status(404).send({ error: "BASKET_NOT_FOUND" });
    return { versions: (await repository.getVersionsForBasket(basket.id)) };
  });
}
