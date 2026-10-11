import { KairosHttpServer } from "../server";
import { repository } from "../db/repository";
import { quoteService } from "../services/quote.service";
import { executionService } from "../services/execution.service";
import { portfolioService } from "../services/portfolio.service";
import { rebalanceService } from "../services/rebalance.service";
import { rateLimit } from "../middleware";
import { AppError } from "../errors";

/**
 * /v1/quotes, /v1/positions*, /v1/executions* — the money path
 * (contracts §12; PRD §4.3–§4.6). All mutating endpoints take idempotency
 * keys; every handler maps AppError codes to HTTP statuses centrally in
 * api.routes.ts error wrapping.
 */
export function registerTradeRoutes(app: KairosHttpServer): void {
  const quoteGuard = rateLimit("quotes", { max: 60, windowMs: 60_000 });
  const moneyGuard = rateLimit("money", { max: 30, windowMs: 60_000 });
  const readGuard = rateLimit("trade-read", { max: 120, windowMs: 60_000 });

  app.post("/v1/quotes", async (req, reply) => {
    if (!quoteGuard(req, reply)) return;
    const { basket, usdcAmount } = (req.body || {}) as { basket?: string; usdcAmount?: number };
    if (!basket || !usdcAmount) return reply.status(400).send({ error: "INVALID_QUOTE_PARAMETERS" });
    try {
      const quote = await quoteService.getQuote(basket, usdcAmount);
      return { quote };
    } catch (err) {
      throw AppError.from(err);
    }
  });

  // ---- invest: prepare → sign (client) → submit → poll ----
  app.post("/v1/positions/prepare", async (req, reply) => {
    if (!moneyGuard(req, reply)) return;
    const { basket, usdc, walletAddress, idempotencyKey } = (req.body || {}) as {
      basket?: string;
      usdc?: number;
      walletAddress?: string;
      idempotencyKey?: string;
    };
    if (!basket || !usdc || !walletAddress || !idempotencyKey) {
      return reply.status(400).send({ error: "MISSING_REQUIRED_PREPARE_FIELDS" });
    }
    const execution = await executionService.prepare({
      basketSlug: basket,
      usdcAmount: usdc,
      walletAddress,
      idempotencyKey,
    });
    return { execution };
  });

  app.post("/v1/positions/submit", async (req, reply) => {
    if (!moneyGuard(req, reply)) return;
    const { executionId, signedTxs, idempotencyKey } = (req.body || {}) as {
      executionId?: string;
      signedTxs?: string[];
      idempotencyKey?: string;
    };
    if (!executionId || !signedTxs) {
      return reply.status(400).send({ error: "MISSING_EXECUTION_OR_SIGNED_TXS" });
    }
    const execution = await executionService.submit({ executionId, signedTxs, idempotencyKey });
    return { execution };
  });

  app.get("/v1/executions/:id", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { id } = req.params;
    const execution = repository.getExecution(id);
    if (!execution) return reply.status(404).send({ error: "EXECUTION_NOT_FOUND" });
    return { execution };
  });

  app.post("/v1/executions/:id/retry", async (req, reply) => {
    if (!moneyGuard(req, reply)) return;
    const { id } = req.params;
    const { idempotencyKey, walletAddress } = (req.body || {}) as {
      idempotencyKey?: string;
      walletAddress?: string;
    };
    if (!idempotencyKey || !walletAddress) {
      return reply.status(400).send({ error: "MISSING_IDEMPOTENCY_KEY_OR_WALLET" });
    }
    const execution = await executionService.retryFailed(id, idempotencyKey, walletAddress);
    return { execution };
  });

  app.post("/v1/executions/:id/unwind", async (req, reply) => {
    if (!moneyGuard(req, reply)) return;
    const { id } = req.params;
    const { idempotencyKey, walletAddress } = (req.body || {}) as {
      idempotencyKey?: string;
      walletAddress?: string;
    };
    if (!idempotencyKey || !walletAddress) {
      return reply.status(400).send({ error: "MISSING_IDEMPOTENCY_KEY_OR_WALLET" });
    }
    const execution = await executionService.unwind(id, idempotencyKey, walletAddress);
    return { execution };
  });

  // ---- portfolio ----
  app.get("/v1/positions", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { walletAddress } = req.query as { walletAddress?: string };
    if (!walletAddress) return reply.status(400).send({ error: "WALLET_ADDRESS_REQUIRED" });
    const positions = await portfolioService.getPositions(walletAddress);
    return { positions };
  });

  app.get("/v1/positions/:id", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const position = await portfolioService.getPosition(req.params.id);
    if (!position) return reply.status(404).send({ error: "POSITION_NOT_FOUND" });
    return { position };
  });

  // ---- rebalance & close (PRD §4.6; share the submit/land pipeline) ----
  app.post("/v1/positions/:id/rebalance/prepare", async (req, reply) => {
    if (!moneyGuard(req, reply)) return;
    const { id } = req.params;
    const { idempotencyKey, walletAddress } = (req.body || {}) as {
      idempotencyKey?: string;
      walletAddress?: string;
    };
    if (!idempotencyKey || !walletAddress) {
      return reply.status(400).send({ error: "MISSING_IDEMPOTENCY_KEY_OR_WALLET" });
    }
    const execution = await rebalanceService.prepareRebalance(id, idempotencyKey, walletAddress);
    return { execution };
  });

  app.post("/v1/positions/:id/close/prepare", async (req, reply) => {
    if (!moneyGuard(req, reply)) return;
    const { id } = req.params;
    const { idempotencyKey, walletAddress } = (req.body || {}) as {
      idempotencyKey?: string;
      walletAddress?: string;
    };
    if (!idempotencyKey || !walletAddress) {
      // Preview-only close (no execution) stays available without keys.
      const preview = await portfolioService.prepareClose(id);
      return { preview };
    }
    const execution = await rebalanceService.prepareCloseExecution(id, idempotencyKey, walletAddress);
    return { execution };
  });

  app.put("/v1/positions/:id/auto-rebalance", async (req, reply) => {
    if (!moneyGuard(req, reply)) return;
    const { id } = req.params;
    const { enabled, policy } = (req.body || {}) as { enabled?: boolean; policy?: unknown };
    if (typeof enabled !== "boolean") {
      return reply.status(400).send({ error: "ENABLED_MUST_BE_BOOLEAN" });
    }
    const position = await portfolioService.setAutoRebalance(id, enabled, policy as never);
    return { position };
  });
}
