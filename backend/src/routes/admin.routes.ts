import { timingSafeEqual } from "node:crypto";
import { KairosHttpServer } from "../server";
import { repository } from "../db/repository";
import { adminService } from "../services/admin.service";
import { relayerService } from "../services/relayer.service";
import { rebalanceService } from "../services/rebalance.service";
import { loadDevnetState, DEVNET_LABELS, deterministicKeypair } from "../chain/devnetState";
import { getConnection, getSignatureStatuses, withFailover } from "../chain/connection";
import { buildRegistryPublishTransaction, submitRegistryPublishTransaction } from "../chain/registry";
import { ensureFundedAta } from "../chain/mints";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { config } from "../config";
import { rateLimit } from "../middleware";
import { AppError } from "../errors";
import { authService } from "../services/auth.service";
import { snapshotMetrics } from "../observability";
import { randomUUID } from "node:crypto";
import { labsService } from "../services/labs.service";
import { eligibilityService } from "../services/eligibility.service";
import { retentionService } from "../services/retention.service";
import type { AnnotationKind } from "../db/schema";

/**
 * /v1/admin/* + /v1/faucet/* (contracts §12; PRD §4.10, §11).
 * Admin endpoints require an x-admin-token header. Basket publication also
 * needs a separately configured second admin credential.
 */
// Resolved per request: the credentials are deployment configuration, and
// reading them lazily keeps module load order from freezing a stale value.
const adminToken = () => process.env.ADMIN_TOKEN || "";
const approverToken = () => process.env.ADMIN_APPROVER_TOKEN || "";
const adminActor = () => process.env.ADMIN_ACTOR_ID || "";
const approverActor = () => process.env.ADMIN_APPROVER_ID || "";
type AdminRequest = { headers: Record<string, unknown> };
type AdminReply = { status(c: number): { send(d: unknown): unknown } };

