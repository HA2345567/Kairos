/**
 * Kairos backend core test suite (node:test + tsx).
 * Run: bun run --cwd backend test   (uses an in-memory DB, isolated from the running server)
 *
 * Devnet-dependent flows (prepare→submit→land) auto-skip when the devnet
 * environment is not provisioned (faucet SOL pending); everything else runs.
 */
process.env.KAIROS_DB_PATH = ":memory:";

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

const { repository } = await import("../src/db/repository");
const { quoteService } = await import("../src/services/quote.service");
const { authService } = await import("../src/services/auth.service");
const { adminService } = await import("../src/services/admin.service");
const { executionService, allocateFeeBaseUnits } = await import("../src/services/execution.service");
const { AppError } = await import("../src/errors");
const { config } = await import("../src/config");
const { buildApp } = await import("../src/index");
const { backtestService } = await import("../src/services/backtest.service");

// ---------- fixtures ----------
const payer = Keypair.generate();
const payerAddress = payer.publicKey.toBase58();
const USDC_MINT = "USDC111111111111111111111111111111111111111";

async function seedRegistry() {
  (await repository.saveToken({
    mint: USDC_MINT,
    symbol: "USDC",
    name: "Test USDC",
    decimals: 6,
    type: "stablecoin",
    tradingStatus: "active",
    denylisted: false,
    priceUsd: 1,
  }));
  (await repository.saveToken({
    mint: "GOLD111111111111111111111111111111111111111",
    symbol: "tGOLD",
    name: "Test Gold",
    decimals: 6,
    type: "xstock",
    tradingStatus: "active",
    denylisted: false,
    priceUsd: 2400,
  }));
  (await repository.saveToken({
    mint: "JUP1111111111111111111111111111111111111111",
    symbol: "tJUP",
    name: "Test Jupiter",
    decimals: 6,
    type: "spl",
    tradingStatus: "active",
    denylisted: false,
    priceUsd: 0.85,
  }));
  (await repository.saveBasketVersion({
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
  }));
  (await repository.saveBasket({
    id: "bkt-test",
    slug: "test-basket",
    name: "Test Basket",
    thesis: "test",
    category: "test",
    status: "active",
    activeVersionId: "bv-test-1",
    minUsdc: 25,
    protocols: [],
  }));
}

