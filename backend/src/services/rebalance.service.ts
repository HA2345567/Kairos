import { PublicKey } from "@solana/web3.js";
import { repository } from "../db/repository";
import type { Position } from "../db/schema";
import { AppError } from "../errors";
import { getConnection } from "../chain/connection";
import { getAllKnownPositions, type PolicyShape, portfolioService } from "./portfolio.service";
import { executionService } from "./execution.service";
import { computeRebalancePlan, type RebalancePlan } from "./rebalance-plan";
import { assembleRebalanceExecution, type PreparedExecution } from "./rebalance-build";
export type { PreparedExecution, RebalancePreview } from "./rebalance-build";

/**
 * Rebalance service (PFOLIO lane, contracts.md §10; PRD §4.6).
 *
 * Manual rebalance / close share the open flow's prepare→sign→submit→land
 * state machine: we build "rebalance"/"close" Executions with REAL partially
 * signed devnet transactions (relayer fee payer + treasury partial signatures,
 * user signature intentionally missing) and return them PREPARED — the route
 * layer submits via executionService.submit, which byte-verifies and enqueues
 * landing jobs. Jobs are enqueued ONLY at submit, never at prepare.
 *
 * Legs are strictly sell-then-buy: sells convert over-weight legs to USDC
 * (a fee is deducted from each sell), then buys redeploy net proceeds with
 * their own per-leg fee. Rebalances default to 10 bps on each side.
 */

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function enqueueOutboxSafe(event: string, payload: unknown): Promise<void> {
  try {
    (await repository.enqueueOutbox(event, payload));
  } catch (err) {
    console.warn(`[rebalance] outbox enqueue failed for ${event}: ${errMsg(err)}`);
  }
}

export class RebalanceService {
  /**
   * Reject empty plans and buys without a funding sell.
   */
  private assertRebalancePlanIsExecutable(plan: RebalancePlan): void {
    if (plan.sells.length === 0 && plan.buys.length === 0) {
      throw new AppError("UNAUTHORIZED", "NO_REBALANCE_REQUIRED: position already matches target weights");
    }
    if (plan.sells.length === 0 && plan.buys.length > 0) {
      // Sell-then-buy: buys are funded only by sell proceeds.
      throw new AppError("INSUFFICIENT_BALANCE", "NO_SELLABLE_ASSETS: under-weight legs cannot be funded without sells");
    }
  }

  /** Shared validation + idempotency for prepare paths. */
  private async prepareBase(
    positionId: string,
    idempotencyKey: string,
    walletAddress: string,
    expectedType: "rebalance" | "close"
  ): Promise<{ pos: Position; walletId: string; replay: PreparedExecution | null }> {
    const pos = (await repository.getPosition(positionId));
    if (!pos) throw new AppError("POSITION_NOT_FOUND", `Position ${positionId} not found`);

    if (pos.walletAddress !== walletAddress) {
      throw new AppError("UNAUTHORIZED", "POSITION_NOT_OWNED_BY_WALLET");
    }
    if (expectedType === "rebalance") {
      if (pos.status === "MODIFIED") {
        throw new AppError("UNAUTHORIZED", "POSITION_MODIFIED_NOT_REBALANCEABLE");
      }
      if (pos.status !== "ACTIVE") {
        throw new AppError("UNAUTHORIZED", "POSITION_NOT_REBALANCEABLE");
      }
    } else if (pos.status === "CLOSED") {
      throw new AppError("UNAUTHORIZED", "POSITION_ALREADY_CLOSED");
    }

    const existing = (await repository.getExecutionByIdempotency(idempotencyKey, walletAddress));
    if (existing) {
      const sameType = expectedType === "rebalance" ? existing.type === "rebalance" : existing.type === "close";
      if (existing.baseExecutionId !== undefined || !sameType || existing.basketId !== pos.basketId) {
        throw new AppError("IDEMPOTENCY_CONFLICT", "Idempotency key already used for a different request");
      }
      // Idempotent replay: return the PREPARED execution as-is (it was
      // produced by assembleExecution on the first call, so preview exists).
      return { pos, walletId: existing.walletId, replay: existing as PreparedExecution };
    }

    const wallet = (await repository.getWalletByAddress(walletAddress));
    const walletId = wallet?.id ?? `wal-${walletAddress.slice(0, 8)}`;
    return { pos, walletId, replay: null };
  }