function matchesSecret(value: unknown, expected: string): boolean {
  if (typeof value !== "string") return false;
  const actualBytes = Buffer.from(value);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function requireAdmin(req: AdminRequest, reply: AdminReply): boolean {
  const expected = adminToken();
  if (!expected) {
    reply.status(503).send({ error: "ADMIN_AUTH_NOT_CONFIGURED" });
    return false;
  }
  if (!matchesSecret(req.headers["x-admin-token"], expected)) {
    reply.status(403).send({ error: "FORBIDDEN_ADMIN_TOKEN_REQUIRED" });
    return false;
  }
  return true;
}

function requireApprover(req: AdminRequest, reply: AdminReply): boolean {
  if (
    !adminToken() ||
    !approverToken() ||
    approverToken() === adminToken() ||
    !adminActor() ||
    !approverActor() ||
    approverActor() === adminActor()
  ) {
    reply.status(503).send({ error: "DUAL_PUBLISH_APPROVAL_NOT_CONFIGURED" });
    return false;
  }
  if (!matchesSecret(req.headers["x-admin-approver-token"], approverToken())) {
    reply.status(403).send({ error: "SECOND_ADMIN_APPROVAL_REQUIRED" });
    return false;
  }
  return true;
}

function publishErrorStatus(message: string): number {
  if (message === "BASKET_NOT_FOUND" || message === "PUBLISH_PROPOSAL_NOT_FOUND") return 404;
  if (
    message === "PUBLISH_PROPOSAL_NOT_PENDING" ||
    message === "PUBLISH_PROPOSAL_NOT_PENDING_OR_SAME_ADMIN" ||
    message === "PUBLISH_APPROVER_MUST_DIFFER" ||
    message === "REGISTRY_TRANSACTION_EXPIRED" ||
    message === "REGISTRY_VERSION_ALREADY_PUBLISHED" ||
    message.includes("UNIQUE constraint failed: basket_versions") ||
    message.startsWith("BASKET_VERSION_MUST_BE_NEXT")
  ) return 409;
  if (/^(INVALID_|TOKEN_|DUPLICATE_|PUBLISH_|REGISTRY_)/.test(message)) return 422;
  return 500;
}

function sendPublishError(reply: AdminReply, err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback;
  const status = publishErrorStatus(message);
  return reply.status(status).send({ error: status === 500 ? fallback : message });
}

export function registerAdminRoutes(app: KairosHttpServer): void {
  const adminGuard = rateLimit("admin", { max: 60, windowMs: 60_000 });
  const faucetGuard = rateLimit("faucet", { max: 6, windowMs: 60_000 }); // strict: mints real txs

  app.post("/v1/admin/kill-switch", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    if (!adminGuard(req, reply)) return;
    const { active, reason } = (req.body || {}) as { active?: boolean; reason?: string };
    if (typeof active !== "boolean") {
      return reply.status(400).send({ error: "ACTIVE_MUST_BE_BOOLEAN" });
    }
    const state = (await adminService.setGlobalKillSwitch(active, reason || "Admin toggle"));
    return { killSwitchActive: state };
  });

  app.get("/v1/admin/kill-switch", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return { killSwitchActive: (await repository.getSetting("global_kill_switch")) === "true" };
  });

  app.post("/v1/admin/baskets/:slug/status", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { slug } = req.params;
    const { status } = (req.body || {}) as { status?: "active" | "paused" | "deprecated" };
    if (!status || !["active", "paused", "deprecated"].includes(status)) {
      return reply.status(400).send({ error: "INVALID_BASKET_STATUS" });
    }
    const basket = (await adminService.toggleBasketStatus(slug, status));
    return { basket };
  });

  // Market-hours chaos switch: flip a token to market_closed / back (PRD §4.3).
  app.post("/v1/admin/tokens/:mint/trading-status", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { mint } = req.params;
    const { tradingStatus } = (req.body || {}) as {
      tradingStatus?: "active" | "halted" | "market_closed";
    };
    if (!tradingStatus || !["active", "halted", "market_closed"].includes(tradingStatus)) {
      return reply.status(400).send({ error: "INVALID_TRADING_STATUS" });
    }
    try {
      const token = (await adminService.setTokenTradingStatus(mint, tradingStatus));
      return { token };
    } catch {
      return reply.status(404).send({ error: "TOKEN_NOT_FOUND" });
    }
  });

  app.post("/v1/admin/baskets/:slug/publish", async (req, reply) => {
    if (!adminGuard(req, reply)) return;
    if (!requireAdmin(req, reply)) return;
    if (!adminActor()) return reply.status(503).send({ error: "ADMIN_ACTOR_NOT_CONFIGURED" });
    const { slug } = req.params;
    const { version, changelog, legs } = (req.body || {}) as {
      version?: number;
      changelog?: string;
      legs?: Array<{ mint: string; weightBps: number; legType?: string; venueHint?: string; slippageBps?: number }>;
    };
    if (!version || !Array.isArray(legs) || legs.length === 0) {
      return reply.status(400).send({ error: "VERSION_AND_LEGS_REQUIRED" });
    }
    try {
      const proposal = (await adminService.proposeBasketVersion(slug, {
        version,
        changelog: changelog || `Version ${version}`,
        publishedBy: adminActor(),
        legs: legs.map((l, i) => ({
          id: `leg-${version}-${i}`,
          mint: l.mint,
          weightBps: l.weightBps,
          legType: l.legType || "spl",
          venueHint: l.venueHint,
          slippageBps: l.slippageBps,
        })),
      }));
      return reply.status(202).send({ proposal });
    } catch (err) {
      return sendPublishError(reply, err, "PUBLISH_PROPOSAL_FAILED");
    }
  });

  app.get("/v1/admin/basket-publish-proposals", async (req, reply) => {
    if (!adminGuard(req, reply)) return;
    if (!requireApprover(req, reply)) return;
    return { proposals: (await repository.listPendingBasketPublishProposals()) };
  });

  app.post("/v1/admin/basket-publish-proposals/:id/transaction", async (req, reply) => {
    if (!adminGuard(req, reply)) return;
    if (!requireAdmin(req, reply)) return;
    if (!adminActor()) return reply.status(503).send({ error: "ADMIN_ACTOR_NOT_CONFIGURED" });
    if (!config.isDevnet()) return reply.status(403).send({ error: "REGISTRY_PUBLISH_DEVNET_ONLY" });
    const { approvalAddress } = (req.body || {}) as { approvalAddress?: string };
    if (!approvalAddress) return reply.status(400).send({ error: "APPROVAL_WALLET_REQUIRED" });
    try {
      const { basket, version } = (await adminService.prepareBasketPublishTransaction(req.params.id, adminActor()));
      const transaction = await buildRegistryPublishTransaction(
        basket.id,
        version.version,
        version.legs,
        approvalAddress
      );
      return transaction;
    } catch (err) {
      return sendPublishError(reply, err, "PUBLISH_TRANSACTION_BUILD_FAILED");
    }
  });

  app.post("/v1/admin/basket-publish-proposals/:id/approve", async (req, reply) => {
    if (!adminGuard(req, reply)) return;
    if (!requireApprover(req, reply)) return;
    if (!config.isDevnet()) return reply.status(403).send({ error: "REGISTRY_PUBLISH_DEVNET_ONLY" });
    const { note = "", approvalAddress, signedTransaction } = (req.body || {}) as {
      note?: string;
      approvalAddress?: string;
      signedTransaction?: string;
    };
    if (!approvalAddress || !signedTransaction) {
      return reply.status(400).send({ error: "SIGNED_REGISTRY_TRANSACTION_REQUIRED" });
    }
    try {
      const { basket, version } = (await adminService.prepareBasketPublishApproval(req.params.id, approverActor()));
      const published = await submitRegistryPublishTransaction(
        signedTransaction,
        basket.id,
        version.version,
        version.legs,
        approvalAddress
      );
      const result = (await adminService.approveBasketPublishProposal(
        req.params.id,
        approverActor(),
        note,
        published.signature,
        published.legsHash
      ));
      void rebalanceService
        .applyAutoRebalanceOnPublish(result.basketId, result.version.id)
        .catch((err) => console.error("[admin] auto-rebalance sweep failed:", err));
      return { proposal: result.proposal, version: result.version };
    } catch (err) {
      return sendPublishError(reply, err, "PUBLISH_APPROVAL_FAILED");
    }
  });

  app.get("/v1/admin/executions", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { status, limit } = req.query as { status?: string; limit?: string };
    const executions = (await repository.listExecutions(
      (status as never) || undefined,
      limit ? Math.min(Number(limit) || 50, 200) : 50
    ));
    return { executions };
  });

  app.get("/v1/admin/fees", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return { fees: (await repository.listFees()) };
  });

  /** NFR-01/02/07 measures. Averages and p95 are computed from a bounded
   *  in-process sample window, so this is a single-node view, not fleet truth. */
  app.get("/v1/admin/metrics", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return snapshotMetrics();
  });

  // ---- FR-27 annotation layer (admin write side) ----
  app.post("/v1/admin/baskets/:slug/annotations", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const basket = await repository.getBasketBySlug(req.params.slug);
    if (!basket) return reply.status(404).send({ error: "BASKET_NOT_FOUND" });
    const { kind, title, body, sourceUrl, source, impact, publishedAt, versionId } = (req.body || {}) as {
      kind?: string;
      title?: string;
      body?: string;
      sourceUrl?: string;
      source?: string;
      impact?: string;
      publishedAt?: string;
      versionId?: string;
    };
    const kinds: AnnotationKind[] = ["news", "event", "checkpoint", "incentive", "liquidation"];
    if (!title || !String(title).trim()) {
      return reply.status(400).send({ error: "ANNOTATION_TITLE_REQUIRED" });
    }
    if (kind !== undefined && !kinds.includes(kind as AnnotationKind)) {
      return reply.status(400).send({ error: "INVALID_ANNOTATION_KIND", message: kinds.join(", ") });
    }
    if (impact !== undefined && !["positive", "negative", "neutral"].includes(impact)) {
      return reply.status(400).send({ error: "INVALID_ANNOTATION_IMPACT" });
    }
    if (versionId && !(await repository.getBasketVersion(versionId))) {
      return reply.status(404).send({ error: "BASKET_VERSION_NOT_FOUND" });
    }
    const annotation = await repository.createAnnotation({
      id: "ann-" + randomUUID().slice(0, 12),
      basketId: basket.id,
      versionId: versionId ?? null,
      kind: (kind as AnnotationKind) ?? "news",
      title: String(title).slice(0, 200),
      body: String(body ?? "").slice(0, 4000),
      sourceUrl: sourceUrl ? String(sourceUrl).slice(0, 500) : null,
      source: source ? String(source).slice(0, 120) : null,
      impact: (impact as "positive" | "negative" | "neutral" | undefined) ?? null,
      publishedAt: publishedAt ? new Date(publishedAt).toISOString() : new Date().toISOString(),
      createdBy: adminActor(),
    });
    await repository.logAudit({
      actor: adminActor() || "admin",
      action: "CREATE_ANNOTATION",
      entity: "annotation",
      entityId: annotation.id,
      after: { basketId: basket.id, kind: annotation.kind, title: annotation.title },
    });
    return reply.status(201).send({ annotation });
  });

  app.delete("/v1/admin/annotations/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const existing = await repository.getAnnotation(req.params.id);
    if (!existing) return reply.status(404).send({ error: "ANNOTATION_NOT_FOUND" });
    await repository.deleteAnnotation(existing.id);
    await repository.logAudit({
      actor: adminActor() || "admin",
      action: "DELETE_ANNOTATION",
      entity: "annotation",
      entityId: existing.id,
      before: { basketId: existing.basketId, kind: existing.kind, title: existing.title },
    });
    return { deleted: true };
  });

  // ---- FR-03 liquidity evidence ----
  app.post("/v1/admin/tokens/:mint/liquidity", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { liquidityUsd, source, backtestable } = (req.body || {}) as {
      liquidityUsd?: number | null;
      source?: string;
      backtestable?: boolean;
    };
    if (liquidityUsd !== undefined && liquidityUsd !== null && (!Number.isFinite(Number(liquidityUsd)) || Number(liquidityUsd) < 0)) {
      return reply.status(400).send({ error: "INVALID_LIQUIDITY_VALUE" });
    }
    const token = await repository.updateTokenLiquidity(req.params.mint, {
      liquidityUsd: liquidityUsd === undefined ? null : (liquidityUsd as number | null),
      source: source ?? "admin-manual",
      backtestable,
    });
    if (!token) return reply.status(404).send({ error: "TOKEN_NOT_FOUND" });
    await repository.logAudit({
      actor: adminActor() || "admin",
      action: "UPDATE_TOKEN_LIQUIDITY",
      entity: "token",
      entityId: token.mint,
      after: { liquidityUsd: token.liquidityUsd, source: token.liquiditySource, backtestable: token.backtestable },
    });
    return { token };
  });

  // ---- FR-04 eligibility (mainnet-activatable plumbing) ----
  app.post("/v1/admin/eligibility", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { walletAddress, status } = (req.body || {}) as { walletAddress?: string; status?: string };
    if (!walletAddress || !status || !["eligible", "requires_action", "restricted"].includes(status)) {
      return reply.status(400).send({ error: "INVALID_ELIGIBILITY_REQUEST" });
    }
    const eligibility = await eligibilityService.setEligibilityStatus(
      walletAddress,
      status as "eligible" | "requires_action" | "restricted",
      adminActor() || "admin"
    );
    if (!eligibility) return reply.status(404).send({ error: "WALLET_NOT_REGISTERED" });
    return { eligibility };
  });

  // ---- FR-25 Labs moderation + promotion ----
  app.post("/v1/admin/labs/:slug/moderate", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { decision, note } = (req.body || {}) as { decision?: string; note?: string };
    if (decision !== "approved" && decision !== "rejected") {
      return reply.status(400).send({ error: "INVALID_MODERATION_DECISION" });
    }
    const labsBasket = await labsService.moderateLabsBasket(
      req.params.slug,
      decision,
      note ?? "",
      adminActor() || "admin"
    );
    return { labsBasket };
  });

  app.post("/v1/admin/labs/:slug/promote", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const result = await labsService.promoteLabsBasket(req.params.slug, adminActor() || "admin");
    return { labsBasket: result.labs, basketId: result.basketId };
  });

  app.post("/v1/admin/labs/comments/:id/hide", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { hidden } = (req.body || {}) as { hidden?: boolean };
    const updated = await repository.setLabsCommentHidden(req.params.id, hidden !== false);
    if (!updated) return reply.status(404).send({ error: "LABS_COMMENT_NOT_FOUND" });
    return { hidden: hidden !== false };
  });

  // ---- NFR-10 retention drill (bounded, idempotent) ----
  app.post("/v1/admin/retention/run", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return { report: await retentionService.runRetentionSweep() };
  });

  app.get("/v1/admin/relayer", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const sol = await relayerService.getSolBalance();
    return {
      pubkey: relayerService.getPublicKey().toBase58(),
      solBalance: sol,
      funded: await relayerService.isFunded(),
      cluster: config.cluster,
    };
  });

  // ---- devnet faucet (PRD §11.1): mints REAL test USDC to the caller ATA ----
  app.post("/v1/faucet/sol-airdrop", async (req, reply) => {
    if (!faucetGuard(req, reply)) return;
    if (!config.isDevnet()) return reply.status(403).send({ error: "FAUCET_DEVNET_ONLY" });
    const auth = authService.requireAuth(req);
    if (!auth?.walletAddress) return reply.status(401).send({ error: "UNAUTHORIZED" });
    const requestedWallet = (req.body || {}) as { walletAddress?: string };
    if (requestedWallet.walletAddress && requestedWallet.walletAddress !== auth.walletAddress) {
      return reply.status(403).send({ error: "WALLET_SESSION_MISMATCH" });
    }
    try {
      const owner = new PublicKey(auth.walletAddress);
      const signature = await withFailover((conn) => conn.requestAirdrop(owner, LAMPORTS_PER_SOL));
      await withFailover((conn) => conn.confirmTransaction(signature, "confirmed"));
      return {
        success: true,
        recipient: auth.walletAddress,
        amount: 1,
        token: "SOL",
        txSignature: signature,
        message: "1 Devnet SOL airdropped to your wallet.",
      };
    } catch (err) {
      throw new AppError("FAUCET_FAILED", (err as Error).message, 502);
    }
  });

  app.post("/v1/faucet/airdrop", async (req, reply) => {
    if (!faucetGuard(req, reply)) return;
    if (!config.isDevnet()) {
      return reply.status(403).send({ error: "FAUCET_DEVNET_ONLY" });
    }
    const auth = authService.requireAuth(req);
    if (!auth?.walletAddress) return reply.status(401).send({ error: "UNAUTHORIZED" });
    const requestedWallet = (req.body || {}) as { walletAddress?: string };
    if (requestedWallet.walletAddress && requestedWallet.walletAddress !== auth.walletAddress) {
      return reply.status(403).send({ error: "WALLET_SESSION_MISMATCH" });
    }
    // Simulation mode: no chain write — record the virtual drip (PRD §11.2).
    if (config.simulateLanding) {
      const simWallet = requestedWallet.walletAddress || auth.walletAddress;
      (await repository.logAudit({
        actor: simWallet,
        action: "FAUCET_AIRDROP_SIMULATED",
        entity: "faucet",
        entityId: simWallet,
        after: { amountUi: 50, simulated: true },
      }));
      return {
        success: true,
        recipient: simWallet,
        token: "USDC",
        amount: 50,
        simulated: true,
        message: "SIMULATED faucet drip (KAIROS_SIMULATE_LANDING=1) — no on-chain mint.",
      };
    }
    const walletAddress = requestedWallet.walletAddress || auth.walletAddress;
    const state = loadDevnetState();
    if (!state) {
      return reply.status(503).send({ error: "DEVNET_NOT_INITIALIZED", message: "Run scripts/devnet-setup.ts first" });
    }
    const FAUCET_USDC_UI = 50;
    try {
      const owner = new PublicKey(walletAddress);
      const usdcMint = new PublicKey(state.usdc.mint);
      const usdcAuthority = deterministicKeypair(DEVNET_LABELS.usdcMint);
      const conn = getConnection();
      const ataAddress = await getAssociatedTokenAddress(usdcMint, owner);
      const currentBalance = await conn.getTokenAccountBalance(ataAddress)
        .then((balance) => balance.value.uiAmount ?? 0)
        .catch(() => 0);
      const funded = await ensureFundedAta(
        conn,
        relayerService.getKeypair(),
        usdcMint,
        owner,
        usdcAuthority,
        currentBalance + FAUCET_USDC_UI
      );
      const { ata, signature: txSignature } = funded;
      (await repository.logAudit({
        actor: walletAddress,
        action: "FAUCET_AIRDROP",
        entity: "faucet",
        entityId: ata.toBase58(),
        after: { amountUi: FAUCET_USDC_UI, mint: state.usdc.mint },
      }));
      return {
        success: true,
        recipient: walletAddress,
        token: "USDC",
        mint: state.usdc.mint,
        amount: FAUCET_USDC_UI,
        ata: ata.toBase58(),
        txSignature,
        message: "50 Devnet test USDC minted to your wallet.",
      };
    } catch (err) {
      throw new AppError("FAUCET_FAILED", (err as Error).message, 502);
    }
  });
}
