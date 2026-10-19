import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateBase, feeBase, usdcBase } from "../src/services/fees";

test("fees floor each leg independently with exact integer multiplication", () => {
  assert.equal(feeBase(999, 10), 0);
  assert.equal(feeBase(1_999, 10), 1);
  assert.equal(feeBase(Number.MAX_SAFE_INTEGER, 75), Number(BigInt(Number.MAX_SAFE_INTEGER) * 75n / 10_000n));
  for (const amount of [-1, 1.5, NaN, Infinity]) assert.throws(() => feeBase(amount, 10));
  assert.throws(() => feeBase(10, 0.5));
  assert.throws(() => usdcBase(-1));
});

test("rebalance funds both side fees without spending more than sell proceeds", () => {
  const grossSell = [usdcBase(10.123456), usdcBase(7.654321)];
  const sellFees = grossSell.map(amount => feeBase(amount, 10));
  const netSell = grossSell.reduce((a, b) => a + b, 0) - sellFees.reduce((a, b) => a + b, 0);
  const budgets = allocateBase(netSell, [1, 3, 7]);
  const buyFees = budgets.map(amount => feeBase(amount, 10));
  const netBuy = budgets.map((amount, i) => amount - buyFees[i]);
  assert.equal(budgets.reduce((a, b) => a + b, 0), netSell);
  assert.equal(netBuy.reduce((a, b) => a + b, 0) + buyFees.reduce((a, b) => a + b, 0), netSell);
  assert.ok(sellFees.every(fee => fee > 0));
  assert.ok(buyFees.every(fee => fee > 0));
  assert.deepEqual(allocateBase(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(allocateBase(10, [0, 0]), [0, 0]);
  assert.throws(() => allocateBase(10, [-1, 2]));
});