  /**
   * Manual rebalance prepare (PRD §4.6): current vs target weights →
   * sell-then-buy legs with preview; returns a PREPARED "rebalance" execution
   * carrying real partially-signed transactions. Does NOT submit.
   */
  async prepareRebalance(positionId: string, idempotencyKey: string, walletAddress: string): Promise<PreparedExecution> {
    const base = await this.prepareBase(positionId, idempotencyKey, walletAddress, "rebalance");
    if (base.replay) return base.replay;
    const { pos, walletId } = base;

    // Live refresh (on-chain balances × latest prices) before planning.
    const live = (await portfolioService.getPosition(positionId)) ?? pos;

    const basket = (await repository.getBasket(live.basketId));
    if (!basket) throw new AppError("BASKET_NOT_FOUND", `Basket ${live.basketId} not found`);
    if (basket.status !== "active") throw new AppError("BASKET_NOT_ACTIVE", "Basket is paused or deprecated");
    const version = (await repository.getBasketVersion(basket.activeVersionId));
    if (!version) throw new AppError("BASKET_NOT_FOUND", "Active basket version not found");

    const weightSum = version.legs.reduce((sum, l) => sum + l.weightBps, 0);
    if (version.legs.length === 0 || weightSum !== 10_000) {
      throw new AppError("WEIGHT_SUM_INVALID", `Target version weights sum to ${weightSum}, expected 10000`);
    }

    const plan = (await computeRebalancePlan(live, version.legs, false));
    this.assertRebalancePlanIsExecutable(plan);

    const execution = await assembleRebalanceExecution({
      conn: getConnection(),
      user: new PublicKey(live.walletAddress),
      walletAddress: live.walletAddress,
      walletId,
      idempotencyKey,
      type: "rebalance",
      basketId: live.basketId,
      basketVersionId: version.id,
      plan,
      fromVersionId: live.basketVersionId,
    });

    (await repository.saveExecution(execution));
    (await repository.addRebalanceEvent(live.id, live.basketVersionId, version.id, "PREPARED"));
    (await repository.logAudit({
      actor: walletAddress,
      action: "PREPARE_REBALANCE",
      entity: "execution",
      entityId: execution.id,
      after: {
        positionId: live.id,
        fromVersion: live.basketVersionId,
        toVersion: version.id,
        totalSellUsdc: plan.totalSellUsdc,
        feeUsdc: plan.feeUsdc,
        sells: plan.sells.length,
        buys: plan.buys.length,
      },
    }));

    return execution;
  }

  /**
   * Close prepare: sell ALL legs back to USDC (reverse legs only). Returns a
   * PREPARED "close" execution; MODIFIED positions may still be closed.
   */
  async prepareCloseExecution(positionId: string, idempotencyKey: string, walletAddress: string): Promise<PreparedExecution> {
    const base = await this.prepareBase(positionId, idempotencyKey, walletAddress, "close");
    if (base.replay) return base.replay;
    const { pos, walletId } = base;

    const live = (await portfolioService.getPosition(positionId)) ?? pos;
    if (live.legs.every((l) => l.currentAmount <= 0)) {
      throw new AppError("DUST_LEG_FORBIDDEN", "NOTHING_TO_CLOSE: position holds no assets");
    }

    const plan = (await computeRebalancePlan(live, [], true));
    this.assertRebalancePlanIsExecutable(plan);

    const execution = await assembleRebalanceExecution({
      conn: getConnection(),
      user: new PublicKey(live.walletAddress),
      walletAddress: live.walletAddress,
      walletId,
      idempotencyKey,
      type: "close",
      basketId: live.basketId,
      basketVersionId: live.basketVersionId,
      plan,
      fromVersionId: live.basketVersionId,
    });

    (await repository.saveExecution(execution));
    (await repository.logAudit({
      actor: walletAddress,
      action: "PREPARE_CLOSE",
      entity: "execution",
      entityId: execution.id,
      after: {
        positionId: live.id,
        totalSellUsdc: plan.totalSellUsdc,
        feeUsdc: plan.feeUsdc,
        legs: plan.sells.length,
      },
    }));

    return execution;
  }

