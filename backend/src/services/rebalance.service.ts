import { randomUUID } from "node:crypto";
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { repository } from "../db/repository";
import { Execution, ExecutionLeg, Position } from "../db/schema";
import { AppError } from "../errors";
import { config } from "../config";
import { getConnection } from "../chain/connection";
import {
  buildLegSwapTx,
  buildReverseLegTx,
  getRecentBlockhash,
  simulate,
  USDC_DECIMALS,
} from "../chain/mockSwap";
import { DEVNET_LABELS, deterministicKeypair } from "../chain/devnetState";
import { relayerService } from "./relayer.service";
import {
  DUST_THRESHOLD_USDC,
  getAllKnownPositions,
  PolicyShape,
  portfolioService,
  priceOf,
  resolveUsdcAsset,
} from "./portfolio.service";
import { executionService } from "./execution.service";

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
 * (platform fee taken out of the first sell leg's proceeds), buys redeploy the
 * net USDC across the target version's under-weight legs.
 */

type RelayerExtras = { getKeypair?: () => Keypair };
const RELAYER = relayerService as typeof relayerService & RelayerExtras;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function enqueueOutboxSafe(event: string, payload: unknown): void {
  try {
    repository.enqueueOutbox(event, payload);
  } catch (err) {
    console.warn(`[rebalance] outbox enqueue failed for ${event}: ${errMsg(err)}`);
  }
}

function relayerKeypair(): Keypair {
  if (typeof RELAYER.getKeypair === "function") return RELAYER.getKeypair(); // contracts §7
  // Pre-§2 fallback while relayer.service is being rewritten by the CHAIN lane.
  return (config as { relayerKeypair?: Keypair }).relayerKeypair as Keypair;
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}
function round4(n: number): number {
  return Number(n.toFixed(4));
}
function fmtOut(uiAmount: number, decimals: number): string {
  return uiAmount.toFixed(Math.max(0, Math.min(decimals, 6)));
}

export interface PlannedSell {
  mint: string;
  symbol: string;
  assetDecimals: number;
  amountAssetUi: number;
  inAssetBaseUnits: number;
  expectedUsdcOut: number;
  priceUsd: number;
  currentWeightBps: number;
  targetBps: number;
}

export interface PlannedBuy {
  mint: string;
  symbol: string;
  assetDecimals: number;
  usdcIn: number;
  inUsdcBaseUnits: number;
  expectedAssetOutUi: number;
  expectedOutBaseUnits: number;
  priceUsd: number;
  targetBps: number;
}

export interface RebalancePlan {
  sells: PlannedSell[];
  buys: PlannedBuy[];
  totalSellUsdc: number;
  feeUsdc: number;
  netUsdcToRedeploy: number;
  totalValueUsdc: number;
  driftBeforePct: number;
}

export interface RebalancePreview {
  kind: "rebalance" | "close";
  fromVersionId: string;
  toVersionId: string;
  totalSellUsdc: number;
  feeUsdc: number;
  netUsdcToRedeploy: number;
  estimatedReturnUsdc: number;
  estimatedPriceImpactPct: string;
  driftBeforePct: number;
  sells: Array<{
    mint: string;
    symbol: string;
    amountToSell: string;
    expectedUsdcOut: string;
  }>;
  buys: Array<{
    mint: string;
    symbol: string;
    usdcIn: string;
    expectedOut: string;
  }>;
  expiresAt: string;
}

export type PreparedExecution = Execution & { preview: RebalancePreview };

export class RebalanceService {
  /**
   * Compute the sell-then-buy plan for moving `pos` onto `versionLegs`.
   * closeAll=true → every held leg is sold to USDC, no buys.
   */
  private computePlan(pos: Position, versionLegs: Array<{ mint: string; weightBps: number; slippageBps?: number }>, closeAll: boolean): RebalancePlan {
    const totalValueUsdc = round2(pos.legs.reduce((sum, l) => sum + l.currentValueUsd, 0));

    // drift vs the position's CURRENT version targets (before this rebalance)
    let maxDeviationBps = 0;
    if (totalValueUsdc > 0) {
      for (const leg of pos.legs) {
        const weightBps = (leg.currentValueUsd / totalValueUsdc) * 10_000;
        maxDeviationBps = Math.max(maxDeviationBps, Math.abs(weightBps - leg.targetBps));
      }
    }
    const driftBeforePct = Number((maxDeviationBps / 100).toFixed(2));

    const targetBpsByMint = new Map<string, number>();
    for (const leg of versionLegs) targetBpsByMint.set(leg.mint, leg.weightBps);

    // ---- sells -------------------------------------------------------------
    const sells: PlannedSell[] = [];
    for (const leg of pos.legs) {
      const token = repository.getToken(leg.mint);
      const decimals = token?.decimals ?? 6;
      const price = priceOf(leg.mint);
      const legValue = round2(leg.currentAmount * price);
      if (leg.currentAmount <= 0 || legValue < DUST_THRESHOLD_USDC) continue; // dust legs are never traded

      let sellUsdc: number;
      if (closeAll) {
        sellUsdc = legValue;
      } else {
        const targetBps = targetBpsByMint.get(leg.mint) ?? 0; // leg dropped from basket → full exit
        const targetValue = (totalValueUsdc * targetBps) / 10_000;
        sellUsdc = round2(legValue - targetValue);
        if (sellUsdc < DUST_THRESHOLD_USDC) continue; // at/under target, or dust adjustment
      }

      const fraction = legValue > 0 ? Math.min(sellUsdc / legValue, 1) : 1;
      const amountAssetUi = Math.min(leg.currentAmount * fraction, leg.currentAmount);
      const inAssetBaseUnits = Math.floor(amountAssetUi * Math.pow(10, decimals));
      if (inAssetBaseUnits < 1) continue;

      sells.push({
        mint: leg.mint,
        symbol: token?.symbol ?? leg.symbol ?? "UNKNOWN",
        assetDecimals: decimals,
        amountAssetUi,
        inAssetBaseUnits,
        expectedUsdcOut: round4(sellUsdc),
        priceUsd: price,
        currentWeightBps: Math.round(totalValueUsdc > 0 ? (legValue / totalValueUsdc) * 10_000 : 0),
        targetBps: closeAll ? 0 : targetBpsByMint.get(leg.mint) ?? 0,
      });
    }
    sells.sort((a, b) => b.expectedUsdcOut - a.expectedUsdcOut); // largest sell first

    const totalSellUsdc = round2(sells.reduce((sum, s) => sum + s.expectedUsdcOut, 0));
    const feeUsdc = round4((totalSellUsdc * config.platformFeeBps) / 10_000);
    const netUsdcToRedeploy = round2(totalSellUsdc - feeUsdc);

    // ---- buys (sell-then-buy: funded solely by net sell proceeds) ----------
    const buys: PlannedBuy[] = [];
    if (!closeAll && netUsdcToRedeploy >= DUST_THRESHOLD_USDC) {
      const gaps = versionLegs.map((leg) => {
        const token = repository.getToken(leg.mint);
        const current = pos.legs.find((l) => l.mint === leg.mint);
        const currentWeightBps =
          totalValueUsdc > 0 && current ? (current.currentValueUsd / totalValueUsdc) * 10_000 : 0;
        return { leg, gapBps: Math.max(leg.weightBps - Math.round(currentWeightBps), 0) };
      });
      const totalGapBps = gaps.reduce((sum, g) => sum + g.gapBps, 0);

      if (totalGapBps > 0) {
        const raw = gaps.map((g) => (netUsdcToRedeploy * g.gapBps) / totalGapBps);
        const rounded = raw.map((usd) => round2(usd));
        // rounding remainder → largest buy
        const remainder = round2(netUsdcToRedeploy - rounded.reduce((s, v) => s + v, 0));
        if (rounded.length > 0 && remainder !== 0) {
          let largest = 0;
          raw.forEach((v, i) => {
            if (v > raw[largest]) largest = i;
          });
          rounded[largest] = round2(rounded[largest] + remainder);
        }

        gaps.forEach((g, i) => {
          const usdcIn = rounded[i];
          if (usdcIn < DUST_THRESHOLD_USDC) return;
          const decimals = repository.getToken(g.leg.mint)?.decimals ?? 6;
          const price = priceOf(g.leg.mint);
          if (price <= 0) return;
          const expectedAssetOutUi = usdcIn / price;
          const expectedOutBaseUnits = Math.floor(expectedAssetOutUi * Math.pow(10, decimals));
          if (expectedOutBaseUnits < 1) return;
          buys.push({
            mint: g.leg.mint,
            symbol: repository.getToken(g.leg.mint)?.symbol ?? "UNKNOWN",
            assetDecimals: decimals,
            usdcIn,
            inUsdcBaseUnits: Math.round(usdcIn * Math.pow(10, USDC_DECIMALS)),
            expectedAssetOutUi,
            expectedOutBaseUnits,
            priceUsd: price,
            targetBps: g.leg.weightBps,
          });
        });
      }
    }

    return {
      sells,
      buys,
      totalSellUsdc,
      feeUsdc,
      netUsdcToRedeploy,
      totalValueUsdc,
      driftBeforePct,
    };
  }

  private assertRebalancePlanIsExecutable(plan: RebalancePlan): void {
    if (plan.sells.length === 0 && plan.buys.length === 0) {
      throw new AppError("UNAUTHORIZED", "NO_REBALANCE_REQUIRED: position already matches target weights");
    }
    if (plan.sells.length === 0 && plan.buys.length > 0) {
      // Sell-then-buy: buys are funded only by sell proceeds.
      throw new AppError("INSUFFICIENT_BALANCE", "NO_SELLABLE_ASSETS: under-weight legs cannot be funded without sells");
    }
  }

  /**
   * Build the REAL prepared transactions (relayer + treasury partial-signed),
   * simulate-gate each leg, and assemble the Execution exactly like the exec
   * lane does for opens (contracts §9): base64 preparedTxs, messageHashes,
   * blockhash, expiresAt, per-leg messageHash.
   */
  private async assembleExecution(opts: {
    conn: Connection;
    user: PublicKey;
    walletAddress: string;
    walletId: string;
    idempotencyKey: string;
    type: "rebalance" | "close";
    basketId: string;
    basketVersionId: string;
    plan: RebalancePlan;
    fromVersionId: string;
  }): Promise<PreparedExecution> {
    const { conn, user, plan } = opts;
    const usdc = resolveUsdcAsset();
    const usdcMint = new PublicKey(usdc.mint);
    const treasury = deterministicKeypair(DEVNET_LABELS.treasury); // PRD §11.1 treasury pattern
    const relayer = relayerKeypair();
    const recentBlockhash = await getRecentBlockhash(conn);
    const feeBaseUnits = Math.round(plan.feeUsdc * Math.pow(10, USDC_DECIMALS));

    const preparedTxs: string[] = [];
    const messageHashes: string[] = [];
    const legs: ExecutionLeg[] = [];
    let legIndex = 0;

    const pushLeg = (lb: { transaction: VersionedTransaction; messageHash: string }, leg: ExecutionLeg) => {
      preparedTxs.push(Buffer.from(lb.transaction.serialize()).toString("base64"));
      messageHashes.push(lb.messageHash);
      legs.push(leg);
      legIndex += 1;
    };

    // sells first (fee rides on the first sell leg, exec-lane "fee in leg 1")
    for (let i = 0; i < plan.sells.length; i++) {
      const s = plan.sells[i];
      const lb = await buildReverseLegTx({
        user,
        usdcMint,
        assetMint: new PublicKey(s.mint),
        assetDecimals: s.assetDecimals,
        inAssetBaseUnits: s.inAssetBaseUnits,
        expectedOutUsdcBaseUnits: Math.round(s.expectedUsdcOut * Math.pow(10, USDC_DECIMALS)),
        treasury,
        relayer,
        includeFeeUsdcBaseUnits: i === 0 ? feeBaseUnits : 0,
        recentBlockhash,
      });
      // Simulation mode (KAIROS_SIMULATE_LANDING=1): skip the RPC simulate
      // gate — the tx is built for real, but no chain state exists on this host.
      if (!config.simulateLanding) {
        const simResult = await simulate(conn, lb.transaction);
        if (!simResult.ok) {
          throw new AppError("SIMULATION_FAILED", `SELL_LEG_${s.mint}: ${simResult.error ?? "simulation failed"}`);
        }
      }
      pushLeg(lb, {
        id: `l-${legIndex + 1}-${randomUUID().slice(0, 8)}`,
        executionId: "", // set once the execution id exists
        mint: s.mint,
        symbol: s.symbol,
        inAmountUsdc: s.expectedUsdcOut, // USDC side of the sell
        expectedOut: s.expectedUsdcOut.toFixed(USDC_DECIMALS),
        messageHash: lb.messageHash,
        status: "PENDING",
      });
    }

    // then buys
    for (const b of plan.buys) {
      const lb = await buildLegSwapTx({
        user,
        usdcMint,
        assetMint: new PublicKey(b.mint),
        assetDecimals: b.assetDecimals,
        inUsdcBaseUnits: b.inUsdcBaseUnits,
        expectedOutBaseUnits: b.expectedOutBaseUnits,
        treasury,
        relayer,
        recentBlockhash,
      });
      if (!config.simulateLanding) {
        const simResult = await simulate(conn, lb.transaction);
        if (!simResult.ok) {
          throw new AppError("SIMULATION_FAILED", `BUY_LEG_${b.mint}: ${simResult.error ?? "simulation failed"}`);
        }
      }
      pushLeg(lb, {
        id: `l-${legIndex + 1}-${randomUUID().slice(0, 8)}`,
        executionId: "",
        mint: b.mint,
        symbol: b.symbol,
        inAmountUsdc: b.usdcIn,
        expectedOut: fmtOut(b.expectedAssetOutUi, b.assetDecimals),
        messageHash: lb.messageHash,
        status: "PENDING",
      });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.quoteValiditySec * 1000).toISOString();
    const execution: Execution = {
      id: "exec-" + randomUUID().slice(0, 10),
      walletId: opts.walletId,
      walletAddress: opts.walletAddress,
      basketId: opts.basketId,
      basketVersionId: opts.basketVersionId,
      type: opts.type,
      status: "PREPARED",
      idempotencyKey: opts.idempotencyKey,
      totalUsdc: plan.totalSellUsdc,
      feeUsdc: plan.feeUsdc,
      preparedTxs,
      messageHashes,
      expiresAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      legs,
    };
    for (const leg of legs) leg.executionId = execution.id;

    const preview: RebalancePreview = {
      kind: opts.type,
      fromVersionId: opts.fromVersionId,
      toVersionId: opts.basketVersionId,
      totalSellUsdc: plan.totalSellUsdc,
      feeUsdc: plan.feeUsdc,
      netUsdcToRedeploy: plan.netUsdcToRedeploy,
      estimatedReturnUsdc: round2(plan.totalSellUsdc - plan.feeUsdc),
      estimatedPriceImpactPct: "0.02%", // mock venue; quote lane reports the same
      driftBeforePct: plan.driftBeforePct,
      sells: plan.sells.map((s) => ({
        mint: s.mint,
        symbol: s.symbol,
        amountToSell: s.amountAssetUi.toFixed(s.assetDecimals),
        expectedUsdcOut: s.expectedUsdcOut.toFixed(2),
      })),
      buys: plan.buys.map((b) => ({
        mint: b.mint,
        symbol: b.symbol,
        usdcIn: b.usdcIn.toFixed(2),
        expectedOut: fmtOut(b.expectedAssetOutUi, b.assetDecimals),
      })),
      expiresAt,
    };
    return { ...execution, preview };
  }

  /** Shared validation + idempotency for prepare paths. */
  private async prepareBase(
    positionId: string,
    idempotencyKey: string,
    walletAddress: string,
    expectedType: "rebalance" | "close"
  ): Promise<{ pos: Position; walletId: string; replay: PreparedExecution | null }> {
    const pos = repository.getPosition(positionId);
    if (!pos) throw new AppError("POSITION_NOT_FOUND", `Position ${positionId} not found`);

    if (pos.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
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

    const existing = repository.getExecutionByIdempotency(idempotencyKey);
    if (existing) {
      const sameWallet = existing.walletAddress?.toLowerCase() === walletAddress.toLowerCase();
      const sameType = expectedType === "rebalance" ? existing.type === "rebalance" : existing.type === "close";
      if (!sameWallet || !sameType) {
        throw new AppError("IDEMPOTENCY_CONFLICT", "Idempotency key already used for a different request");
      }
      // Idempotent replay: return the PREPARED execution as-is (it was
      // produced by assembleExecution on the first call, so preview exists).
      return { pos, walletId: existing.walletId, replay: existing as PreparedExecution };
    }

    const wallet = repository.getWalletByAddress(walletAddress);
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

    const basket = repository.getBasket(live.basketId);
    if (!basket) throw new AppError("BASKET_NOT_FOUND", `Basket ${live.basketId} not found`);
    if (basket.status !== "active") throw new AppError("BASKET_NOT_ACTIVE", "Basket is paused or deprecated");
    const version = repository.getBasketVersion(basket.activeVersionId);
    if (!version) throw new AppError("BASKET_NOT_FOUND", "Active basket version not found");

    const weightSum = version.legs.reduce((sum, l) => sum + l.weightBps, 0);
    if (version.legs.length === 0 || weightSum !== 10_000) {
      throw new AppError("WEIGHT_SUM_INVALID", `Target version weights sum to ${weightSum}, expected 10000`);
    }

    const plan = this.computePlan(live, version.legs, false);
    this.assertRebalancePlanIsExecutable(plan);

    const execution = await this.assembleExecution({
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

    repository.saveExecution(execution);
    repository.addRebalanceEvent(live.id, live.basketVersionId, version.id, "PREPARED");
    repository.logAudit({
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
    });

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

    const plan = this.computePlan(live, [], true);
    this.assertRebalancePlanIsExecutable(plan);

    const execution = await this.assembleExecution({
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

    repository.saveExecution(execution);
    repository.logAudit({
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
    });

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
    const basket = repository.getBasket(basketId);
    if (!basket) throw new AppError("BASKET_NOT_FOUND", `Basket ${basketId} not found`);
    const version = repository.getBasketVersion(newVersionId);
    if (!version || version.basketId !== basketId) {
      throw new AppError("BASKET_NOT_FOUND", `Version ${newVersionId} does not belong to basket ${basketId}`);
    }
    const weightSum = version.legs.reduce((sum, l) => sum + l.weightBps, 0);
    if (version.legs.length === 0 || weightSum !== 10_000) {
      throw new AppError("WEIGHT_SUM_INVALID", `Version weights sum to ${weightSum}, expected 10000`);
    }

    const candidates = getAllKnownPositions().filter(
      (p) =>
        p.basketId === basketId &&
        p.status === "ACTIVE" &&
        p.autoRebalance === true &&
        p.basketVersionId !== newVersionId
    );

    enqueueOutboxSafe("autorebalance.run", {
      phase: "batch_start",
      basketId,
      newVersionId,
      candidates: candidates.length,
      ts: new Date().toISOString(),
    });

    let executed = 0;
    let skipped = 0;
    let failed = 0;

    const runOne = async (pos: Position): Promise<void> => {
      try {
        const wallet = repository.getWalletByAddress(pos.walletAddress);
        if (!wallet || wallet.type !== "embedded" || !wallet.delegatedSigning || !wallet.policyJson) {
          skipped++;
          this.auditSkip(pos, newVersionId, "WALLET_POLICY_MISSING_OR_REVOKED");
          return;
        }
        const policy: PolicyShape = wallet.policyJson;

        // Policy gate 1: allowlist ⊇ new version legs.
        const missingMints = version.legs.filter((l) => !policy.allowlistMints.includes(l.mint));
        if (missingMints.length > 0) {
          skipped++;
          this.auditSkip(pos, newVersionId, "ALLOWLIST_MISSING_MINTS", { missingMints: missingMints.map((m) => m.mint) });
          return;
        }
        // Policy gate 2: effective leg slippage within cap.
        const worstSlippage = Math.max(...version.legs.map((l) => l.slippageBps ?? 50));
        if (worstSlippage > policy.maxSlippageBps) {
          skipped++;
          this.auditSkip(pos, newVersionId, "SLIPPAGE_BPS_EXCEEDS_POLICY", { worstSlippage, policyMax: policy.maxSlippageBps });
          return;
        }
        // Policy gate 3: per-run spend cap ≥ required USDC move.
        const plan = this.computePlan(pos, version.legs, false);
        if (plan.sells.length === 0 && plan.buys.length === 0) {
          skipped++;
          this.auditSkip(pos, newVersionId, "NO_REBALANCE_REQUIRED");
          return;
        }
        if (plan.totalSellUsdc > policy.maxSpendUsdcPerRebalance) {
          skipped++;
          this.auditSkip(pos, newVersionId, "SPEND_CAP_EXCEEDED", {
            requiredUsdc: plan.totalSellUsdc,
            cap: policy.maxSpendUsdcPerRebalance,
          });
          return;
        }

        enqueueOutboxSafe("autorebalance.run", {
          phase: "position_start",
          positionId: pos.id,
          basketId,
          newVersionId,
          requiredUsdc: plan.totalSellUsdc,
          ts: new Date().toISOString(),
        });

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
        repository.addRebalanceEvent(pos.id, pos.basketVersionId, newVersionId, submitted.status);
        repository.logAudit({
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
        });
        enqueueOutboxSafe("autorebalance.run", {
          phase: "position_done",
          positionId: pos.id,
          executionId: submitted.id,
          status: submitted.status,
          basketId,
          newVersionId,
          ts: new Date().toISOString(),
        });
      } catch (err) {
        failed++;
        repository.logAudit({
          actor: pos.walletAddress,
          action: "AUTO_REBALANCE_FAILED",
          entity: "position",
          entityId: pos.id,
          after: { basketId, newVersionId, error: errMsg(err) },
        });
        enqueueOutboxSafe("autorebalance.run", {
          phase: "position_failed",
          positionId: pos.id,
          basketId,
          newVersionId,
          error: errMsg(err),
          ts: new Date().toISOString(),
        });
        console.error(`[rebalance] auto-rebalance failed for ${pos.id}: ${errMsg(err)}`);
      }
    };

    // Batches of 3, 1 s spacing between batches.
    for (let i = 0; i < candidates.length; i += 3) {
      const batch = candidates.slice(i, i + 3);
      await Promise.all(batch.map(runOne));
      if (i + 3 < candidates.length) await delay(1000);
    }

    enqueueOutboxSafe("autorebalance.run", {
      phase: "batch_done",
      basketId,
      newVersionId,
      executed,
      skipped,
      failed,
      ts: new Date().toISOString(),
    });
  }

  private auditSkip(pos: Position, newVersionId: string, reason: string, detail?: Record<string, unknown>): void {
    repository.logAudit({
      actor: pos.walletAddress,
      action: "AUTO_REBALANCE_SKIPPED_POLICY",
      entity: "position",
      entityId: pos.id,
      after: { newVersionId, reason, ...detail },
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const rebalanceService = new RebalanceService();
