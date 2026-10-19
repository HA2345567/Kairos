import type { Execution, ExecutionLeg } from "../db/schema";

type FundingDecision = { state: "ready" | "wait" } | { state: "failed"; error: string };
const failed = (error: string): FundingDecision => ({ state: "failed", error });
const units = (value: string | undefined): bigint => {
  if (value === undefined || !/^\d+$/.test(value)) throw new Error("REBALANCE_FUNDING_METADATA_MISSING");
  return BigInt(value);
};

/** Funding is net confirmed USDC across this retry chain, never a price quote. */
export async function rebalanceFunding(
  execution: Execution, leg: ExecutionLeg,
  load: (id: string) => Promise<Execution | undefined>
): Promise<FundingDecision> {
  if (execution.type !== "rebalance") return { state: "ready" };
  if (!execution.legs.every(item => item.side)) return failed("REBALANCE_DIRECTION_MISSING");
  if (leg.side === "sell") return { state: "ready" };
  const sells = execution.legs.filter(item => item.side === "sell");
  if (sells.some(item => item.status === "PENDING")) return { state: "wait" };
  if (sells.some(item => item.status === "FAILED")) return failed("REBALANCE_SELL_FAILED");

  let available = 0n;
  let hasFunding = false;
  const seen = new Set<string>();
  let current: Execution | undefined = execution;
  try {
    while (current) {
      if (seen.has(current.id) || seen.size >= 64 || current.type !== "rebalance" ||
          current.walletAddress !== execution.walletAddress || current.basketId !== execution.basketId) {
        return failed("REBALANCE_FUNDING_LINEAGE_INVALID");
      }
      seen.add(current.id);
      if (current.id !== execution.id && current.legs.some(item => item.status === "PENDING")) {
        return { state: "wait" };
      }
      for (const item of current.legs.filter(item => item.status === "CONFIRMED")) {
        if (item.side === "sell") {
          available += units(item.receipt?.actualOut ?? item.actualOut);
          hasFunding = true;
        } else if (item.side === "buy") {
          available -= units(item.receipt?.actualIn ?? item.inputBaseUnits);
        } else return failed("REBALANCE_DIRECTION_MISSING");
      }
      if (!current.baseExecutionId) break;
      current = await load(current.baseExecutionId);
      if (!current) return failed("REBALANCE_FUNDING_LINEAGE_INVALID");
    }
    // Include failed buys: one shortfall blocks the signed buy plan as a whole.
    const required = execution.legs.filter(item => item.side === "buy" && item.status !== "CONFIRMED")
      .reduce((sum, item) => sum + units(item.inputBaseUnits), 0n);
    if (!hasFunding || available < required) return failed("REBALANCE_PROCEEDS_INSUFFICIENT");
    return { state: "ready" };
  } catch (error) {
    // Database/provider errors must retry, not become failed transactions.
    if (error instanceof Error && error.message === "REBALANCE_FUNDING_METADATA_MISSING") {
      return failed(error.message);
    }
    throw error;
  }
}