  /**
   * Auto-rebalance fan-out on basket version publish (PRD §4.6).
   *
   * Finds ACTIVE positions on this basket with autoRebalance=true, re-reads
   * each wallet's delegated-signing policy AT RUN TIME (so revocation is
   * immediate), enforces: allowlistMints ⊇ new version legs, per-run spend
   * cap ≥ required USDC move, maxSlippageBps ≥ effective leg slippage — then
   * prepares + submits a rebalance execution per position. Batched: max 3
   * concurrent with 1 s spacing between batches.
   */
  async applyAutoRebalanceOnPublish(basketId: string, newVersionId: string): Promise<void> {
    const basket = (await repository.getBasket(basketId));
    if (!basket) throw new AppError("BASKET_NOT_FOUND", `Basket ${basketId} not found`);
    const version = (await repository.getBasketVersion(newVersionId));
    if (!version || version.basketId !== basketId) {
      throw new AppError("BASKET_NOT_FOUND", `Version ${newVersionId} does not belong to basket ${basketId}`);
    }
    const weightSum = version.legs.reduce((sum, l) => sum + l.weightBps, 0);
    if (version.legs.length === 0 || weightSum !== 10_000) {
      throw new AppError("WEIGHT_SUM_INVALID", `Version weights sum to ${weightSum}, expected 10000`);
    }

    const candidates = (await getAllKnownPositions()).filter(
      (p) =>
        p.basketId === basketId &&
        p.status === "ACTIVE" &&
        p.autoRebalance === true &&
        p.basketVersionId !== newVersionId
    );

    (await enqueueOutboxSafe("autorebalance.run", {
      phase: "batch_start",
      basketId,
      newVersionId,
      candidates: candidates.length,
      ts: new Date().toISOString(),
    }));

    let executed = 0;
    let skipped = 0;
    let failed = 0;

    const runOne = async (pos: Position): Promise<void> => {
      try {
        const wallet = (await repository.getWalletByAddress(pos.walletAddress));
        if (!wallet || wallet.type !== "embedded" || !wallet.delegatedSigning || !wallet.policyJson) {
          skipped++;
          (await this.auditSkip(pos, newVersionId, "WALLET_POLICY_MISSING_OR_REVOKED"));
          return;
        }
        const policy: PolicyShape = wallet.policyJson;

        // Policy gate 1: allowlist ⊇ new version legs.
        const missingMints = version.legs.filter((l) => !policy.allowlistMints.includes(l.mint));
        if (missingMints.length > 0) {
          skipped++;
          (await this.auditSkip(pos, newVersionId, "ALLOWLIST_MISSING_MINTS", { missingMints: missingMints.map((m) => m.mint) }));
          return;
        }
        // Policy gate 2: effective leg slippage within cap.
        const worstSlippage = Math.max(...version.legs.map((l) => l.slippageBps ?? 50));
        if (worstSlippage > policy.maxSlippageBps) {
          skipped++;
          (await this.auditSkip(pos, newVersionId, "SLIPPAGE_BPS_EXCEEDS_POLICY", { worstSlippage, policyMax: policy.maxSlippageBps }));
          return;
        }
        // Policy gate 3: per-run spend cap ≥ required USDC move.
        const plan = (await computeRebalancePlan(pos, version.legs, false));
        if (plan.sells.length === 0 && plan.buys.length === 0) {
          skipped++;
          (await this.auditSkip(pos, newVersionId, "NO_REBALANCE_REQUIRED"));
          return;
        }
        if (plan.totalSellUsdc > policy.maxSpendUsdcPerRebalance) {
          skipped++;
          (await this.auditSkip(pos, newVersionId, "SPEND_CAP_EXCEEDED", {
            requiredUsdc: plan.totalSellUsdc,
            cap: policy.maxSpendUsdcPerRebalance,
          }));
          return;
        }

        (await enqueueOutboxSafe("autorebalance.run", {
          phase: "position_start",
          positionId: pos.id,
          basketId,
          newVersionId,
          requiredUsdc: plan.totalSellUsdc,
          ts: new Date().toISOString(),
        }));

        // Deterministic key → republishing/rerunning the same version cannot
        // double-execute for a position.
        const idempotencyKey = `auto-${pos.id}-${newVersionId}`;
        const execution = await this.prepareRebalance(pos.id, idempotencyKey, pos.walletAddress);
        const submitted = await executionService.submit({
          executionId: execution.id,
          signedTxs: execution.preparedTxs, // delegated path: no client signature step
          idempotencyKey,
        });

        executed++;
        (await repository.addRebalanceEvent(pos.id, pos.basketVersionId, newVersionId, submitted.status));
        (await repository.logAudit({
          actor: pos.walletAddress,
          action: "AUTO_REBALANCE_RUN",
          entity: "position",
          entityId: pos.id,
          after: {
            executionId: submitted.id,
            status: submitted.status,
            fromVersion: pos.basketVersionId,
            toVersion: newVersionId,
            totalSellUsdc: plan.totalSellUsdc,
          },
        }));
        (await enqueueOutboxSafe("autorebalance.run", {
          phase: "position_done",
          positionId: pos.id,
          executionId: submitted.id,
          status: submitted.status,
          basketId,
          newVersionId,
          ts: new Date().toISOString(),
        }));
      } catch (err) {
        failed++;
        (await repository.logAudit({
          actor: pos.walletAddress,
          action: "AUTO_REBALANCE_FAILED",
          entity: "position",
          entityId: pos.id,
          after: { basketId, newVersionId, error: errMsg(err) },
        }));
        (await enqueueOutboxSafe("autorebalance.run", {
          phase: "position_failed",
          positionId: pos.id,
          basketId,
          newVersionId,
          error: errMsg(err),
          ts: new Date().toISOString(),
        }));
        console.error(`[rebalance] auto-rebalance failed for ${pos.id}: ${errMsg(err)}`);
      }
    };

    // Batches of 3, 1 s spacing between batches.
    for (let i = 0; i < candidates.length; i += 3) {
      const batch = candidates.slice(i, i + 3);
      await Promise.all(batch.map(runOne));
      if (i + 3 < candidates.length) await delay(1000);
    }

    (await enqueueOutboxSafe("autorebalance.run", {
      phase: "batch_done",
      basketId,
      newVersionId,
      executed,
      skipped,
      failed,
      ts: new Date().toISOString(),
    }));
  }

  private async auditSkip(pos: Position, newVersionId: string, reason: string, detail?: Record<string, unknown>): Promise<void> {
    (await repository.logAudit({
      actor: pos.walletAddress,
      action: "AUTO_REBALANCE_SKIPPED_POLICY",
      entity: "position",
      entityId: pos.id,
      after: { newVersionId, reason, ...detail },
    }));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const rebalanceService = new RebalanceService();
