/**
 * Kairos backend core test suite (node:test + tsx).
 * Run: npm test   (uses an in-memory DB, isolated from the running server)
 *
 * Devnet-dependent flows (prepare→submit→land) auto-skip when the devnet
 * environment is not provisioned (faucet SOL pending); everything else runs.
 */
process.env.KAIROS_DB_PATH = ":memory:";

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

const { repository } = await import("../src/db/repository");
const { quoteService } = await import("../src/services/quote.service");
const { authService } = await import("../src/services/auth.service");
const { adminService } = await import("../src/services/admin.service");
const { executionService } = await import("../src/services/execution.service");
const { AppError } = await import("../src/errors");
const { config } = await import("../src/config");
const { buildApp } = await import("../src/index");
const { backtestService } = await import("../src/services/backtest.service");

// ---------- fixtures ----------
const payer = Keypair.generate();
const payerAddress = payer.publicKey.toBase58();
const USDC_MINT = "USDC111111111111111111111111111111111111111";

function seedRegistry() {
  repository.saveToken({
    mint: USDC_MINT,
    symbol: "USDC",
    name: "Test USDC",
    decimals: 6,
    type: "stablecoin",
    tradingStatus: "active",
    denylisted: false,
    priceUsd: 1,
  });
  repository.saveToken({
    mint: "GOLD111111111111111111111111111111111111111",
    symbol: "tGOLD",
    name: "Test Gold",
    decimals: 6,
    type: "xstock",
    tradingStatus: "active",
    denylisted: false,
    priceUsd: 2400,
  });
  repository.saveToken({
    mint: "JUP1111111111111111111111111111111111111111",
    symbol: "tJUP",
    name: "Test Jupiter",
    decimals: 6,
    type: "spl",
    tradingStatus: "active",
    denylisted: false,
    priceUsd: 0.85,
  });
  repository.saveBasketVersion({
    id: "bv-test-1",
    basketId: "bkt-test",
    version: 1,
    changelog: "test",
    publishedBy: "tests",
    publishedAt: new Date().toISOString(),
    legs: [
      { id: "l1", versionId: "bv-test-1", mint: "JUP1111111111111111111111111111111111111111", weightBps: 5000, legType: "spl" },
      { id: "l2", versionId: "bv-test-1", mint: "GOLD111111111111111111111111111111111111111", weightBps: 5000, legType: "xstock" },
    ],
  });
  repository.saveBasket({
    id: "bkt-test",
    slug: "test-basket",
    name: "Test Basket",
    thesis: "test",
    category: "test",
    status: "active",
    activeVersionId: "bv-test-1",
    minUsdc: 25,
    performance: { "1W": 0, "1M": 0, "6M": 0, "1Y": 0 } as never,
    protocols: [],
  });
}

describe("quote engine (PRD §4.3)", () => {
  before(() => seedRegistry());

  test("fee is platform bps on input; legs sum to net", () => {
    const q = quoteService.getQuote("test-basket", 50);
    assert.equal(q.platformFeeUsdc, 0.1); // 20 bps of 50
    const legSum = q.legs.reduce((s, l) => s + l.inUsdcAmount, 0);
    assert.equal(Number(legSum.toFixed(4)), 49.9);
    // per-leg expected out math: 24.95 / 0.85 = 29.352941...
    const jup = q.legs.find((l) => l.symbol === "tJUP")!;
    assert.equal(Number(jup.expectedOutTokens), Number((24.95 / 0.85).toFixed(6)));
  });

  test("rounding remainder lands on the largest leg (integer cents conserved)", () => {
    // Mirror the service's rounding: fee rounded to 4 dp, then integer cents.
    const usdc = 25.01;
    const fee = Number(((usdc * config.platformFeeBps) / 10000).toFixed(4));
    const netCents = Math.floor((usdc - fee) * 100);
    const q = quoteService.getQuote("test-basket", usdc);
    const cents = q.legs.map((l) => Math.round(l.inUsdcAmount * 100));
    assert.equal(cents.reduce((s, c) => s + c, 0), netCents);
  });

  test("min investment enforced", () => {
    assert.throws(() => quoteService.getQuote("test-basket", 5), (e: InstanceType<typeof AppError>) => e.code === "MIN_INVESTMENT");
  });

  test("market-closed tokenized equity rejects with MARKET_CLOSED", () => {
    const gold = repository.getToken("GOLD111111111111111111111111111111111111111")!;
    gold.isMarketHoursRestricted = true;
    gold.tradingStatus = "market_closed";
    repository.saveToken(gold);
    assert.throws(() => quoteService.getQuote("test-basket", 50), (e: InstanceType<typeof AppError>) => e.code === "MARKET_CLOSED");
    gold.tradingStatus = "active";
    repository.saveToken(gold);
    assert.doesNotThrow(() => quoteService.getQuote("test-basket", 50));
  });
});

