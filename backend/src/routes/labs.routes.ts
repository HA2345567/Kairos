import { KairosHttpServer } from "../server";
import { repository } from "../db/repository";
import { labsService } from "../services/labs.service";
import { authService } from "../services/auth.service";
import { rateLimit } from "../middleware";
import { AppError } from "../errors";
import { getBasketMarketNavHistory, MarketNavWindow } from "../services/market-data.service";

type Reply = { status(code: number): { send(data: unknown): unknown } };

function requireWallet(req: { headers: Record<string, string | string[] | undefined> }, reply: Reply): string | null {
  const auth = authService.requireAuth(req);
  if (!auth?.walletAddress) {
    reply.status(401).send({ error: "UNAUTHORIZED" });
    return null;
  }
  return auth.walletAddress;
}

/**
 * /v1/labs/* — FR-25 UGC basket creation, community voting and comments.
 *
 * Reads are public (a visitor can browse Labs); creating, voting and commenting
 * require a wallet session. Moderation and promotion are admin-only and live in
 * admin.routes.ts. All state is durable — nothing here is browser-local.
 */
export function registerLabsRoutes(app: KairosHttpServer): void {
  const readGuard = rateLimit("labs-read", { max: 600, windowMs: 60_000 });
  const writeGuard = rateLimit("labs-write", { max: 30, windowMs: 60_000 });

  app.get("/v1/labs/baskets", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { status, limit } = req.query as { status?: string; limit?: string };
    let baskets = await repository.listLabsBaskets(status);
    // Only submitted/approved/promoted ideas are public. Drafts and rejected
    // submissions remain moderator-only.
    baskets = baskets.filter((basket) =>
      basket.status === "submitted" || basket.status === "approved" || basket.status === "promoted"
    );
    const requested = Math.floor(Number(limit));
    if (Number.isFinite(requested) && requested > 0) baskets = baskets.slice(0, Math.min(requested, 100));
    return { labsBaskets: baskets };
  });

  app.get("/v1/labs/baskets/:slug", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const basket = await repository.getLabsBasket(req.params.slug);
    if (!basket || !["submitted", "approved", "promoted"].includes(basket.status)) {
      return reply.status(404).send({ error: "LABS_BASKET_NOT_FOUND" });
    }
    const auth = authService.requireAuth(req);
    const { viewerAddress } = req.query as { viewerAddress?: string };
    const viewerVoted = Boolean(
      auth?.walletAddress && viewerAddress === auth.walletAddress &&
      await repository.hasLabsVote(basket.id, auth.walletAddress)
    );
    return { labsBasket: basket, comments: await repository.listLabsComments(basket.id), viewerVoted };
  });

  app.get("/v1/labs/baskets/:slug/market-nav-history", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const basket = await repository.getLabsBasket(req.params.slug);
    if (!basket || !["submitted", "approved", "promoted"].includes(basket.status)) {
      return reply.status(404).send({ error: "LABS_BASKET_NOT_FOUND" });
    }

    const { window = "1Y" } = req.query as { window?: string };
    const supportedWindows: MarketNavWindow[] = ["1W", "1M", "6M", "1Y", "3Y"];
    if (!supportedWindows.includes(window as MarketNavWindow)) {
      return reply.status(400).send({ error: "INVALID_HISTORY_WINDOW", supportedWindows });
    }

    const tokens = await Promise.all(basket.allocations.map(async (allocation) => {
      const token = await repository.getToken(allocation.mint);
      return {
        mint: allocation.mint,
        symbol: token?.symbol ?? allocation.mint,
        name: token?.name,
        weightBps: allocation.weightBps,
      };
    }));
    return getBasketMarketNavHistory(tokens, window as MarketNavWindow);
  });

  app.post("/v1/labs/baskets", async (req, reply) => {
    if (!writeGuard(req, reply)) return;
    const walletAddress = requireWallet(req, reply);
    if (!walletAddress) return;
    const { name, thesis, category, coverImageDataUrl, allocations } = (req.body || {}) as {
      name?: string;
      thesis?: string;
      category?: string;
      coverImageDataUrl?: string;
      allocations?: Array<{ mint?: string; weightBps?: number }>;
    };
    try {
      const labs = await labsService.createLabsBasket({
        name: String(name ?? ""),
        thesis: thesis === undefined ? "" : String(thesis),
        category: category === undefined ? "Labs" : String(category),
        coverImageDataUrl: coverImageDataUrl === undefined ? undefined : String(coverImageDataUrl),
        allocations: (allocations ?? []).map((allocation) => ({
          mint: String(allocation?.mint ?? ""),
          weightBps: Number(allocation?.weightBps),
        })),
        createdBy: walletAddress,
      });
      return reply.status(201).send({ labsBasket: labs });
    } catch (err) {
      throw AppError.from(err);
    }
  });

  app.post("/v1/labs/baskets/:slug/vote", async (req, reply) => {
    if (!writeGuard(req, reply)) return;
    const walletAddress = requireWallet(req, reply);
    if (!walletAddress) return;
    try {
      const result = await labsService.voteForLabsBasket(req.params.slug, walletAddress);
      return { labsBasket: result.labs, counted: result.counted };
    } catch (err) {
      throw AppError.from(err);
    }
  });

  app.delete("/v1/labs/baskets/:slug/vote", async (req, reply) => {
    if (!writeGuard(req, reply)) return;
    const walletAddress = requireWallet(req, reply);
    if (!walletAddress) return;
    try {
      const result = await labsService.removeVoteFromLabsBasket(req.params.slug, walletAddress);
      return { labsBasket: result.labs, removed: result.removed };
    } catch (err) {
      throw AppError.from(err);
    }
  });

  app.get("/v1/labs/baskets/:slug/comments", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const basket = await repository.getLabsBasket(req.params.slug);
    if (!basket || !["submitted", "approved", "promoted"].includes(basket.status)) {
      return reply.status(404).send({ error: "LABS_BASKET_NOT_FOUND" });
    }
    return { comments: await repository.listLabsComments(basket.id) };
  });

  app.post("/v1/labs/baskets/:slug/comments", async (req, reply) => {
    if (!writeGuard(req, reply)) return;
    const walletAddress = requireWallet(req, reply);
    if (!walletAddress) return;
    const { body } = (req.body || {}) as { body?: string };
    try {
      const comment = await labsService.commentOnLabsBasket(req.params.slug, walletAddress, String(body ?? ""));
      return reply.status(201).send({ comment });
    } catch (err) {
      throw AppError.from(err);
    }
  });
}
