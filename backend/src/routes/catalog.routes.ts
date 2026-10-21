import { KairosHttpServer } from "../server";
import { repository } from "../db/repository";
import { backtestService, BacktestWindow } from "../services/backtest.service";
import { verifyRegistryVersion } from "../chain/registry";
import { rateLimit } from "../middleware";
import { getBasketMarketData, getBasketMarketNavHistory, MarketNavWindow } from "../services/market-data.service";
import { getTokenMarketPrices } from "../services/market-reference-prices.service";

/** /v1/tokens + /v1/baskets/* — registry & catalog reads (PRD §4.2, §6). */

/**
 * Cursor pagination (PRD §10: `limit` + `after`). Rows are ordered by the
 * cursor key, `after` is the previous page's `nextCursor`, and a null cursor
 * means the page is the last one. Absent `limit` keeps the historical
 * "return everything" behaviour so existing callers are unaffected.
 */
function paginate<T>(
  rows: T[],
  limit: string | undefined,
  after: string | undefined,
  key: (row: T) => string
): { page: T[]; nextCursor: string | null } {
  const sorted = [...rows].sort((a, b) => key(a).localeCompare(key(b)));
  const remaining = after ? sorted.filter((row) => key(row) > after) : sorted;
  const requested = Math.floor(Number(limit));
  const size = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 100) : remaining.length;
  const page = remaining.slice(0, size);
  const last = page[page.length - 1];
  return { page, nextCursor: remaining.length > page.length && last ? key(last) : null };
}