describe("auth (PRD §4.1)", () => {
  test("nonce → sign → verify → refresh rotation → replay rejected", async () => {
    const wallet = Keypair.generate().publicKey.toBase58();
    const nonce = await authService.generateNonce(wallet);
    assert.match(nonce, /^kairos-auth-[0-9a-f]{32}$/);
    const message = `kairos-devnet-login:${nonce}`;
    const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), Keypair.generate().secretKey));
    assert.equal(await authService.verify(wallet, sig, message), null); // wrong key

    const kp = Keypair.generate();
    const addr = kp.publicKey.toBase58();
    const n3 = await authService.generateNonce(addr);
    const sig3 = bs58.encode(nacl.sign.detached(new TextEncoder().encode(`kairos-devnet-login:${n3}`), kp.secretKey));
    const res = await authService.verify(addr, sig3, `kairos-devnet-login:${n3}`);
    assert.ok(res?.token && res.refreshToken);
    const payload = authService.verifyJwt(res.token) as { sub: string; exp: number };
    assert.ok(payload.sub);
    assert.equal(await authService.verify(addr, sig3, `kairos-devnet-login:${n3}`), null); // nonce single-use

    const rotated = await authService.refresh(res.refreshToken);
    assert.ok(rotated?.refreshToken && rotated.refreshToken !== res.refreshToken);
    assert.equal(await authService.refresh(res.refreshToken), null); // replay rejected
  });
});

