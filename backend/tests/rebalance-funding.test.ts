import { test } from "node:test";
import assert from "node:assert/strict";
import type { Execution, ExecutionLeg } from "../src/db/schema";
import { rebalanceFunding } from "../src/workers/rebalance-funding";

const sell = (status: ExecutionLeg["status"] = "CONFIRMED", amount = "10000000") => ({
  id: "sell", side: "sell", status, actualOut: amount,
} as ExecutionLeg);
const buy = (status: ExecutionLeg["status"] = "PENDING", amount = "9000000") => ({
  id: "buy", side: "buy", status, inputBaseUnits: amount,
} as ExecutionLeg);
const execution = (legs: ExecutionLeg[], baseExecutionId?: string) => ({
  id: "current", type: "rebalance", walletAddress: "wallet", basketId: "basket", legs, baseExecutionId,
} as Execution);
const missing = async () => undefined;

test("buys wait for all sells and failed sells block the buy plan", async () => {
  const leg = buy();
  assert.deepEqual(await rebalanceFunding(execution([sell("PENDING"), leg]), leg, missing), { state: "wait" });
  assert.deepEqual(await rebalanceFunding(execution([sell("FAILED"), leg]), leg, missing), {
    state: "failed", error: "REBALANCE_SELL_FAILED",
  });
  assert.deepEqual(await rebalanceFunding(execution([sell(), leg]), leg, missing), { state: "ready" });
});

test("actual net proceeds must cover the entire buy plan using exact integers", async () => {
  const leg = buy("PENDING", "9007199254740993");
  assert.deepEqual(await rebalanceFunding(execution([sell("CONFIRMED", "9007199254740992"), leg]), leg, missing), {
    state: "failed", error: "REBALANCE_PROCEEDS_INSUFFICIENT",
  });
  const twoBuys = execution([sell(), buy(), { ...buy("FAILED", "2000000"), id: "second" }]);
  assert.equal((await rebalanceFunding(twoBuys, twoBuys.legs[1], missing)).state, "failed");
});

test("buy-only retries reuse confirmed ancestor proceeds after subtracting prior buys", async () => {
  const leg = buy("PENDING", "4000000");
  const parent = { ...execution([sell(), buy("CONFIRMED", "6000000")]), id: "parent" };
  const current = execution([leg], parent.id);
  assert.deepEqual(await rebalanceFunding(current, leg, async () => parent), { state: "ready" });
  parent.legs[1].inputBaseUnits = "6000001";
  assert.equal((await rebalanceFunding(current, leg, async () => parent)).state, "failed");
});

test("missing, cyclic, cross-wallet and ambiguous funding metadata fail closed", async () => {
  const leg = buy();
  const current = execution([leg], "parent");
  assert.equal((await rebalanceFunding(current, leg, missing)).state, "failed");
  assert.equal((await rebalanceFunding(current, leg, async () => current)).state, "failed");
  const parent = { ...execution([sell()]), id: "parent", walletAddress: "other" };
  assert.equal((await rebalanceFunding(current, leg, async () => parent)).state, "failed");
  assert.equal((await rebalanceFunding(execution([{ ...sell(), side: undefined }, leg]), leg, missing)).state, "failed");
  assert.equal((await rebalanceFunding(execution([sell(), { ...leg, inputBaseUnits: undefined }]), leg, missing)).state, "failed");
});

test("transient lineage database failures propagate for job retry", async () => {
  const leg = buy();
  await assert.rejects(rebalanceFunding(execution([leg], "parent"), leg, async () => {
    throw new Error("DATABASE_UNAVAILABLE");
  }), /DATABASE_UNAVAILABLE/);
});