export function registerCatalogRoutes(app: KairosHttpServer): void {
  const readGuard = rateLimit("catalog-read", { max: 600, windowMs: 60_000 }); // PRD §10: 600 reads / IP / min
  /**
   * Batch composition (NFR-02). One query per table for the whole page instead
   * of a version + leg-token query per basket, which is what pushed a single
   * `/v1/baskets` read to ~1.9 s p95 against a networked database.
   */
  const composeMany = async (
    baskets: Array<NonNullable<Awaited<ReturnType<typeof repository.getBasketBySlug>>>>
  ) => {
    if (baskets.length === 0) return [];
    // Versions (with legs) and the token registry are independent reads, so
    // they share round trip two — the route read is 2 round trips end to end.
    const [versions, tokens] = await Promise.all([
      repository.getBasketVersions(baskets.map((basket) => basket.activeVersionId)),
      repository.getAllTokensIncludingDenylisted(),
    ]);
    const versionById = new Map(versions.map((version) => [version.id, version]));
    const tokenByMint = new Map(tokens.map((token) => [token.mint, token]));

    return baskets.map((basket) => {
      const activeVersion = versionById.get(basket.activeVersionId) ?? null;
      const composed = (activeVersion?.legs ?? [])
        .map((leg) => {
          const token = tokenByMint.get(leg.mint);
          return token ? [{ ...token, weightBps: leg.weightBps }] : [];
        })
        .flat();
      return { ...basket, activeVersion, tokens: composed };
    });
  };

  const withComposition = async (basket: NonNullable<Awaited<ReturnType<typeof repository.getBasketBySlug>>>) =>
    (await composeMany([basket]))[0];

  app.get("/v1/tokens", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { type, denylisted, backtestable, limit, after } = req.query as {
      type?: string;
      denylisted?: string;
      backtestable?: string;
      limit?: string;
      after?: string;
    };
    // Default (no `denylisted` filter) keeps the historical behaviour of hiding
    // denylisted mints; `denylisted=true|all` is an explicit registry read.
    let tokens =
      denylisted === "true" || denylisted === "all"
        ? (await repository.getAllTokensIncludingDenylisted())
        : (await repository.getAllTokens());
    if (type) tokens = tokens.filter((token) => token.type === type);
    if (backtestable === "true" || backtestable === "false") {
      tokens = tokens.filter((token) => String(token.backtestable) === backtestable);
    }
    if (denylisted === "true" || denylisted === "false") {
      tokens = tokens.filter((token) => String(token.denylisted) === denylisted);
    }
    const { page, nextCursor } = paginate(tokens, limit, after, (token) => token.mint);
    return { tokens: page, nextCursor };
  });

  /** Allowlisted mainnet market references for Devnet token display. */
  app.get("/v1/market/prices", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { mints } = req.query as { mints?: unknown };
    if (typeof mints !== "string") return reply.status(400).send({ error: "INVALID_MARKET_MINTS" });
    const requested = [...new Set(mints.split(",").filter(Boolean))];
    if (!requested.length || requested.length > 30 || requested.some((mint) => !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint))) {
      return reply.status(400).send({ error: "INVALID_MARKET_MINTS" });
    }
    return { prices: await getTokenMarketPrices(requested) };
  });

  app.get("/v1/baskets", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { category, limit, after } = req.query as {
      category?: string;
      limit?: string;
      after?: string;
    };
    let baskets = await repository.getAllBaskets();
    if (category) baskets = baskets.filter((basket) => basket.category === category);
    const { page, nextCursor } = paginate(baskets, limit, after, (basket) => basket.slug);
    return { baskets: await composeMany(page), nextCursor };
  });

  app.get("/v1/baskets/:slug", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { slug } = req.params;
    const basket = (await repository.getBasketBySlug(slug));
    if (!basket) return reply.status(404).send({ error: "BASKET_NOT_FOUND" });
    const composed = (await withComposition(basket));
    return { basket, activeVersion: composed.activeVersion, tokens: composed.tokens };
  });

  app.get("/v1/baskets/:slug/market-data", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { slug } = req.params;
    const basket = await repository.getBasketBySlug(slug);
    if (!basket) return reply.status(404).send({ error: "BASKET_NOT_FOUND" });
    const composed = await withComposition(basket);
    return getBasketMarketData(composed.tokens);
  });

  app.get("/v1/baskets/:slug/market-nav-history", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { slug } = req.params;
    const basket = await repository.getBasketBySlug(slug);
    if (!basket) return reply.status(404).send({ error: "BASKET_NOT_FOUND" });
    const { window = "1Y" } = req.query as { window?: string };
    const supportedWindows: MarketNavWindow[] = ["1W", "1M", "6M", "1Y", "3Y"];
    if (!supportedWindows.includes(window as MarketNavWindow)) {
      return reply.status(400).send({ error: "INVALID_HISTORY_WINDOW", supportedWindows });
    }
    const composed = await withComposition(basket);
    return getBasketMarketNavHistory(composed.tokens, window as MarketNavWindow);
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

  /**
   * FR-27 annotation layer, served as a superset of the §19 glossary rows:
   * `news`/`event` annotations plus `checkpoint`, `incentive` and
   * `liquidation` entries attached to the basket (optionally per version).
   */
  app.get("/v1/baskets/:slug/annotations", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { slug } = req.params;
    const { versionId } = req.query as { versionId?: string };
    const basket = (await repository.getBasketBySlug(slug));
    if (!basket) return reply.status(404).send({ error: "BASKET_NOT_FOUND" });
    const annotations = await repository.listAnnotations(basket.id, versionId);
    return {
      annotations,
      byKind: {
        news: annotations.filter((a) => a.kind === "news"),
        event: annotations.filter((a) => a.kind === "event"),
        checkpoint: annotations.filter((a) => a.kind === "checkpoint"),
        incentive: annotations.filter((a) => a.kind === "incentive"),
        liquidation: annotations.filter((a) => a.kind === "liquidation"),
      },
    };
  });

  /**
   * FR-24 read side: recompute the legs hash from the displayed composition and
   * compare it with `kairos_registry` on-chain. When the program is not
   * deployed (the current devnet state) this reports `verified: false` with an
   * explicit reason rather than pretending.
   */
  app.get("/v1/baskets/:slug/registry", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { slug } = req.params;
    const basket = (await repository.getBasketBySlug(slug));
    if (!basket) return reply.status(404).send({ error: "BASKET_NOT_FOUND" });
    const version = await repository.getBasketVersion(basket.activeVersionId);
    if (!version) return reply.status(404).send({ error: "BASKET_VERSION_NOT_FOUND" });
    const verification = await verifyRegistryVersion(basket.id, version.version, version.legs);
    return {
      basketId: basket.id,
      versionId: version.id,
      version: version.version,
      registryTx: version.registryTx ?? null,
      storedLegsHash: version.legsHash ?? null,
      ...verification,
    };
  });
}
