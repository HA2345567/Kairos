import type { Execution, ExecutionLeg } from "../db/schema";
import type { PrepareLegInput } from "./execution.service";
import { AppError } from "../errors";
import { feeBase, usdcBase } from "./fees";

export function legSide(execution: Execution, leg: ExecutionLeg): "buy" | "sell" {
  const side = leg.receipt?.side ?? leg.side;
  if (side) return side;
  if (execution.type === "open") return "buy";
  if (execution.type === "close") return "sell";
  throw new AppError("RECOVERY_METADATA_MISSING", "This legacy rebalance needs a fresh position review", 409);
}

export function assertSettled(execution: Execution): void {
  if (!["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "EXPIRED"].includes(execution.status)) {
    throw new AppError("EXECUTION_STILL_PENDING", "Wait for every submitted leg to settle before recovery", 409);
  }
}

function safeAmount(raw: string | undefined): number {
  const amount = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new AppError("RECOVERY_METADATA_MISSING", "Exact asset input is unavailable; review the current position", 409);
  }
  return amount;
}

/** Sell quotes are gross proceeds. The transaction deducts its fee once. */
export function recoverySell(
  leg: ExecutionLeg, rawAmount: string | undefined,
  token: { decimals: number; priceUsd: number } | null | undefined, feeBps: number
): PrepareLegInput {
  if (!token || token.priceUsd <= 0) throw new AppError("QUOTE_STALE", "A current asset price is required", 409);
  const inAssetBaseUnits = safeAmount(rawAmount);
  const grossBase = Math.floor(inAssetBaseUnits / 10 ** token.decimals * token.priceUsd * 1_000_000);
  if (!Number.isSafeInteger(grossBase) || grossBase <= 0) {
    throw new AppError("DUST_LEG_FORBIDDEN", "Sell proceeds are below one USDC base unit", 422);
  }
  return {
    mint: leg.mint, symbol: leg.symbol, side: "sell", inAssetBaseUnits,
    inUsdcAmount: grossBase / 1_000_000, expectedOutBaseUnits: grossBase,
    feeUsdc: feeBase(grossBase, feeBps) / 1_000_000,
  };
}

export function retryBuy(leg: ExecutionLeg, type: Execution["type"], feeBps: number): PrepareLegInput {
  if (type === "rebalance" && leg.feeUsdc === undefined) {
    throw new AppError("RECOVERY_METADATA_MISSING", "Rebalance buy fee is unavailable; review the current position", 409);
  }
  return {
    mint: leg.mint, symbol: leg.symbol, side: "buy", inUsdcAmount: leg.inAmountUsdc,
    // A failed leg paid no fee. Preserve the signed quote's fee on retry.
    feeUsdc: leg.feeUsdc ?? feeBase(usdcBase(leg.inAmountUsdc), feeBps) / 1_000_000,
  };
}
