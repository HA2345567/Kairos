import { KairosHttpServer } from "../server";
import { repository } from "../db/repository";
import { quoteService } from "../services/quote.service";
import { executionService } from "../services/execution.service";
import { portfolioService } from "../services/portfolio.service";
import { rebalanceService } from "../services/rebalance.service";
import { geoCheck, rateLimit, requireIdempotencyKey } from "../middleware";
import { AppError } from "../errors";
import { authService } from "../services/auth.service";

type Reply = { status(code: number): { send(data: unknown): unknown } };

/** Require a SIWS session and, when supplied, bind the request to its wallet. */
function requireWallet(
  req: { headers: Record<string, string | string[] | undefined> },
  reply: Reply,
  requestedWallet?: string
): string | null {
  const auth = authService.requireAuth(req);
  if (!auth?.walletAddress) {
    reply.status(401).send({ error: "UNAUTHORIZED" });
    return null;
  }
  if (requestedWallet !== undefined && requestedWallet !== auth.walletAddress) {
    reply.status(403).send({ error: "WALLET_SESSION_MISMATCH" });
    return null;
  }
  return auth.walletAddress;
}

async function requireExecutionWallet(
  req: { headers: Record<string, string | string[] | undefined> },
  reply: Reply,
  executionId: string
): Promise<string | null> {
  const walletAddress = requireWallet(req, reply);
  if (!walletAddress) return null;
  const execution = await repository.getExecution(executionId);
  if (!execution) {
    reply.status(404).send({ error: "EXECUTION_NOT_FOUND" });
    return null;
  }
  if (execution.walletAddress !== walletAddress) {
    reply.status(403).send({ error: "EXECUTION_NOT_OWNED_BY_WALLET" });
    return null;
  }
  return walletAddress;
}

