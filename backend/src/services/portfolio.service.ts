import { PublicKey } from "@solana/web3.js";
import { repository } from "../db/repository";
import { Position } from "../db/schema";
import { AppError } from "../errors";
import { config } from "../config";
import { getConnection } from "../chain/connection";
import { getTokenBalances } from "../chain/balances";
import { loadDevnetState } from "../chain/devnetState";

/**
 * Portfolio service (PFOLIO lane, contracts.md §10; PRD §4.5).
 *
 * There is no vault: a position stores what WAS bought; live state is derived
 * from real on-chain token balances × latest known price. All reads refresh:
 *   - per-leg amount = on-chain balance (base units → UI via token decimals)
 *   - per-leg value   = amount × latestPrice(mint) (fallback token.priceUsd)
 *   - driftPct        = max |currentWeightBps − targetBps| in percentage points
 *   - rebalanceAvailable = basket.activeVersionId !== position.basketVersionId
 *
 * Refresh is best-effort: if the RPC is unreachable we degrade gracefully to
 * the last stored amounts instead of failing the portfolio read.
 */

/** Delegated-signing policy shape (contracts.md §2 Policy). */
export interface PolicyShape {
  allowlistMints: string[];
  maxSpendUsdcPerRebalance: number;
  maxSlippageBps: number;
  version?: number; // Basket version this policy is tied to (absent in pre-v2 rows)
  updatedAt?: string; // ISO timestamp when policy was last updated
}

/** Only these repository accessors are still pending (not in contracts §4). */
type RepoExtras = {
  getAllPositions?(): Position[];
  getPositionsForBasket?(basketId: string): Position[];
};
const REPO = repository as typeof repository & RepoExtras;

/** Contract §2 config field (landed). */
export const DUST_THRESHOLD_USDC = config.dustThresholdUsdc;

