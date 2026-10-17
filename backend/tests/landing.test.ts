process.env.KAIROS_DB_PATH = ":memory:";
process.env.KAIROS_SIMULATE_LANDING = "1";

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import bs58 from "bs58";
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";

const { repository } = await import("../src/db/repository");
const { processLandingJobsOnce } = await import("../src/workers/landing");
const { executionService } = await import("../src/services/execution.service");
const { config } = await import("../src/config");
const { all } = await import("../src/db/postgres");
const { getConnection, getFallbackConnection } = await import("../src/chain/connection");
const { resolveUsdcAsset } = await import("../src/services/portfolio.service");

async function fixture(status: "PREPARED" | "SUBMITTED" = "SUBMITTED") {
  const id = `landing-recovery-${randomUUID()}`;
  const signer = Keypair.generate();
  const walletAddress = signer.publicKey.toBase58();
  const mint = Keypair.generate().publicKey.toBase58();
  const tx = new VersionedTransaction(new TransactionMessage({
    payerKey: signer.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [SystemProgram.transfer({ fromPubkey: signer.publicKey, toPubkey: signer.publicKey, lamports: 1 })],
  }).compileToV0Message());
  tx.sign([signer]);
  const signedTxBase64 = Buffer.from(tx.serialize()).toString("base64");
  const messageHash = createHash("sha256").update(tx.message.serialize()).digest("hex");

  await repository.saveToken({
    mint, symbol: "TEST", name: "Landing Test", decimals: 6, type: "spl",
    tradingStatus: "active", denylisted: false, priceUsd: 1,
  });
  await repository.saveBasketVersion({
    id: `${id}-version`, basketId: `${id}-basket`, version: 1,
    changelog: "test", publishedBy: "test", publishedAt: new Date().toISOString(),
    legs: [{ id: `${id}-basket-leg`, versionId: `${id}-version`, mint, weightBps: 10_000, legType: "spl" }],
  });
  await repository.saveBasket({
    id: `${id}-basket`, slug: `${id}-basket`, name: "Landing Test", thesis: "test",
    category: "test", status: "active", activeVersionId: `${id}-version`, minUsdc: 1, protocols: [],
  });
  await repository.saveExecution({
    id, walletId: `${id}-wallet`, walletAddress, basketId: `${id}-basket`,
    basketVersionId: `${id}-version`, type: "open", status, idempotencyKey: id,
    totalUsdc: 10, feeUsdc: 0.01, preparedTxs: [signedTxBase64], messageHashes: [messageHash],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    legs: [{
      id: `${id}-leg`, executionId: id, mint, symbol: "TEST", inAmountUsdc: 9.99,
      feeUsdc: 0.01, expectedOut: "2500000", messageHash, status: "PENDING",
    }],
  });

  const payload = { executionId: id, legId: `${id}-leg`, signedTxBase64 };
  return { id, mint, walletAddress, payload };
}

const jobsFor = (id: string) => all<{ id: string; status: string }>("SELECT id, status FROM jobs WHERE execution_id = ?", id);
const eventsFor = (id: string) => all("SELECT id FROM outbox WHERE payload::jsonb->>'executionId' = ?", id);

test("a queued rebalance buy cannot overtake its delayed funding sell", async () => {
  const { id, payload } = await fixture();
  const execution = (await repository.getExecution(id))!;
  execution.type = "rebalance";
  const sell = { ...execution.legs[0], side: "sell" as const, inputBaseUnits: "1000000", expectedOut: "10000000" };
  const buy = { ...execution.legs[0], id: `${id}-buy`, side: "buy" as const, inputBaseUnits: "9990000", feeUsdc: 0 };
  execution.legs = [sell, buy];
  await repository.saveExecution(execution);
  const buyPayload = { ...payload, legId: buy.id };
  await repository.enqueueJob(id, buy.id, "land_leg", buyPayload, Date.now() - 2);
  await repository.enqueueJob(id, sell.id, "land_leg", payload, Date.now() - 1);
  await processLandingJobsOnce();
  const waiting = (await repository.getExecution(id))!;
  assert.equal(waiting.legs[1].status, "PENDING");
  const [buyJob] = await all<{ id: string; status: string; error: string }>(
    "SELECT id, status, error FROM jobs WHERE execution_id = ? AND leg_id = ?", id, buy.id
  );
  assert.equal(buyJob.status, "queued");
  assert.equal(buyJob.error, "WAITING_FOR_REBALANCE_SELLS");
  await processLandingJobsOnce();
  assert.equal((await repository.getExecution(id))!.legs[0].status, "CONFIRMED");
  await repository.requeueJob(buyJob.id, Date.now() - 1);
  await processLandingJobsOnce();
  assert.equal((await repository.getExecution(id))!.status, "COMPLETED");
});

