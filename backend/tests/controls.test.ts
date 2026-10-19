/**
 * Trading controls regression suite (PRD FR-17, X11, NFR-05).
 *
 * Covers the two Must-level gate gaps:
 *  - the kill switch must block NEW buys (opens, buy-side rebalances, retrying
 *    buys, auto-rebalance runs) and must never block close/unwind/withdraw;
 *  - a buy-side prepare must degrade closed (503) when relayer or RPC health is
 *    unknown, while sell-only work stays available.
 *
 * Deterministic and chain-free: the health gate takes injectable overrides so
 * the decision is tested without a validator.
 */
process.env.KAIROS_DB_PATH = ":memory:";

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";

const { assertPrepareHealth, tradingPauseError } = await import("../src/services/controls");
const { executionService } = await import("../src/services/execution.service");
const { adminService } = await import("../src/services/admin.service");
const { buildApp } = await import("../src/index");
const { AppError } = await import("../src/errors");

async function expectAppError(fn: () => Promise<unknown>): Promise<InstanceType<typeof AppError>> {
  try {
    await fn();
  } catch (err) {
    assert.ok(err instanceof AppError, `expected AppError, received ${String(err)}`);
    return err;
  }
  throw new Error("expected the operation to be refused, but it resolved");
}

describe("kill switch: blocks new buys, never blocks exits (FR-17 / X11)", () => {
  test("a paused system refuses buy-side work with a typed 503", () => {
    const error = tradingPauseError(true, true, "Open preparation");
    assert.ok(error);
    assert.equal(error.code, "KILL_SWITCH_ACTIVE");
    assert.equal(error.status, 503);
  });

  test("sell-only work is exempt while paused", () => {
    assert.equal(tradingPauseError(true, false, "Close preparation"), null);
    assert.equal(tradingPauseError(true, false, "Unwind"), null);
    assert.equal(tradingPauseError(true, false, "Sell-only rebalance"), null);
  });

  test("an unpaused system allows buys", () => {
    assert.equal(tradingPauseError(false, true, "Open preparation"), null);
    assert.equal(tradingPauseError(false, false, "Close preparation"), null);
  });

  test("open prepare is refused while the switch is engaged", async () => {
    (await adminService.setGlobalKillSwitch(true, "controls test"));
    try {
      const error = await expectAppError(() =>
        executionService.prepare({
          basketSlug: "any-basket",
          usdcAmount: 50,
          walletAddress: Keypair.generate().publicKey.toBase58(),
          idempotencyKey: `paused-${Date.now()}`,
        })
      );
      assert.equal(error.code, "KILL_SWITCH_ACTIVE");
      assert.equal(error.status, 503);
    } finally {
      (await adminService.setGlobalKillSwitch(false, "controls test"));
    }
  });

  test("after the switch is released, the pause is no longer the refusal reason", async () => {
    (await adminService.setGlobalKillSwitch(false, "controls test"));
    const error = await expectAppError(() =>
      executionService.prepare({
        basketSlug: "missing-basket-after-unpause",
        usdcAmount: 50,
        walletAddress: Keypair.generate().publicKey.toBase58(),
        idempotencyKey: `unpaused-${Date.now()}`,
      })
    );
    assert.equal(error.code, "BASKET_NOT_FOUND");
    assert.equal(error.status, 404);
  });
});

describe("prepare health gate (NFR-05 degrade closed)", () => {
  test("sell-only work is never gated, even when health is unknown", async () => {
    await assertPrepareHealth(false, { simulate: false, solBalance: -1 });
  });

  test("unknown relayer/RPC health refuses buys with ALL_AGGREGATORS_DOWN", async () => {
    const error = await expectAppError(() =>
      assertPrepareHealth(true, { simulate: false, solBalance: -1 })
    );
    assert.equal(error.code, "ALL_AGGREGATORS_DOWN");
    assert.equal(error.status, 503);
  });

  test("a relayer below the operating floor refuses buys with RELAYER_LOW", async () => {
    const error = await expectAppError(() =>
      assertPrepareHealth(true, { simulate: false, solBalance: 0 })
    );
    assert.equal(error.code, "RELAYER_LOW");
    assert.equal(error.status, 503);
  });

  test("a funded relayer with reachable RPC allows buys", async () => {
    await assertPrepareHealth(true, { simulate: false, solBalance: 5 });
  });

  test("the offline control plane is not a live health claim", async () => {
    await assertPrepareHealth(true, { simulate: true, solBalance: -1 });
  });
});

describe("region gate covers every money path (FR-04)", () => {
  test("restricted region is refused before prepare validation", async () => {
    const response = await buildApp().inject({
      method: "POST",
      url: "/v1/positions/prepare",
      headers: { "x-region": "KP", "Idempotency-Key": "region-gate-prepare" },
      payload: {
        basket: "test-basket",
        usdc: 50,
        walletAddress: Keypair.generate().publicKey.toBase58(),
      },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "REGION_BLOCKED");
  });

  test("restricted region is refused on submit", async () => {
    const response = await buildApp().inject({
      method: "POST",
      url: "/v1/positions/submit",
      headers: { "x-region": "IR", "Idempotency-Key": "region-gate-submit" },
      payload: { executionId: "exec-region", signedTxs: [] },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "REGION_BLOCKED");
  });
});
