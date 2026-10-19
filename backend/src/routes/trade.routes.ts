import { KairosHttpServer } from "../server";
import { repository } from "../db/repository";
import { quoteService } from "../services/quote.service";
import { executionService } from "../services/execution.service";
import { portfolioService } from "../services/portfolio.service";
import { rebalanceService } from "../services/rebalance.service";
import { geoCheck, rateLimit, requireIdempotencyKey, walletRateLimit, type RateLimitGuard } from "../middleware";
import { AppError } from "../errors";
import { authService } from "../services/auth.service";
import { executionResource, readEvents } from "../services/event-stream";
import { eligibilityService } from "../services/eligibility.service";
import { logger, recordPrepareLatency } from "../observability";
import { getQuotePrice } from "../services/pricing.service";

const SOL_MINT = "So11111111111111111111111111111111111111112";

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

/** FR-04: every money path checks account eligibility after the session guard. */
async function requireEligible(walletAddress: string): Promise<void> {
  await eligibilityService.assertEligibleForWallet(walletAddress);
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
  const moneyRateLimit = rateLimit("money", { max: 30, windowMs: 60_000 });
  // FR-04: the eligibility/region gate covers every money path, not only quotes.
  const moneyGuard: RateLimitGuard = (req, reply) =>
    geoCheck(req, reply) && moneyRateLimit(req, reply);
  const readGuard = rateLimit("trade-read", { max: 600, windowMs: 60_000 }); // PRD §10: 600 reads / IP / min
  // PRD §10: 20 prepares / wallet / 10 min. Applied to every path that builds transactions.
  const prepareWalletGuard = walletRateLimit("prepare", { max: 20, windowMs: 600_000 });

  app.post("/v1/quotes", async (req, reply) => {
    if (!geoCheck(req, reply)) return;
    if (!quoteGuard(req, reply)) return;
    const quoteAuth = authService.requireAuth(req);
    if (quoteAuth?.walletAddress) await requireEligible(quoteAuth.walletAddress);
    const { basket, usdcAmount, solAmount } = (req.body || {}) as { basket?: string; usdcAmount?: number; solAmount?: number };
    if (!basket || (usdcAmount === undefined) === (solAmount === undefined)) return reply.status(400).send({ error: "INVALID_QUOTE_PARAMETERS" });
    try {
      if (solAmount !== undefined) {
        if (!Number.isFinite(solAmount) || solAmount <= 0) return reply.status(400).send({ error: "INVALID_SOL_AMOUNT" });
        const solPrice = await getQuotePrice(SOL_MINT);
        if (solPrice.stale || !Number.isFinite(solPrice.priceUsd) || solPrice.priceUsd <= 0) {
          throw new AppError("PRICE_STALE", "SOL/USD price is unavailable for this Devnet quote", 503);
        }
        const quote = await quoteService.getQuote(basket, solAmount * solPrice.priceUsd);
        return { quote, funding: { asset: "SOL", amount: solAmount, priceUsd: solPrice.priceUsd } };
      }
      const quote = await quoteService.getQuote(basket, usdcAmount!);
      return { quote, funding: { asset: "USDC", amount: usdcAmount! } };
    } catch (err) {
      throw AppError.from(err);
    }
  });

  // ---- invest: prepare → sign (client) → submit → poll ----
  app.post("/v1/positions/prepare", async (req, reply) => {
    if (!prepareWalletGuard(req, reply)) return;
    if (!moneyGuard(req, reply)) return;
    const { basket, usdc, solAmount, walletAddress, idempotencyKey: bodyIdempotencyKey } = (req.body || {}) as {
      basket?: string;
      usdc?: number;
      solAmount?: number;
      walletAddress?: string;
      idempotencyKey?: string;
    };
    const idempotencyKey = requireIdempotencyKey(req, reply, bodyIdempotencyKey);
    if (!idempotencyKey) return;
    if (!basket || (usdc === undefined) === (solAmount === undefined) || !walletAddress) {
      return reply.status(400).send({ error: "MISSING_REQUIRED_PREPARE_FIELDS" });
    }
    const sessionWallet = requireWallet(req, reply, walletAddress);
    if (!sessionWallet) return;
    await requireEligible(sessionWallet);
    const startedAt = performance.now();
    try {
      const execution = await executionService.prepare({
        basketSlug: basket,
        ...(solAmount !== undefined ? { solAmount } : { usdcAmount: usdc }),
        walletAddress: sessionWallet,
        idempotencyKey,
      });
      recordPrepareLatency(performance.now() - startedAt);
      logger.info("execution_prepared", {
        execution_id: execution.id,
        basket,
        legs: execution.legs.length,
        usdc_amount: usdc,
      });
      return { execution };
    } catch (err) {
      logger.warn("execution_prepare_failed", {
        basket,
        usdc_amount: usdc,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Number((performance.now() - startedAt).toFixed(2)),
      });
      throw err;
    }
  });

  app.post("/v1/positions/submit", async (req, reply) => {
    if (!prepareWalletGuard(req, reply)) return;
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
    const submitWallet = await requireExecutionWallet(req, reply, executionId);
    if (!submitWallet) return;
    await requireEligible(submitWallet);
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

  /**
   * Compact execution status for refresh/resume (PRD §4.5 "Signing & status").
   * Returns the terminal flag and the stream cursor so a reloaded client can
   * either continue from `seq` or clear its queue instead of re-deriving state
   * from the full execution payload.
   */
  app.get("/v1/executions/:id/status", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { id } = req.params;
    if (!(await requireExecutionWallet(req, reply, id))) return;
    const execution = (await repository.getExecution(id));
    if (!execution) return reply.status(404).send({ error: "EXECUTION_NOT_FOUND" });
    const terminal = ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "EXPIRED"].includes(execution.status);
    return {
      executionId: execution.id,
      status: execution.status,
      terminal,
      type: execution.type,
      basketId: execution.basketId,
      createdAt: execution.createdAt,
      updatedAt: execution.updatedAt,
      legs: execution.legs.map((leg, index) => ({
        legId: leg.id,
        index,
        mint: leg.mint,
        symbol: leg.symbol,
        status: leg.status,
        error: leg.error ?? null,
      })),
      /** Cursor for /v1/stream/executions/:id; 0 means nothing published yet. */
      seq: readEvents(executionResource(execution.id), 0).seq,
    };
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
    if (!prepareWalletGuard(req, reply)) return;
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
    await requireEligible(sessionWallet);
    const execution = await executionService.retryFailed(id, idempotencyKey, sessionWallet);
    return { execution };
  });

  app.post("/v1/executions/:id/unwind", async (req, reply) => {
    if (!prepareWalletGuard(req, reply)) return;
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
    await requireEligible(sessionWallet);
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
    if (!prepareWalletGuard(req, reply)) return;
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
    await requireEligible(sessionWallet);
    const execution = await rebalanceService.prepareRebalance(id, idempotencyKey, sessionWallet);
    return { execution };
  });

  app.post("/v1/positions/:id/close/prepare", async (req, reply) => {
    if (!prepareWalletGuard(req, reply)) return;
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
    await requireEligible(sessionWallet);
    if (!walletAddress) {
      // Preview-only close still requires the owning wallet session.
      const preview = await portfolioService.prepareClose(id);
      return { preview };
    }
    const execution = await rebalanceService.prepareCloseExecution(id, idempotencyKey, sessionWallet);
    return { execution };
  });

  /**
   * PRD §4.5 Settings: one-click revoke of the embedded/delegated signing key.
   * Disabling clears the stored policy so a stale policy cannot be re-read at
   * landing time (FR-22 checks the flag per leg).
   */
  app.post("/v1/wallets/delegated-signing", async (req, reply) => {
    if (!moneyGuard(req, reply)) return;
    const { walletAddress, enabled } = (req.body || {}) as { walletAddress?: string; enabled?: boolean };
    if (typeof enabled !== "boolean") {
      return reply.status(400).send({ error: "ENABLED_MUST_BE_BOOLEAN" });
    }
    const sessionWallet = requireWallet(req, reply, walletAddress);
    if (!sessionWallet) return;
    const wallet = await repository.getWalletByAddress(sessionWallet);
    if (!wallet) return reply.status(404).send({ error: "WALLET_NOT_REGISTERED" });
    const before = { delegatedSigning: wallet.delegatedSigning, policy: wallet.policyJson ?? null };
    await repository.setDelegatedSigning(wallet.id, enabled, enabled ? undefined : null);
    await repository.logAudit({
      actor: sessionWallet,
      action: enabled ? "ENABLE_DELEGATED_SIGNING" : "REVOKE_DELEGATED_SIGNING",
      entity: "wallet",
      entityId: wallet.id,
      before,
      after: { delegatedSigning: enabled, policy: enabled ? before.policy : null },
    });
    return { wallet: { address: wallet.address, delegatedSigning: enabled } };
  });

  app.put("/v1/positions/:id/auto-rebalance", async (req, reply) => {
    if (!moneyGuard(req, reply)) return;
    const sessionWallet = await requirePositionWallet(req, reply, req.params.id);
    if (!sessionWallet) return;
    await requireEligible(sessionWallet);
    const { id } = req.params;
    const { enabled, policy } = (req.body || {}) as { enabled?: boolean; policy?: unknown };
    if (typeof enabled !== "boolean") {
      return reply.status(400).send({ error: "ENABLED_MUST_BE_BOOLEAN" });
    }
    const position = await portfolioService.setAutoRebalance(id, enabled, policy as never);
    return { position };
  });
}
