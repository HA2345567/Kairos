import { repository } from "../db/repository";
import type { Position } from "../db/schema";
import { config } from "../config";
import { DUST_THRESHOLD_USDC, priceOf } from "./portfolio.service";
import { allocateBase, feeBase, usdcBase } from "./fees";

const round2 = (n: number) => Number(n.toFixed(2));
const round4 = (n: number) => Number(n.toFixed(4));

export interface PlannedSell {
  mint: string;
  symbol: string;
  assetDecimals: number;
  amountAssetUi: number;
  inAssetBaseUnits: number;
  expectedUsdcOut: number;
  feeBaseUnits: number;
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
  feeBaseUnits: number;
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

export async function computeRebalancePlan(pos: Position, versionLegs: Array<{ mint: string; weightBps: number; slippageBps?: number }>, closeAll: boolean): Promise<RebalancePlan> {
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
    const token = (await repository.getToken(leg.mint));
    const decimals = token?.decimals ?? 6;
    const price = (await priceOf(leg.mint));
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
      feeBaseUnits: feeBase(usdcBase(round4(sellUsdc)), closeAll ? config.platformFeeBps : config.rebalanceFeeBps),
      priceUsd: price,
      currentWeightBps: Math.round(totalValueUsdc > 0 ? (legValue / totalValueUsdc) * 10_000 : 0),
      targetBps: closeAll ? 0 : targetBpsByMint.get(leg.mint) ?? 0,
    });
  }
  sells.sort((a, b) => b.expectedUsdcOut - a.expectedUsdcOut); // largest sell first

  const totalSellBase = sells.reduce((sum, s) => sum + usdcBase(s.expectedUsdcOut), 0);
  const sellFeeBase = sells.reduce((sum, s) => sum + s.feeBaseUnits, 0);
  const totalSellUsdc = totalSellBase / 1_000_000;
  const buyBudgetBase = totalSellBase - sellFeeBase;

  // ---- buys (sell-then-buy: funded solely by net sell proceeds) ----------
  const buys: PlannedBuy[] = [];
  if (!closeAll && buyBudgetBase >= usdcBase(DUST_THRESHOLD_USDC)) {
    const gaps = (await Promise.all(versionLegs.map(async (leg) => {
      const token = (await repository.getToken(leg.mint));
      const current = pos.legs.find((l) => l.mint === leg.mint);
      const currentWeightBps =
        totalValueUsdc > 0 && current ? (current.currentValueUsd / totalValueUsdc) * 10_000 : 0;
      return { leg, gapBps: Math.max(leg.weightBps - Math.round(currentWeightBps), 0) };
    })));
    const totalGapBps = gaps.reduce((sum, g) => sum + g.gapBps, 0);

    if (totalGapBps > 0) {
      const budgets = allocateBase(buyBudgetBase, gaps.map(g => g.gapBps));

      (await Promise.all(gaps.map(async (g, i) => {
        const feeBaseUnits = feeBase(budgets[i], config.rebalanceFeeBps);
        const inUsdcBaseUnits = budgets[i] - feeBaseUnits;
        const usdcIn = inUsdcBaseUnits / 1_000_000;
        if (usdcIn < DUST_THRESHOLD_USDC) return;
        const decimals = (await repository.getToken(g.leg.mint))?.decimals ?? 6;
        const price = (await priceOf(g.leg.mint));
        if (price <= 0) return;
        const expectedAssetOutUi = usdcIn / price;
        const expectedOutBaseUnits = Math.floor(expectedAssetOutUi * Math.pow(10, decimals));
        if (expectedOutBaseUnits < 1) return;
        buys.push({
          mint: g.leg.mint,
          symbol: (await repository.getToken(g.leg.mint))?.symbol ?? "UNKNOWN",
          assetDecimals: decimals,
          usdcIn,
          inUsdcBaseUnits,
          feeBaseUnits,
          expectedAssetOutUi,
          expectedOutBaseUnits,
          priceUsd: price,
          targetBps: g.leg.weightBps,
        });
      })));
    }
  }

  const totalFeeBase = sellFeeBase + buys.reduce((sum, b) => sum + b.feeBaseUnits, 0);
  return {
    sells,
    buys,
    totalSellUsdc,
    feeUsdc: totalFeeBase / 1_000_000,
    netUsdcToRedeploy: (totalSellBase - totalFeeBase) / 1_000_000,
    totalValueUsdc,
    driftBeforePct,
  };
}