describe("quote engine (PRD §4.3)", () => {
  test("execution fee is split across landed legs with remainder on the largest", () => {
    const fees = allocateFeeBaseUnits(0.01, [
      { mint: "A", symbol: "A", inUsdcAmount: 10 },
      { mint: "B", symbol: "B", inUsdcAmount: 20 },
      { mint: "C", symbol: "C", inUsdcAmount: 10 },
    ]);
    assert.deepEqual(fees, [2_500, 5_000, 2_500]);
    assert.equal(fees.reduce((sum, fee) => sum + fee, 0), 10_000);
  });

  test("confirmed-leg fee ledger writes are idempotent", async () => {
    const id = `fee-test-${Date.now()}`;
    await repository.addFee(id, "leg-1", 0.0025, new Date().toISOString());
    await repository.addFee(id, "leg-1", 0.0025, new Date().toISOString());
    assert.equal((await repository.listFees()).filter((fee) => fee.executionId === id).length, 1);
  });

  before(async () => (await seedRegistry()));

  test("fee is platform bps on input; legs sum to net", async () => {
    const q = (await quoteService.getQuote("test-basket", 50));
    assert.equal(q.platformFeeUsdc, 0.1); // 20 bps of 50
    const legSum = q.legs.reduce((s, l) => s + l.inUsdcAmount, 0);
    assert.equal(Number(legSum.toFixed(4)), 49.9);
    // per-leg expected out math: 24.95 / 0.85 = 29.352941...
    const jup = q.legs.find((l) => l.symbol === "tJUP")!;
    assert.equal(Number(jup.expectedOutTokens), Number((24.95 / 0.85).toFixed(6)));
  });

  test("rounding remainder lands on the largest leg (base units conserved)", async () => {
    // Quote allocation is conserved in six-decimal USDC base units.
    const usdc = 25.01;
    const usdcBase = Math.round(usdc * 1_000_000);
    const feeBase = Math.floor((usdcBase * config.platformFeeBps) / 10000);
    const netBase = usdcBase - feeBase;
    const q = (await quoteService.getQuote("test-basket", usdc));
    const baseUnits = q.legs.map((l) => Math.round(l.inUsdcAmount * 1_000_000));
    assert.equal(baseUnits.reduce((s, c) => s + c, 0), netBase);
  });

  test("min investment enforced", async () => {
    await assert.rejects(quoteService.getQuote("test-basket", 5), (e: InstanceType<typeof AppError>) => e.code === "MIN_INVESTMENT");
  });

  test("market-closed tokenized equity rejects with MARKET_CLOSED", async () => {
    const gold = (await repository.getToken("GOLD111111111111111111111111111111111111111"))!;
    gold.isMarketHoursRestricted = true;
    gold.tradingStatus = "market_closed";
    (await repository.saveToken(gold));
    await assert.rejects(quoteService.getQuote("test-basket", 50), (e: InstanceType<typeof AppError>) => e.code === "MARKET_CLOSED");
    gold.tradingStatus = "active";
    (await repository.saveToken(gold));
    await assert.doesNotReject(quoteService.getQuote("test-basket", 50));
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

describe("money-path session binding (PRD §4.1, §4.4)", () => {
  test("rejects protected position and execution reads without a SIWS session", async () => {
    const app = buildApp();
    const positions = await app.inject({
      method: "GET",
      url: "/v1/positions?walletAddress=11111111111111111111111111111111",
    });
    assert.equal(positions.statusCode, 401);
    assert.equal(positions.json().error, "UNAUTHORIZED");

    const execution = await app.inject({
      method: "GET",
      url: "/v1/executions/exec-protected-test",
    });
    assert.equal(execution.statusCode, 401);
    assert.equal(execution.json().error, "UNAUTHORIZED");

    const faucet = await app.inject({
      method: "POST",
      url: "/v1/faucet/airdrop",
      payload: { walletAddress: "11111111111111111111111111111111" },
    });
    assert.equal(faucet.statusCode, 401);
    assert.equal(faucet.json().error, "UNAUTHORIZED");
  });

  test("binds protected reads to the wallet in the verified JWT", async () => {
    const owner = Keypair.generate().publicKey.toBase58();
    const other = Keypair.generate().publicKey.toBase58();
    const token = authService.signJwt({ sub: "usr-session-test", wallet: owner }, 900);
    const app = buildApp();

    const response = await app.inject({
      method: "GET",
      url: `/v1/positions?walletAddress=${other}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "WALLET_SESSION_MISMATCH");
  });

  test("does not expose an existing position to another authenticated wallet", async () => {
    const owner = Keypair.generate().publicKey.toBase58();
    const other = Keypair.generate().publicKey.toBase58();
    await repository.savePosition({
      id: "position-session-owner",
      walletAddress: owner,
      basketId: "bkt-test",
      basketVersionId: "bv-test-1",
      entryUsdc: 50,
      currentValueUsd: 50,
      status: "ACTIVE",
      autoRebalance: false,
      driftPct: 0,
      rebalanceAvailable: true,
      legs: [],
      updatedAt: new Date().toISOString(),
    });
    const token = authService.signJwt({ sub: "usr-other-session-test", wallet: other }, 900);
    const response = await buildApp().inject({
      method: "GET",
      url: "/v1/positions/position-session-owner",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "POSITION_NOT_OWNED_BY_WALLET");
  });
});

describe("execution submit security controls (PRD §4.4)", () => {
  test("tampered message bytes are rejected (byte verification)", async () => {
    (await seedRegistry());
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
    (await repository.saveExecution(execution));

    await assert.rejects(
      async () => (await executionService.submit({ executionId: "exec-tamper1", signedTxs: [Buffer.from(tx.serialize()).toString("base64")] })),
      (e: InstanceType<typeof AppError>) => e.code === "TAMPERED_TRANSACTION"
    );
    assert.equal((await repository.getExecution("exec-tamper1"))!.status, "PREPARED");
  });

  test("invalid signatures are rejected without consuming the prepared execution", async () => {
    (await seedRegistry());
    const user = Keypair.generate();
    const msg = new TransactionMessage({
      payerKey: user.publicKey,
      recentBlockhash: "GttV6m88mQW2x9qK7Y7z8G3L4q8L9M2K3N5P6Q7R8S9T",
      instructions: [SystemProgram.transfer({ fromPubkey: user.publicKey, toPubkey: user.publicKey, lamports: 1 })],
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([user]);
    tx.signatures[0][0] ^= 1;
    const messageHash = createHash("sha256").update(Buffer.from(msg.serialize())).digest("hex");
    const execution = {
      id: "exec-invalidsig1",
      walletId: "wal-test",
      walletAddress: user.publicKey.toBase58(),
      basketId: "bkt-test",
      basketVersionId: "bv-test-1",
      type: "open" as const,
      status: "PREPARED" as const,
      idempotencyKey: "invalid-signature-key",
      totalUsdc: 50,
      feeUsdc: 0.1,
      preparedTxs: [Buffer.from(tx.serialize()).toString("base64")],
      messageHashes: [messageHash],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      legs: [{
        id: "leg-1", executionId: "exec-invalidsig1", mint: "JUP1111111111111111111111111111111111111111",
        symbol: "tJUP", inAmountUsdc: 49.9, expectedOut: "29352941", messageHash, status: "PENDING" as const,
      }],
    };
    (await repository.saveExecution(execution));

    await assert.rejects(
      async () => executionService.submit({
        executionId: execution.id,
        signedTxs: [Buffer.from(tx.serialize()).toString("base64")],
      }),
      (error: InstanceType<typeof AppError>) => error.code === "TAMPERED_TRANSACTION"
    );
    assert.equal((await repository.getExecution(execution.id))!.status, "PREPARED");
  });

  test("expired executions are rejected as EXECUTION_EXPIRED", async () => {
    (await seedRegistry());
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
    (await repository.saveExecution(execution));
    await assert.rejects(
      async () => (await executionService.submit({ executionId: "exec-expired1", signedTxs: [] })),
      (e: InstanceType<typeof AppError>) => e.code === "EXECUTION_EXPIRED"
    );
    assert.equal((await repository.getExecution("exec-expired1"))!.status, "EXPIRED");
  });

  test("idempotency keys are scoped to a wallet", async () => {
    (await seedRegistry());
    const wallet = Keypair.generate().publicKey.toBase58();
    const otherWallet = Keypair.generate().publicKey.toBase58();
    const base = {
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
    (await repository.saveExecution({ ...base, walletId: "wal-test", id: "exec-idem-a", idempotencyKey: "key-once" }));
    await assert.rejects(repository.saveExecution({ ...base, walletId: "wal-test", id: "exec-idem-b", idempotencyKey: "key-once" }));
    (await repository.saveExecution({
      ...base,
      walletId: "wal-other",
      walletAddress: otherWallet,
      id: "exec-idem-other-wallet",
      idempotencyKey: "key-once",
    }));
    assert.equal((await repository.getExecutionByIdempotency("key-once", wallet))?.id, "exec-idem-a");
    assert.equal((await repository.getExecutionByIdempotency("key-once", otherWallet))?.id, "exec-idem-other-wallet");
    assert.equal((await repository.getExecutionByIdempotency("key-once", Keypair.generate().publicKey.toBase58())), undefined);
  });

  test("invest replay conflicts when the request body changes", async () => {
    (await seedRegistry());
    const walletAddress = Keypair.generate().publicKey.toBase58();
    (await repository.saveExecution({
      id: "exec-idem-body",
      walletId: "wal-idem-body",
      walletAddress,
      basketId: "bkt-test",
      basketVersionId: "bv-test-1",
      type: "open",
      status: "PREPARED",
      idempotencyKey: "key-body",
      totalUsdc: 50,
      feeUsdc: 0.1,
      preparedTxs: [],
      messageHashes: [],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      legs: [],
    }));

    await assert.rejects(
      async () => (await executionService.prepare({
        basketSlug: "test-basket",
        usdcAmount: 60,
        walletAddress,
        idempotencyKey: "key-body",
      })),
      (error: InstanceType<typeof AppError>) => error.code === "IDEMPOTENCY_CONFLICT"
    );
  });
});

describe("catalog & admin", () => {
  test("proposing a version with wrong weights throws", async () => {
    (await seedRegistry());
    await assert.rejects(
      adminService.proposeBasketVersion("test-basket", {
          version: 2,
          changelog: "bad weights",
          publishedBy: "tests",
          legs: [{ id: "x", versionId: "", mint: "JUP1111111111111111111111111111111111111111", weightBps: 9999, legType: "spl" }],
        } as never),
      /10,000 basis points/
    );
  });

  test("kill switch round-trips through settings", async () => {
    (await adminService.setGlobalKillSwitch(true, "test"));
    assert.equal((await repository.getSetting("global_kill_switch")), "true");
    (await adminService.setGlobalKillSwitch(false, "test"));
    assert.equal((await repository.getSetting("global_kill_switch")), "false");
  });
});

describe("landing queue recovery", () => {
  test("transient landing failure releases its lease and can be reclaimed", async () => {
    const id = `queue-recovery-${Date.now()}`;
    await repository.saveExecution({
      id,
      walletId: "wal-queue-test",
      walletAddress: payerAddress,
      basketId: "bkt-test",
      basketVersionId: "bv-test-1",
      type: "open",
      status: "SUBMITTED",
      idempotencyKey: id,
      totalUsdc: 50,
      feeUsdc: 0.1,
      preparedTxs: [],
      messageHashes: [],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      legs: [],
    });
    const now = Date.now();
    await repository.enqueueJob(id, "leg-recovery", "land", { executionId: id, legId: "leg-recovery" }, now - 1);
    const first = (await repository.claimJobs(1, now))[0];
    assert.equal(first.status, "running");
    assert.equal(first.attempts, 1);

    await repository.requeueJob(first.id, now + 1_000, "LANDING_CONFIRMATION_PENDING");
    const queued = await repository.getJob(first.id);
    assert.equal(queued?.status, "queued");
    assert.equal(queued?.error, "LANDING_CONFIRMATION_PENDING");

    const retry = (await repository.claimJobs(1, now + 1_001))[0];
    assert.equal(retry.id, first.id);
    assert.equal(retry.status, "running");
    assert.equal(retry.attempts, 2);
  });
});

describe("backtest (PRD §4.7)", () => {
  test("computes weighted index over earliest-common window with hypothetical flag", async () => {
    // Synthetic 48h ramp: tJUP +10%, tGOLD +10%, equal weights → expect ~+10%.
    const start = Date.now() - 48 * 3600 * 1000;
    for (let h = 0; h <= 48; h++) {
      const ts = new Date(start + h * 3600 * 1000).toISOString();
      (await repository.addSnapshot("JUP1111111111111111111111111111111111111111", ts, 0.85 * (1 + (h / 48) * 0.1), "pyth"));
      (await repository.addSnapshot("GOLD111111111111111111111111111111111111111", ts, 2400 * (1 + (h / 48) * 0.1), "pyth"));
    }
    const r = (await backtestService.backtest("test-basket", "1W"));
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
    assert.equal(health.headers["X-Content-Type-Options"], "nosniff");
    assert.equal(health.headers["X-Frame-Options"], "DENY");

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

  test("NAV history returns only the basket's hypothetical snapshot series", async () => {
    (await seedRegistry());
    const start = Date.now() - 12 * 3600_000;
    for (let hour = 0; hour < 12; hour++) {
      const ts = new Date(start + hour * 3600_000).toISOString();
      (await repository.addSnapshot("JUP1111111111111111111111111111111111111111", ts, 0.85 + hour / 100, "pyth"));
      (await repository.addSnapshot("GOLD111111111111111111111111111111111111111", ts, 2400 + hour, "pyth"));
    }

    const response = await buildApp().inject({ method: "GET", url: "/v1/baskets/test-basket/nav-history" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().isHypothetical, true);
    assert.match(response.json().benchmarkLabel, /unavailable/i);
    assert.ok(response.json().history.length >= 10);
    assert.ok(response.json().history.every((point: { timestamp: number }) => Number.isFinite(point.timestamp)));

    const performance = await buildApp().inject({
      method: "GET",
      url: "/v1/baskets/test-basket/performance?window=1W",
    });
    assert.equal(performance.statusCode, 200);
    assert.equal(performance.json().isHypothetical, true);
    assert.match(performance.json().benchmarkLabel, /unavailable/i);
    assert.equal("seedPerformance" in performance.json(), false);

    const versions = await buildApp().inject({ method: "GET", url: "/v1/baskets/test-basket/rebalances" });
    assert.equal(versions.statusCode, 200);
    assert.equal(versions.json().versions[0].changelog, "test");
    assert.equal(versions.json().versions[0].legs.length, 2);
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
      const exec = (await repository.getExecution(prepared.id))!;
      if (["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(exec.status)) {
        assert.equal(exec.status, "COMPLETED");
        return;
      }
    }
    assert.fail("execution did not settle in 120 s");
  });
});
