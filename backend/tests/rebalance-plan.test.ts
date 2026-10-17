process.env.KAIROS_DB_PATH = ":memory:";

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import type { Position } from "../src/db/schema";
import { feeBase, usdcBase } from "../src/services/fees";

const { repository } = await import("../src/db/repository");
const { computeRebalancePlan } = await import("../src/services/rebalance-plan");
const { config } = await import("../src/config");
const { assembleRebalanceExecution } = await import("../src/services/rebalance-build");
const { getConnection } = await import("../src/chain/connection");

async function fixture(): Promise<Position> {
  const id = randomUUID();
  const mints = [`${id}-a`, `${id}-b`];
  for (const mint of mints) await repository.saveToken({
    mint, symbol: mint.endsWith("a") ? "A" : "B", name: "Plan fixture", decimals: 6,
    type: "spl", tradingStatus: "active", denylisted: false, priceUsd: 1,
  });
  return {
    id, walletAddress: id, basketId: id, basketVersionId: id, entryUsdc: 40,
    currentValueUsd: 40, status: "ACTIVE", autoRebalance: false, driftPct: 0,
    rebalanceAvailable: true, updatedAt: new Date().toISOString(),
    legs: mints.map(mint => ({ mint, symbol: "TEST", targetBps: 5_000, currentAmount: 20, currentValueUsd: 20 })),
  };
}

test("rebalance plan applies separate side fees and conserves its complete buy debit", async () => {
  const pos = await fixture();
  const plan = await computeRebalancePlan(pos, [{ mint: pos.legs[1].mint, weightBps: 10_000 }], false);
  assert.equal(plan.sells.length, 1);
  assert.equal(plan.buys.length, 1);
  const sellFee = feeBase(20_000_000, config.rebalanceFeeBps);
  const budget = 20_000_000 - sellFee;
  const buyFee = feeBase(budget, config.rebalanceFeeBps);
  assert.equal(plan.sells[0].feeBaseUnits, sellFee);
  assert.equal(plan.buys[0].feeBaseUnits, buyFee);
  assert.equal(plan.buys[0].inUsdcBaseUnits + buyFee, budget);
  assert.equal(plan.buys[0].expectedOutBaseUnits, budget - buyFee);
  assert.equal(usdcBase(plan.feeUsdc), sellFee + buyFee);
  assert.equal(usdcBase(plan.netUsdcToRedeploy), budget - buyFee);
});

test("close plan charges only each sell fee at the close policy rate", async () => {
  const plan = await computeRebalancePlan(await fixture(), [], true);
  assert.equal(plan.buys.length, 0);
  assert.equal(plan.sells.length, 2);
  const perLegFee = feeBase(20_000_000, config.platformFeeBps);
  assert.ok(plan.sells.every(sell => sell.feeBaseUnits === perLegFee));
  assert.equal(usdcBase(plan.feeUsdc), 2 * perLegFee);
  assert.equal(usdcBase(plan.netUsdcToRedeploy), 40_000_000 - 2 * perLegFee);
});

test("program mode never silently falls back to treasury close or rebalance trades", async () => {
  const previous = config.swapBuilder;
  const user = Keypair.generate().publicKey;
  const plan = await computeRebalancePlan(await fixture(), [], true);
  config.swapBuilder = "program";
  try {
    for (const type of ["close", "rebalance"] as const) {
      await assert.rejects(assembleRebalanceExecution({
        conn: getConnection(), user, walletAddress: user.toBase58(), walletId: "test",
        idempotencyKey: "test", type, basketId: "test", basketVersionId: "test", fromVersionId: "test", plan,
      }), /on-chain fee policy/);
    }
  } finally {
    config.swapBuilder = previous;
  }
});