async function requirePositionWallet(
  req: { headers: Record<string, string | string[] | undefined> },
  reply: Reply,
  positionId: string,
  requestedWallet?: string
): Promise<string | null> {
  const walletAddress = requireWallet(req, reply, requestedWallet);
  if (!walletAddress) return null;
  const position = await repository.getPosition(positionId);
  if (!position) {
    reply.status(404).send({ error: "POSITION_NOT_FOUND" });
    return null;
  }
  if (position.walletAddress !== walletAddress) {
    reply.status(403).send({ error: "POSITION_NOT_OWNED_BY_WALLET" });
    return null;
  }
  return walletAddress;
}

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
    if (!geoCheck(req, reply)) return;
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
    const { basket, usdc, walletAddress, idempotencyKey: bodyIdempotencyKey } = (req.body || {}) as {
      basket?: string;
      usdc?: number;
      walletAddress?: string;
      idempotencyKey?: string;
    };
    const idempotencyKey = requireIdempotencyKey(req, reply, bodyIdempotencyKey);
    if (!idempotencyKey) return;
    if (!basket || !usdc || !walletAddress) {
      return reply.status(400).send({ error: "MISSING_REQUIRED_PREPARE_FIELDS" });
    }
    const sessionWallet = requireWallet(req, reply, walletAddress);
    if (!sessionWallet) return;
    const execution = await executionService.prepare({
      basketSlug: basket,
      usdcAmount: usdc,
      walletAddress: sessionWallet,
      idempotencyKey,
    });
    return { execution };
  });

  app.post("/v1/positions/submit", async (req, reply) => {
    if (!moneyGuard(req, reply)) return;
    const { executionId, signedTxs, idempotencyKey: bodyIdempotencyKey } = (req.body || {}) as {
      executionId?: string;
      signedTxs?: string[];
      idempotencyKey?: string;
    };
    const idempotencyKey = requireIdempotencyKey(req, reply, bodyIdempotencyKey);
    if (!idempotencyKey) return;
    if (!executionId || !signedTxs) {
      return reply.status(400).send({ error: "MISSING_EXECUTION_OR_SIGNED_TXS" });
    }
    if (!(await requireExecutionWallet(req, reply, executionId))) return;
    const execution = await executionService.submit({ executionId, signedTxs, idempotencyKey });
    return { execution };
  });

  app.get("/v1/executions/:id", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { id } = req.params;
    if (!(await requireExecutionWallet(req, reply, id))) return;
    const execution = (await repository.getExecution(id));
    if (!execution) return reply.status(404).send({ error: "EXECUTION_NOT_FOUND" });
    return { execution };
  });

  app.get("/v1/executions", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const walletAddress = req.query.walletAddress;
    if (!walletAddress) return reply.status(400).send({ error: "WALLET_ADDRESS_REQUIRED" });
    const sessionWallet = requireWallet(req, reply, walletAddress);
    if (!sessionWallet) return;
    return { executions: await repository.getExecutionsForWallet(sessionWallet) };
  });

  app.post("/v1/executions/:id/retry", async (req, reply) => {
    if (!moneyGuard(req, reply)) return;
    const { id } = req.params;
    const { idempotencyKey: bodyIdempotencyKey, walletAddress } = (req.body || {}) as {
      idempotencyKey?: string;
      walletAddress?: string;
    };
    const idempotencyKey = requireIdempotencyKey(req, reply, bodyIdempotencyKey);
    if (!idempotencyKey) return;
    if (!walletAddress) return reply.status(400).send({ error: "MISSING_IDEMPOTENCY_KEY_OR_WALLET" });
    const sessionWallet = requireWallet(req, reply, walletAddress);
    if (!sessionWallet) return;
    if (!(await requireExecutionWallet(req, reply, id))) return;
    const execution = await executionService.retryFailed(id, idempotencyKey, sessionWallet);
    return { execution };
  });

  app.post("/v1/executions/:id/unwind", async (req, reply) => {
    if (!moneyGuard(req, reply)) return;
    const { id } = req.params;
    const { idempotencyKey: bodyIdempotencyKey, walletAddress } = (req.body || {}) as {
      idempotencyKey?: string;
      walletAddress?: string;
    };
    const idempotencyKey = requireIdempotencyKey(req, reply, bodyIdempotencyKey);
    if (!idempotencyKey) return;
    if (!walletAddress) return reply.status(400).send({ error: "MISSING_IDEMPOTENCY_KEY_OR_WALLET" });
    const sessionWallet = requireWallet(req, reply, walletAddress);
    if (!sessionWallet) return;
    if (!(await requireExecutionWallet(req, reply, id))) return;
    const execution = await executionService.unwind(id, idempotencyKey, sessionWallet);
    return { execution };
  });

  // ---- portfolio ----
  app.get("/v1/positions", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { walletAddress } = req.query as { walletAddress?: string };
    if (!walletAddress) return reply.status(400).send({ error: "WALLET_ADDRESS_REQUIRED" });
    const sessionWallet = requireWallet(req, reply, walletAddress);
    if (!sessionWallet) return;
    const positions = await portfolioService.getPositions(sessionWallet);
    return { positions };
  });

  app.get("/v1/positions/:id", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    if (!(await requirePositionWallet(req, reply, req.params.id))) return;
    const position = await portfolioService.getPosition(req.params.id);
    if (!position) return reply.status(404).send({ error: "POSITION_NOT_FOUND" });
    return { position };
  });

  // ---- rebalance & close (PRD §4.6; share the submit/land pipeline) ----
  app.post("/v1/positions/:id/rebalance/prepare", async (req, reply) => {
    if (!moneyGuard(req, reply)) return;
    const { id } = req.params;
    const { idempotencyKey: bodyIdempotencyKey, walletAddress } = (req.body || {}) as {
      idempotencyKey?: string;
      walletAddress?: string;
    };
    const idempotencyKey = requireIdempotencyKey(req, reply, bodyIdempotencyKey);
    if (!idempotencyKey) return;
    if (!walletAddress) return reply.status(400).send({ error: "MISSING_IDEMPOTENCY_KEY_OR_WALLET" });
    const sessionWallet = await requirePositionWallet(req, reply, id, walletAddress);
    if (!sessionWallet) return;
    const execution = await rebalanceService.prepareRebalance(id, idempotencyKey, sessionWallet);
    return { execution };
  });

  app.post("/v1/positions/:id/close/prepare", async (req, reply) => {
    if (!moneyGuard(req, reply)) return;
    const { id } = req.params;
    const { idempotencyKey: bodyIdempotencyKey, walletAddress } = (req.body || {}) as {
      idempotencyKey?: string;
      walletAddress?: string;
    };
    const idempotencyKey = requireIdempotencyKey(req, reply, bodyIdempotencyKey);
    if (!idempotencyKey) return;
    const sessionWallet = await requirePositionWallet(req, reply, id, walletAddress);
    if (!sessionWallet) return;
    if (!walletAddress) {
      // Preview-only close still requires the owning wallet session.
      const preview = await portfolioService.prepareClose(id);
      return { preview };
    }
    const execution = await rebalanceService.prepareCloseExecution(id, idempotencyKey, sessionWallet);
    return { execution };
  });

  app.put("/v1/positions/:id/auto-rebalance", async (req, reply) => {
    if (!moneyGuard(req, reply)) return;
    const sessionWallet = await requirePositionWallet(req, reply, req.params.id);
    if (!sessionWallet) return;
    const { id } = req.params;
    const { enabled, policy } = (req.body || {}) as { enabled?: boolean; policy?: unknown };
    if (typeof enabled !== "boolean") {
      return reply.status(400).send({ error: "ENABLED_MUST_BE_BOOLEAN" });
    }
    const position = await portfolioService.setAutoRebalance(id, enabled, policy as never);
    return { position };
  });
}