function enqueueOutboxSafe(event: string, payload: unknown): void {
  try {
    repository.enqueueOutbox(event, payload);
  } catch (err) {
    console.warn(`[portfolio] outbox enqueue failed for ${event}: ${errMsg(err)}`);
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toUiAmount(rawBaseUnits: number, decimals: number): number {
  return Number((rawBaseUnits / Math.pow(10, decimals)).toFixed(Math.min(decimals, 9)));
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

/**
 * Resolve the USDC mint + decimals for this cluster.
 * Order: devnet-state.json (authoritative, CHAIN lane) → token registry →
 * devnet fallback seed mint. USDC always has 6 decimals on our devnet.
 */
export function resolveUsdcAsset(): { mint: string; decimals: number } {
  try {
    const state = loadDevnetState();
    if (state?.usdc?.mint) return { mint: state.usdc.mint, decimals: state.usdc.decimals ?? 6 };
  } catch {
    /* fall through to registry */
  }
  const token = repository
    .getAllTokens()
    .find((t) => t.symbol?.toUpperCase() === "USDC" || (t.type === "stablecoin" && /usdc/i.test(t.symbol)));
  if (token) return { mint: token.mint, decimals: token.decimals };
  // Same fallback mint as db/seed.ts (devnet test USDC).
  return { mint: "An9DFuHeSDYgVBiybraa7Svn1RHjrDb7Ed8YJZCZ4D1Y", decimals: 6 };
}

/** Latest known price for a mint: price snapshot first, registry second. */
export function priceOf(mint: string): number {
  const snap = repository.latestPrice(mint);
  if (snap && Number.isFinite(snap.priceUsd) && snap.priceUsd > 0) return snap.priceUsd;
  const token = repository.getToken(mint);
  return token?.priceUsd && token.priceUsd > 0 ? token.priceUsd : 0;
}

/**
 * Every position we can discover, for basket-wide scans (reconciler,
 * applyAutoRebalanceOnPublish). Strategy order:
 *  1. repository.getAllPositions()   (if the DB layer adds it)
 *  2. repository.getPositionsForBasket() unioned over all baskets
 *  3. distinct wallets from listExecutions() → getPositionsForWallet()
 *     (positions only ever originate from executions, so this is complete)
 */
export function getAllKnownPositions(): Position[] {
  if (typeof REPO.getAllPositions === "function") {
    return REPO.getAllPositions() ?? [];
  }
  const seen = new Set<string>();
  const out: Position[] = [];
  const push = (p: Position) => {
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  };
  if (typeof REPO.getPositionsForBasket === "function") {
    for (const basket of repository.getAllBaskets()) {
      for (const p of REPO.getPositionsForBasket(basket.id) ?? []) push(p);
    }
    return out;
  }
  const wallets = new Set<string>();
  for (const exec of repository.listExecutions(undefined, 10_000)) {
    if (exec?.walletAddress) wallets.add(exec.walletAddress);
  }
  for (const walletAddress of wallets) {
    for (const p of repository.getPositionsForWallet(walletAddress)) push(p);
  }
  return out;
}

export class PortfolioService {
  /**
   * Refresh a position in place from real on-chain balances and persist the
   * refreshed last_known_amount + currentValueUsd. Never throws: RPC failures
   * degrade to the last stored amounts (drift/value still recomputed).
   */
  private async refreshPosition(pos: Position): Promise<Position> {
    const basket = repository.getBasket(pos.basketId);
    pos.rebalanceAvailable = !!basket && basket.activeVersionId !== pos.basketVersionId;

    const activeLegs = pos.status === "ACTIVE" || pos.status === "MODIFIED";
    if (!activeLegs || pos.legs.length === 0) {
      return pos;
    }

    let onChain: Record<string, number> | null = null;
    if (config.simulateLanding) {
      // Simulation mode (PRD §11.2 test data): no real tokens exist on any
      // reachable chain — derive live value from the simulated ledger amounts
      // the landing worker persisted.
      onChain = null;
    } else {
      try {
        const usdc = resolveUsdcAsset();
        const mints = [...new Set([...pos.legs.map((l) => l.mint), usdc.mint])].filter(
          (m) => m.length > 0
        );
        const owner = new PublicKey(pos.walletAddress);
        onChain = await getTokenBalances(
          getConnection(),
          owner,
          mints.map((m) => new PublicKey(m))
        );
      } catch (err) {
        console.warn(
          `[portfolio] on-chain refresh failed for position ${pos.id} (degrading to stored amounts): ${errMsg(err)}`
        );
      }
    }

    let totalValue = 0;
    let maxDeviationBps = 0;
    for (const leg of pos.legs) {
      const token = repository.getToken(leg.mint);
      const decimals = token?.decimals ?? 6;
      if (onChain && onChain[leg.mint] !== undefined) {
        leg.currentAmount = toUiAmount(onChain[leg.mint], decimals);
      }
      const price = priceOf(leg.mint);
      leg.currentValueUsd = round2(leg.currentAmount * price);
      totalValue += leg.currentValueUsd;
    }

    pos.currentValueUsd = round2(totalValue);
    if (totalValue > 0) {
      for (const leg of pos.legs) {
        const currentWeightBps = (leg.currentValueUsd / totalValue) * 10_000;
        maxDeviationBps = Math.max(maxDeviationBps, Math.abs(currentWeightBps - leg.targetBps));
      }
      pos.driftPct = Number((maxDeviationBps / 100).toFixed(2));
    }

    this.persistRefresh(pos);
    return pos;
  }

  /**
   * Persist refreshed amounts; individual persistence failures never throw.
   * Exported so the reconciler can absorb sub-tolerance drift without
   * re-fetching balances.
   */
  persistRefresh(pos: Position): void {
    pos.updatedAt = new Date().toISOString();
    try {
      repository.savePosition(pos);
      for (const leg of pos.legs) {
        repository.upsertPositionLeg(pos.id, leg.mint, leg.targetBps, leg.currentAmount);
      }
    } catch (err) {
      console.warn(`[portfolio] persist refresh failed for ${pos.id}: ${errMsg(err)}`);
    }
  }

  /** Live portfolio for a wallet (async; refreshes every ACTIVE/MODIFIED position). */
  async getPositions(walletAddress: string): Promise<Position[]> {
    const positions = repository.getPositionsForWallet(walletAddress);
    for (const pos of positions) {
      await this.refreshPosition(pos);
    }
    return positions;
  }

  /** Single position with the same live refresh; null when not found. */
  async getPosition(id: string): Promise<Position | null> {
    const pos = repository.getPosition(id);
    if (!pos) return null;
    await this.refreshPosition(pos);
    return pos;
  }

  /**
   * Mark a position MODIFIED (user sold/transferred a leg outside Kairos, or
   * the reconciler detected an external change): excluded from auto-rebalance,
   * audited with before/after and announced on the outbox.
   */
  markPositionModified(id: string, reason: string, detail?: { before?: unknown; after?: unknown }): Position {
    const pos = repository.getPosition(id);
    if (!pos) throw new AppError("POSITION_NOT_FOUND", `Position ${id} not found`);

    const before = detail?.before ?? {
      status: pos.status,
      autoRebalance: pos.autoRebalance,
      legs: pos.legs.map((l) => ({ mint: l.mint, amount: l.currentAmount })),
    };
    pos.status = "MODIFIED";
    pos.autoRebalance = false;
    pos.updatedAt = new Date().toISOString();
    const after = detail?.after ?? {
      status: pos.status,
      autoRebalance: pos.autoRebalance,
      reason,
    };

    repository.savePosition(pos);
    repository.logAudit({
      actor: pos.walletAddress,
      action: "POSITION_MODIFIED_EXTERNALLY",
      entity: "position",
      entityId: pos.id,
      before,
      after,
    });
    enqueueOutboxSafe("position.modified", {
      positionId: pos.id,
      walletAddress: pos.walletAddress,
      basketId: pos.basketId,
      reason,
      before,
      after,
      ts: pos.updatedAt,
    });
    return pos;
  }

  /**
   * Pure close preview (no execution is created here): what selling every leg
   * back to USDC would return after the platform fee.
   */
  async prepareClose(positionId: string): Promise<object> {
    const pos = await this.getPosition(positionId);
    if (!pos) throw new AppError("POSITION_NOT_FOUND", `Position ${positionId} not found`);

    const feeMultiplier = 1 - config.platformFeeBps / 10_000;
    return {
      positionId: pos.id,
      basketId: pos.basketId,
      estimatedReturnUsdc: round2(pos.currentValueUsd * feeMultiplier),
      legsToSell: pos.legs.map((l) => ({
        mint: l.mint,
        symbol: l.symbol,
        amountToSell: l.currentAmount,
      })),
      expiresAt: new Date(Date.now() + config.quoteValiditySec * 1000).toISOString(),
    };
  }

  /**
   * Enable/disable auto-rebalance on a position (PRD §4.6). Enabling requires
   * an embedded wallet with delegated signing already opted in; the scoped
   * policy (allowlist mints, per-run spend cap, max slippage) is persisted on
   * the wallet and re-read at every run, so revocation is immediate.
   */
  async setAutoRebalance(positionId: string, enabled: boolean, policy?: Partial<PolicyShape>): Promise<Position> {
    const pos = repository.getPosition(positionId);
    if (!pos) throw new AppError("POSITION_NOT_FOUND", `Position ${positionId} not found`);

    const wallet = repository.getWalletByAddress(pos.walletAddress);
    if (!wallet) {
      throw new AppError("UNAUTHORIZED", `Wallet ${pos.walletAddress} is not registered`);
    }
    if (enabled && wallet.type !== "embedded") {
      throw new AppError(
        "UNAUTHORIZED",
        "AUTO_REBALANCE_REQUIRES_EMBEDDED_WALLET: external wallets cannot delegate signing"
      );
    }
    if (enabled && !wallet.delegatedSigning) {
      throw new AppError(
        "UNAUTHORIZED",
        "DELEGATED_SIGNING_NOT_ENABLED: opt in to delegated signing before enabling auto-rebalance"
      );
    }

    const merged = this.mergePolicy(pos, wallet.policyJson, policy, enabled);

    pos.autoRebalance = enabled;
    pos.updatedAt = new Date().toISOString();
    repository.savePosition(pos);

    // Persist policy on the wallet when enabling (keeps delegatedSigning on).
    // Disabling never flips the wallet-level flag: other positions may rely on
    // it, and position-level revocation is enough (policy is read at run time).
    if (enabled) {
      try {
        repository.setDelegatedSigning(wallet.id, true, merged);
      } catch (err) {
        console.warn(`[portfolio] setDelegatedSigning failed for ${wallet.id}: ${errMsg(err)}`);
      }
    }

    repository.logAudit({
      actor: pos.walletAddress,
      action: enabled ? "AUTO_REBALANCE_ENABLED" : "AUTO_REBALANCE_DISABLED",
      entity: "position",
      entityId: pos.id,
      before: { autoRebalance: !enabled },
      after: { autoRebalance: enabled, policy: merged },
    });
    enqueueOutboxSafe(`autorebalance.${enabled}`, {
      positionId: pos.id,
      basketId: pos.basketId,
      walletAddress: pos.walletAddress,
      policy: merged,
      ts: pos.updatedAt,
    });

    return pos;
  }

  /** Merge/validate the effective policy for a position's wallet. */
  private mergePolicy(
    pos: Position,
    existing: PolicyShape | undefined,
    patch: Partial<PolicyShape> | undefined,
    enabled: boolean
  ): PolicyShape {
    if (!enabled) {
      return (
        existing ?? {
          allowlistMints: [],
          maxSpendUsdcPerRebalance: 0,
          maxSlippageBps: 0,
          version: 0,
          updatedAt: new Date().toISOString()
        }
      );
    }

    // Default policy when none exists: allowlist the position's basket legs,
    // spend cap covers a full single rebalance of this position.
    let base = existing;
    if (!base) {
      const basket = repository.getBasket(pos.basketId);
      const version = basket ? repository.getBasketVersion(basket.activeVersionId) : undefined;
      const allowlist = new Set<string>(pos.legs.map((l) => l.mint));
      for (const leg of version?.legs ?? []) allowlist.add(leg.mint);
      base = {
        allowlistMints: [...allowlist],
        maxSpendUsdcPerRebalance: Math.max(round2(pos.currentValueUsd * 1.1), config.minBasketUsdc),
        maxSlippageBps: 100,
        version: version?.version ?? 0,
        updatedAt: new Date().toISOString()
      };
    }

    const merged: PolicyShape = {
      allowlistMints: patch?.allowlistMints ?? base.allowlistMints ?? [],
      maxSpendUsdcPerRebalance: patch?.maxSpendUsdcPerRebalance ?? base.maxSpendUsdcPerRebalance,
      maxSlippageBps: patch?.maxSlippageBps ?? base.maxSlippageBps,
      version: patch?.version ?? base.version,
      updatedAt: new Date().toISOString()
    };

    if (
      !Array.isArray(merged.allowlistMints) ||
      merged.allowlistMints.length === 0 ||
      merged.allowlistMints.some((m) => typeof m !== "string" || m.length === 0)
    ) {
      throw new AppError("UNAUTHORIZED", "INVALID_AUTO_REBALANCE_POLICY: allowlistMints must be a non-empty mint list");
    }
    if (!Number.isFinite(merged.maxSpendUsdcPerRebalance) || merged.maxSpendUsdcPerRebalance <= 0) {
      throw new AppError("UNAUTHORIZED", "INVALID_AUTO_REBALANCE_POLICY: maxSpendUsdcPerRebalance must be > 0");
    }
    if (
      !Number.isInteger(merged.maxSlippageBps) ||
      merged.maxSlippageBps < 1 ||
      merged.maxSlippageBps > 10_000
    ) {
      throw new AppError("UNAUTHORIZED", "INVALID_AUTO_REBALANCE_POLICY: maxSlippageBps must be 1..10000");
    }
    return merged;
  }
}

export const portfolioService = new PortfolioService();