test("retry ancestry survives execution persistence", async () => {
  const { id } = await fixture();
  const parent = (await repository.getExecution(id))!;
  const child = { ...parent, id: `${id}-retry`, idempotencyKey: `${id}-retry`, baseExecutionId: id, legs: [] };
  await repository.saveExecution(child);
  assert.equal((await repository.getExecution(child.id))!.baseExecutionId, id);
});

test("partial sell settlement preserves remaining holdings and deducts its fee once", async () => {
  const { id, mint, walletAddress, payload } = await fixture();
  const execution = (await repository.getExecution(id))!;
  execution.type = "close";
  execution.legs[0] = { ...execution.legs[0], side: "sell", inputBaseUnits: "1000000", expectedOut: "1000000" };
  await repository.saveExecution(execution);
  await repository.savePosition({
    id: `${id}-position`, walletAddress, basketId: execution.basketId,
    basketVersionId: execution.basketVersionId, entryUsdc: 3, currentValueUsd: 3,
    status: "ACTIVE", autoRebalance: false, driftPct: 0, rebalanceAvailable: false,
    updatedAt: new Date().toISOString(),
    legs: [{ mint, symbol: "TEST", targetBps: 10_000, currentAmount: 3, currentValueUsd: 3 }],
  });
  assert.equal((await repository.getExecution(id))!.legs[0].inputBaseUnits, "1000000");
  await repository.enqueueJob(id, payload.legId, "land_leg", payload, Date.now() - 1);
  await processLandingJobsOnce();
  const settled = (await repository.getExecution(id))!;
  assert.equal(settled.status, "COMPLETED");
  assert.equal(settled.legs[0].actualOut, "990000");
  const [position] = await repository.getPositionsForWallet(walletAddress);
  assert.equal(position.legs[0].currentAmount, 2);
  assert.equal(position.status, "ACTIVE");
});

test("simulated landing is restart-safe and writes confirmed effects once", async () => {
  const { id, mint, walletAddress, payload } = await fixture();
  const runAt = Date.now() - 1;
  await repository.enqueueJob(id, `${id}-leg`, "land", payload, runAt);
  await processLandingJobsOnce();

  const confirmed = (await repository.getExecution(id))!;
  assert.equal(confirmed.status, "COMPLETED");
  assert.equal(confirmed.legs[0].status, "CONFIRMED");
  assert.equal((await repository.listFees()).filter((fee) => fee.executionId === id).length, 1);
  const position = (await repository.getPositionsForWallet(walletAddress))[0];
  assert.equal(position.legs.find((leg) => leg.mint === mint)?.currentAmount, 2.5);
  // A later wallet reconciliation must survive a duplicate delivery.
  await repository.upsertPositionLeg(position.id, mint, 10_000, 7);

  // A duplicate queue delivery repairs confirmed-leg side effects idempotently.
  await repository.enqueueJob(id, `${id}-leg`, "land", payload, Date.now() - 1);
  await processLandingJobsOnce();
  assert.equal((await repository.listFees()).filter((fee) => fee.executionId === id).length, 1);
  const refreshed = (await repository.getPositionsForWallet(walletAddress))[0];
  assert.equal(refreshed.legs.find((leg) => leg.mint === mint)?.currentAmount, 7);
  assert.equal((await eventsFor(id)).length, 2);
});

for (const outcome of ["confirmed", "failed"] as const) {
  test(`a ${outcome} outcome rolls back on outbox failure and recovers on retry`, async () => {
    const { id, mint, walletAddress, payload } = await fixture();
    const enqueueOutbox = repository.enqueueOutbox;
    const forceFailure = config.chaos.forceLegFailMint;
    if (outcome === "failed") config.chaos.forceLegFailMint = mint;
    await repository.enqueueJob(id, payload.legId, "land_leg", payload, Date.now() - 1);
    repository.enqueueOutbox = async function (event, body) {
      if (event === `execution.${outcome === "confirmed" ? "completed" : "failed"}`) {
        throw new Error("INJECTED_OUTBOX_FAILURE");
      }
      return enqueueOutbox.call(this, event, body);
    };
    try {
      await processLandingJobsOnce();
    } finally {
      repository.enqueueOutbox = enqueueOutbox;
      config.chaos.forceLegFailMint = forceFailure;
    }
    const interrupted = (await repository.getExecution(id))!;
    assert.equal(interrupted.status, "LANDING");
    assert.equal(interrupted.legs[0].status, "PENDING");
    assert.equal((await repository.listFees()).filter(fee => fee.executionId === id).length, 0);
    assert.equal((await repository.getPositionsForWallet(walletAddress)).length, 0);
    assert.equal((await eventsFor(id)).length, 0);
    const [job] = await jobsFor(id);
    assert.equal(job.status, "queued");

    await repository.requeueJob(job.id, Date.now() - 1);
    if (outcome === "failed") config.chaos.forceLegFailMint = mint;
    try {
      await processLandingJobsOnce();
    } finally {
      config.chaos.forceLegFailMint = forceFailure;
    }
    assert.equal((await repository.getExecution(id))!.status, outcome === "confirmed" ? "COMPLETED" : "FAILED");
    assert.equal((await jobsFor(id))[0].status, outcome === "confirmed" ? "done" : "failed");
    assert.equal((await eventsFor(id)).length, 2);
    assert.equal((await repository.listFees()).filter(fee => fee.executionId === id).length, outcome === "confirmed" ? 1 : 0);
  });
}

