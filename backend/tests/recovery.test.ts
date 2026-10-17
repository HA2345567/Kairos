import { test } from "node:test";
import assert from "node:assert/strict";
import type { Execution, ExecutionLeg } from "../src/db/schema";
import { assertSettled, legSide, recoverySell, retryBuy } from "../src/services/execution-recovery";

const leg: ExecutionLeg = {
  id: "sell", executionId: "exec", mint: "asset", symbol: "ASSET", inAmountUsdc: 10,
  expectedOut: "10000000", messageHash: "hash", status: "FAILED", feeUsdc: 0.1,
};
const execution = (type: Execution["type"], status: Execution["status"] = "FAILED") => ({ type, status } as Execution);

test("recovery preserves sell direction and rejects ambiguous legacy rebalances", () => {
  assert.equal(legSide(execution("close"), leg), "sell");
  assert.equal(legSide(execution("rebalance"), { ...leg, side: "sell" }), "sell");
  assert.equal(legSide(execution("open"), leg), "buy");
  assert.throws(() => legSide(execution("rebalance"), leg), /legacy rebalance/);
});

test("sell recovery uses exact asset input and gross proceeds before one fee", () => {
  const plan = recoverySell(leg, "2400000", { decimals: 6, priceUsd: 5 }, 100);
  assert.equal(plan.inAssetBaseUnits, 2_400_000);
  assert.equal(plan.expectedOutBaseUnits, 12_000_000);
  assert.equal(plan.feeUsdc, 0.12);
  assert.equal(plan.expectedOutBaseUnits! - plan.feeUsdc! * 1_000_000, 11_880_000);
  assert.equal(plan.side, "sell");
  for (const amount of [undefined, "0", "1.5", "9007199254740993"]) {
    assert.throws(() => recoverySell(leg, amount, { decimals: 6, priceUsd: 5 }, 100));
  }
  assert.throws(() => recoverySell(leg, "1", undefined, 100), /price/);
});

test("recovery waits for settlement and preserves the failed buy's original fee", () => {
  for (const status of ["PREPARED", "SUBMITTED", "LANDING"] as const) {
    assert.throws(() => assertSettled(execution("open", status)), /settle/);
  }
  assert.doesNotThrow(() => assertSettled(execution("open", "PARTIALLY_COMPLETED")));
  assert.equal(retryBuy(leg, "rebalance", 10).feeUsdc, 0.1);
  assert.equal(retryBuy({ ...leg, feeUsdc: 0 }, "rebalance", 10).feeUsdc, 0);
  assert.throws(() => retryBuy({ ...leg, feeUsdc: undefined }, "rebalance", 10), /fee is unavailable/);
  assert.equal(retryBuy(leg, "open", 100).feeUsdc, 0.1);
});
