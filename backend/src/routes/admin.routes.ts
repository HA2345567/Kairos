import { KairosHttpServer } from "../server";
import { repository } from "../db/repository";
import { adminService } from "../services/admin.service";
import { relayerService } from "../services/relayer.service";
import { rebalanceService } from "../services/rebalance.service";
import { loadDevnetState, DEVNET_LABELS, deterministicKeypair } from "../chain/devnetState";
import { getConnection, getSignatureStatuses } from "../chain/connection";
import { ensureFundedAta } from "../chain/mints";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { config } from "../config";
import { rateLimit } from "../middleware";
import { AppError } from "../errors";

/**
 * /v1/admin/* + /v1/faucet/* (contracts §12; PRD §4.10, §11).
 * Admin endpoints require the x-admin-token header (ADMIN_TOKEN env; devnet
 * default below). The faucet refuses to run outside devnet.
 */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "kairos-devnet-admin";

function requireAdmin(req: { headers: Record<string, unknown> }, reply: { status(c: number): { send(d: unknown): unknown } }): boolean {
  const token = (req.headers["x-admin-token"] as string | undefined) ?? "";
  if (token !== ADMIN_TOKEN) {
    reply.status(403).send({ error: "FORBIDDEN_ADMIN_TOKEN_REQUIRED" });
    return false;
  }
  return true;
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
    const state = adminService.setGlobalKillSwitch(active, reason || "Admin toggle");
    return { killSwitchActive: state };
  });

  app.get("/v1/admin/kill-switch", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return { killSwitchActive: repository.getSetting("global_kill_switch") === "true" };
  });

  app.post("/v1/admin/baskets/:slug/status", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { slug } = req.params;
    const { status } = (req.body || {}) as { status?: "active" | "paused" | "deprecated" };
    if (!status || !["active", "paused", "deprecated"].includes(status)) {
      return reply.status(400).send({ error: "INVALID_BASKET_STATUS" });
    }
    const basket = adminService.toggleBasketStatus(slug, status);
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
      const token = adminService.setTokenTradingStatus(mint, tradingStatus);
      return { token };
    } catch {
      return reply.status(404).send({ error: "TOKEN_NOT_FOUND" });
    }
  });

  app.post("/v1/admin/baskets/:slug/publish", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { slug } = req.params;
    const { version, changelog, legs, publishedBy, requireApproval } = (req.body || {}) as {
      version?: number;
      changelog?: string;
      legs?: Array<{ mint: string; weightBps: number; legType?: string; venueHint?: string; slippageBps?: number }>;
      publishedBy?: string;
      requireApproval?: { approver: string; note?: string };
    };
    if (!version || !Array.isArray(legs) || legs.length === 0) {
      return reply.status(400).send({ error: "VERSION_AND_LEGS_REQUIRED" });
    }
    const basket = repository.getBasketBySlug(slug);
    if (!basket) return reply.status(404).send({ error: "BASKET_NOT_FOUND" });

    const versionResult = adminService.publishBasketVersion(slug, {
      version,
      changelog: changelog || `Version ${version}`,
      publishedBy: publishedBy || "admin",
      legs: legs.map((l, i) => ({
        id: `leg-${version}-${i}`,
        mint: l.mint,
        weightBps: l.weightBps,
        legType: l.legType || "spl",
        venueHint: l.venueHint,
        slippageBps: l.slippageBps,
      })),
    } as never);

    // Publishing must NEVER move funds (PRD); opted-in auto-rebalance runs
    // asynchronously against policy caps for embedded wallets only.
    if (requireApproval?.approver) {
      repository.logAudit({
        actor: requireApproval.approver,
        action: "APPROVE_BASKET_PUBLISH",
        entity: "basket_version",
        entityId: versionResult.id,
        after: { note: requireApproval.note ?? "" },
      });
    }
    void rebalanceService
      .applyAutoRebalanceOnPublish(basket.id, versionResult.id)
      .catch((err) => console.error("[admin] auto-rebalance sweep failed:", err));

    return { version: versionResult };
  });

  app.get("/v1/admin/executions", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { status, limit } = req.query as { status?: string; limit?: string };
    const executions = repository.listExecutions(
      (status as never) || undefined,
      limit ? Math.min(Number(limit) || 50, 200) : 50
    );
    return { executions };
  });

  app.get("/v1/admin/fees", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return { fees: repository.listFees() };
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
      repository.logAudit({
        actor: simWallet,
        action: "FAUCET_AIRDROP_SIMULATED",
        entity: "faucet",
        entityId: simWallet,
        after: { amountUi: 1_000, simulated: true },
      });
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
      repository.logAudit({
        actor: walletAddress,
        action: "FAUCET_AIRDROP",
        entity: "faucet",
        entityId: ata.toBase58(),
        after: { amountUi: FAUCET_USDC_UI, mint: state.usdc.mint },
      });
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
