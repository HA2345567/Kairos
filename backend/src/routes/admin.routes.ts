import { timingSafeEqual } from "node:crypto";
import { KairosHttpServer } from "../server";
import { repository } from "../db/repository";
import { adminService } from "../services/admin.service";
import { relayerService } from "../services/relayer.service";
import { rebalanceService } from "../services/rebalance.service";
import { loadDevnetState, DEVNET_LABELS, deterministicKeypair } from "../chain/devnetState";
import { getConnection, getSignatureStatuses } from "../chain/connection";
import { buildRegistryPublishTransaction, submitRegistryPublishTransaction } from "../chain/registry";
import { ensureFundedAta } from "../chain/mints";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { config } from "../config";
import { rateLimit } from "../middleware";
import { AppError } from "../errors";

/**
 * /v1/admin/* + /v1/faucet/* (contracts §12; PRD §4.10, §11).
 * Admin endpoints require an x-admin-token header. Basket publication also
 * needs a separately configured second admin credential.
 */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const APPROVER_TOKEN = process.env.ADMIN_APPROVER_TOKEN || "";
const ADMIN_ACTOR = process.env.ADMIN_ACTOR_ID || "";
const APPROVER_ACTOR = process.env.ADMIN_APPROVER_ID || "";
type AdminRequest = { headers: Record<string, unknown> };
type AdminReply = { status(c: number): { send(d: unknown): unknown } };

function matchesSecret(value: unknown, expected: string): boolean {
  if (typeof value !== "string") return false;
  const actualBytes = Buffer.from(value);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function requireAdmin(req: AdminRequest, reply: AdminReply): boolean {
  if (!ADMIN_TOKEN) {
    reply.status(503).send({ error: "ADMIN_AUTH_NOT_CONFIGURED" });
    return false;
  }
  if (!matchesSecret(req.headers["x-admin-token"], ADMIN_TOKEN)) {
    reply.status(403).send({ error: "FORBIDDEN_ADMIN_TOKEN_REQUIRED" });
    return false;
  }
  return true;
}

function requireApprover(req: AdminRequest, reply: AdminReply): boolean {
  if (
    !ADMIN_TOKEN ||
    !APPROVER_TOKEN ||
    APPROVER_TOKEN === ADMIN_TOKEN ||
    !ADMIN_ACTOR ||
    !APPROVER_ACTOR ||
    APPROVER_ACTOR === ADMIN_ACTOR
  ) {
    reply.status(503).send({ error: "DUAL_PUBLISH_APPROVAL_NOT_CONFIGURED" });
    return false;
  }
  if (!matchesSecret(req.headers["x-admin-approver-token"], APPROVER_TOKEN)) {
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
    if (!ADMIN_ACTOR) return reply.status(503).send({ error: "ADMIN_ACTOR_NOT_CONFIGURED" });
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
        publishedBy: ADMIN_ACTOR,
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
    if (!ADMIN_ACTOR) return reply.status(503).send({ error: "ADMIN_ACTOR_NOT_CONFIGURED" });
    if (!config.isDevnet()) return reply.status(403).send({ error: "REGISTRY_PUBLISH_DEVNET_ONLY" });
    const { approvalAddress } = (req.body || {}) as { approvalAddress?: string };
    if (!approvalAddress) return reply.status(400).send({ error: "APPROVAL_WALLET_REQUIRED" });
    try {
      const { basket, version } = (await adminService.prepareBasketPublishTransaction(req.params.id, ADMIN_ACTOR));
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
      const { basket, version } = (await adminService.prepareBasketPublishApproval(req.params.id, APPROVER_ACTOR));
      const published = await submitRegistryPublishTransaction(
        signedTransaction,
        basket.id,
        version.version,
        version.legs,
        approvalAddress
      );
      const result = (await adminService.approveBasketPublishProposal(
        req.params.id,
        APPROVER_ACTOR,
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
  app.post("/v1/faucet/airdrop", async (req, reply) => {
    if (!faucetGuard(req, reply)) return;
    if (!config.isDevnet()) {
      return reply.status(403).send({ error: "FAUCET_DEVNET_ONLY" });
    }
    // Simulation mode: no chain write — record the virtual drip (PRD §11.2).
    if (config.simulateLanding) {
      const { walletAddress: simWallet } = (req.body || {}) as { walletAddress?: string };
      if (!simWallet) return reply.status(400).send({ error: "WALLET_ADDRESS_REQUIRED" });
      (await repository.logAudit({
        actor: simWallet,
        action: "FAUCET_AIRDROP_SIMULATED",
        entity: "faucet",
        entityId: simWallet,
        after: { amountUi: 1_000, simulated: true },
      }));
      return {
        success: true,
        recipient: simWallet,
        token: "USDC",
        amount: 1_000,
        simulated: true,
        message: "SIMULATED faucet drip (KAIROS_SIMULATE_LANDING=1) — no on-chain mint.",
      };
    }
    const { walletAddress } = (req.body || {}) as { walletAddress?: string };
    if (!walletAddress) return reply.status(400).send({ error: "WALLET_ADDRESS_REQUIRED" });
    const state = loadDevnetState();
    if (!state) {
      return reply.status(503).send({ error: "DEVNET_NOT_INITIALIZED", message: "Run scripts/devnet-setup.ts first" });
    }
    const FAUCET_USDC_UI = 1_000;
    try {
      const owner = new PublicKey(walletAddress);
      const usdcMint = new PublicKey(state.usdc.mint);
      const usdcAuthority = deterministicKeypair(DEVNET_LABELS.usdcMint);
      const conn = getConnection();
      const ata = await ensureFundedAta(
        conn,
        relayerService.getKeypair(),
        usdcMint,
        owner,
        usdcAuthority,
        FAUCET_USDC_UI
      );
      // Real (relayer-paid) signature evidence for the mint/top-up.
      let txSignature: string | undefined;
      try {
        const sigs = await conn.getSignaturesForAddress(ata, { limit: 1 });
        txSignature = sigs[0]?.signature;
      } catch {
        /* evidence only */
      }
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
        message: "Devnet test USDC minted to your ATA (top-up to balance target).",
      };
    } catch (err) {
      throw new AppError("FAUCET_FAILED", (err as Error).message, 502);
    }
  });
}