test("submission rolls back on audit failure and concurrent retries enqueue once", async () => {
  const { id, payload } = await fixture("PREPARED");
  const request = { executionId: id, signedTxs: [payload.signedTxBase64] };
  const logAudit = repository.logAudit;
  repository.logAudit = async function (event) {
    if (event.action === "SUBMIT_EXECUTION") throw new Error("INJECTED_AUDIT_FAILURE");
    return logAudit.call(this, event);
  };
  try {
    await assert.rejects(executionService.submit(request), /INJECTED_AUDIT_FAILURE/);
  } finally {
    repository.logAudit = logAudit;
  }
  assert.equal((await repository.getExecution(id))!.status, "PREPARED");
  assert.equal((await jobsFor(id)).length, 0);
  assert.equal((await eventsFor(id)).length, 0);

  const results = await Promise.all([executionService.submit(request), executionService.submit(request)]);
  assert.ok(results.every(result => result.status === "SUBMITTED"));
  assert.equal((await jobsFor(id)).length, 1);
  assert.equal((await eventsFor(id)).length, 1);
  await processLandingJobsOnce();
  assert.equal((await repository.getExecution(id))!.status, "COMPLETED");
});

test("confirmed status waits for a receipt, then persists actual output and balance", async () => {
  const { id, mint, walletAddress, payload } = await fixture();
  const usdc = await resolveUsdcAsset();
  const tx = VersionedTransaction.deserialize(Buffer.from(payload.signedTxBase64, "base64"));
  const signature = bs58.encode(tx.signatures[0]);
  const connection = getConnection();
  const fallback = getFallbackConnection();
  const original = {
    send: connection.sendRawTransaction, statuses: connection.getSignatureStatuses,
    receipt: connection.getTransaction, fallbackReceipt: fallback.getTransaction,
    simulate: config.simulateLanding,
  };
  const balance = (asset: string, amount: string) => ({
    accountIndex: asset === mint ? 0 : 1, mint: asset, owner: walletAddress,
    uiTokenAmount: { amount, decimals: 6, uiAmount: null },
  });
  config.simulateLanding = false;
  connection.sendRawTransaction = async () => signature;
  connection.getSignatureStatuses = async () => ({
    context: { slot: 123 }, value: [{ slot: 123, confirmations: 1, err: null, confirmationStatus: "confirmed" }],
  });
  connection.getTransaction = fallback.getTransaction = async () => null;
  try {
    await repository.enqueueJob(id, payload.legId, "land_leg", payload, Date.now() - 1);
    await processLandingJobsOnce();
    assert.equal((await repository.getExecution(id))!.legs[0].status, "PENDING");
    assert.equal((await repository.listFees()).filter(fee => fee.executionId === id).length, 0);
    const [job] = await jobsFor(id);
    assert.equal(job.status, "queued");

    connection.getTransaction = (async () => ({
      slot: 123, transaction: { signatures: [signature], message: tx.message },
      meta: {
        err: null, fee: 5000, preBalances: [], postBalances: [],
        preTokenBalances: [balance(mint, "1000000"), balance(usdc.mint, "10000000")],
        postTokenBalances: [balance(mint, "3400000"), balance(usdc.mint, "0")],
      },
    })) as typeof connection.getTransaction;
    await repository.requeueJob(job.id, Date.now() - 1);
    await processLandingJobsOnce();
    const execution = (await repository.getExecution(id))!;
    assert.equal(execution.status, "COMPLETED");
    assert.equal(execution.legs[0].expectedOut, "2500000");
    assert.equal(execution.legs[0].actualOut, "2400000");
    assert.equal(execution.legs[0].receipt?.actualIn, "10000000");
    const [position] = await repository.getPositionsForWallet(walletAddress);
    assert.equal(position.legs[0].currentAmount, 3.4);
  } finally {
    connection.sendRawTransaction = original.send;
    connection.getSignatureStatuses = original.statuses;
    connection.getTransaction = original.receipt;
    fallback.getTransaction = original.fallbackReceipt;
    config.simulateLanding = original.simulate;
  }
});