describe("execution submit security controls (PRD §4.4)", () => {
  test("tampered message bytes are rejected (byte verification)", async () => {
    seedRegistry();
    const payerKp = Keypair.generate(); // we hold this one so tx.sign succeeds
    const msg = new TransactionMessage({
      payerKey: payerKp.publicKey,
      recentBlockhash: "GttV6m88mQW2x9qK7Y7z8G3L4q8L9M2K3N5P6Q7R8S9T",
      instructions: [SystemProgram.transfer({ fromPubkey: payerKp.publicKey, toPubkey: payerKp.publicKey, lamports: 1 })],
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([payerKp]);

    // Byte verification fires before signature checks, so any wallet works here.
    const wallet = Keypair.generate().publicKey.toBase58();
    const execution = {
      id: "exec-tamper1",
      walletId: "wal-test",
      walletAddress: wallet,
      basketId: "bkt-test",
      basketVersionId: "bv-test-1",
      type: "open" as const,
      status: "PREPARED" as const,
      idempotencyKey: "tamper-key-1",
      totalUsdc: 50,
      feeUsdc: 0.1,
      preparedTxs: [Buffer.from(tx.serialize()).toString("base64")],
      messageHashes: ["deadbeef".repeat(8)], // stored hash ≠ actual message
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      legs: [{
        id: "leg-1", executionId: "exec-tamper1", mint: "JUP1111111111111111111111111111111111111111",
        symbol: "tJUP", inAmountUsdc: 49.9, expectedOut: "29352941", messageHash: "deadbeef".repeat(8), status: "PENDING" as const,
      }],
    };
    repository.saveExecution(execution);

    await assert.rejects(
      () => executionService.submit({ executionId: "exec-tamper1", signedTxs: [Buffer.from(tx.serialize()).toString("base64")] }),
      (e: InstanceType<typeof AppError>) => e.code === "TAMPERED_TRANSACTION"
    );
    assert.equal(repository.getExecution("exec-tamper1")!.status, "FAILED");
  });

  test("expired executions are rejected as EXECUTION_EXPIRED", async () => {
    seedRegistry();
    const wallet = Keypair.generate().publicKey.toBase58();
    const execution = {
      id: "exec-expired1",
      walletId: "wal-test",
      walletAddress: wallet,
      basketId: "bkt-test",
      basketVersionId: "bv-test-1",
      type: "open" as const,
      status: "PREPARED" as const,
      idempotencyKey: "expired-key-1",
      totalUsdc: 50,
      feeUsdc: 0.1,
      preparedTxs: [],
      messageHashes: [],
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      legs: [],
    };
    repository.saveExecution(execution);
    await assert.rejects(
      () => executionService.submit({ executionId: "exec-expired1", signedTxs: [] }),
      (e: InstanceType<typeof AppError>) => e.code === "EXECUTION_EXPIRED"
    );
    assert.equal(repository.getExecution("exec-expired1")!.status, "EXPIRED");
  });

  test("idempotency: unique (wallet, key); duplicate save conflicts; lookup returns original", () => {
    seedRegistry();
    const wallet = Keypair.generate().publicKey.toBase58();
    const base = {
      walletId: "wal-test",
      walletAddress: wallet,
      basketId: "bkt-test",
      basketVersionId: "bv-test-1",
      type: "open" as const,
      status: "PREPARED" as const,
      totalUsdc: 50,
      feeUsdc: 0.1,
      preparedTxs: [],
      messageHashes: [],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      legs: [],
    };
    repository.saveExecution({ ...base, id: "exec-idem-a", idempotencyKey: "key-once" });
    assert.throws(() => repository.saveExecution({ ...base, id: "exec-idem-b", idempotencyKey: "key-once" }));
    assert.equal(repository.getExecutionByIdempotency("key-once")!.id, "exec-idem-a");
  });
});

describe("catalog & admin", () => {
  test("publishing a version with wrong weights throws", () => {
    seedRegistry();
    assert.throws(
      () =>
        adminService.publishBasketVersion("test-basket", {
          version: 2,
          changelog: "bad weights",
          publishedBy: "tests",
          legs: [{ id: "x", versionId: "", mint: "JUP1111111111111111111111111111111111111111", weightBps: 9999, legType: "spl" }],
        } as never),
      /10,000 basis points/
    );
  });

  test("kill switch round-trips through settings", () => {
    adminService.setGlobalKillSwitch(true, "test");
    assert.equal(repository.getSetting("global_kill_switch"), "true");
    adminService.setGlobalKillSwitch(false, "test");
    assert.equal(repository.getSetting("global_kill_switch"), "false");
  });
});

describe("backtest (PRD §4.7)", () => {
  test("computes weighted index over earliest-common window with hypothetical flag", () => {
    // Synthetic 48h ramp: tJUP +10%, tGOLD +10%, equal weights → expect ~+10%.
    const start = Date.now() - 48 * 3600 * 1000;
    for (let h = 0; h <= 48; h++) {
      const ts = new Date(start + h * 3600 * 1000).toISOString();
      repository.addSnapshot("JUP1111111111111111111111111111111111111111", ts, 0.85 * (1 + (h / 48) * 0.1), "test");
      repository.addSnapshot("GOLD111111111111111111111111111111111111111", ts, 2400 * (1 + (h / 48) * 0.1), "test");
    }
    const r = backtestService.backtest("test-basket", "1W");
    assert.equal(r.isHypothetical, true);
    assert.ok(r.series.length >= 10);
    assert.ok(Math.abs(r.returnPct - 10) < 1.5, `returnPct ${r.returnPct} ≈ 10`);
    assert.deepEqual(r.excludedLegs, []);
  });
});

describe("HTTP surface (inject)", () => {
  test("health + baskets + typed errors over the wire", async () => {
    const app = buildApp();
    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().status, "ok");

    const baskets = await app.inject({ method: "GET", url: "/v1/baskets" });
    assert.equal(baskets.statusCode, 200);
    assert.ok(baskets.json().baskets.length >= 1);

    const missing = await app.inject({ method: "GET", url: "/v1/baskets/does-not-exist" });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error, "BASKET_NOT_FOUND");

    const badQuote = await app.inject({
      method: "POST",
      url: "/v1/quotes",
      payload: { basket: "test-basket", usdcAmount: 5 },
    });
    assert.equal(badQuote.statusCode, 422);
    assert.equal(badQuote.json().error, "MIN_INVESTMENT");
  });
});

describe("devnet E2E (auto-skips until faucet SOL arrives)", () => {
  test("prepare → sign → submit → poll COMPLETED", { skip: process.env.KAIROS_E2E !== "1" }, async () => {
    const wallet = Keypair.generate(); // must be faucet-funded: KAIROS_E2E=1 with funded wallet
    const idem = "e2e-" + Date.now();
    const prepared = await executionService.prepare({
      basketSlug: "digital-gold",
      usdcAmount: 50,
      walletAddress: wallet.publicKey.toBase58(),
      idempotencyKey: idem,
    });
    assert.equal(prepared.status, "PREPARED");
    const signed = prepared.preparedTxs.map((b64) => {
      const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
      tx.sign([wallet]);
      return Buffer.from(tx.serialize()).toString("base64");
    });
    await executionService.submit({ executionId: prepared.id, signedTxs: signed });
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const exec = repository.getExecution(prepared.id)!;
      if (["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(exec.status)) {
        assert.equal(exec.status, "COMPLETED");
        return;
      }
    }
    assert.fail("execution did not settle in 120 s");
  });
});
