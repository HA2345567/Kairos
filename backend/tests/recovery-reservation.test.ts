process.env.KAIROS_DB_PATH = ":memory:";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Keypair, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import type { Execution } from "../src/db/schema";

const { repository } = await import("../src/db/repository");
const { getRecovery, saveRecovery } = await import("../src/db/recovery");
const { assertRecoveryExpired, recoveryRequest } = await import("../src/services/recovery-request");
const { executionService } = await import("../src/services/execution.service");
const { getConnection, getFallbackConnection } = await import("../src/chain/connection");
const { config } = await import("../src/config");

async function fixture() {
  const id = `reservation-${randomUUID()}`;
  const base: Execution = {
    id, walletId: id, walletAddress: id, basketId: id, basketVersionId: id,
    type: "open", status: "FAILED", idempotencyKey: id, totalUsdc: 10, feeUsdc: 0.1,
    preparedTxs: [], messageHashes: [], expiresAt: new Date(0).toISOString(),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), legs: [],
  };
  await repository.saveExecution(base);
  const candidate = (): Execution => {
    const childId = randomUUID();
    return { ...base, id: childId, idempotencyKey: childId, status: "PREPARED", baseExecutionId: base.id,
      recoveryAction: "retry", expiresAt: new Date(Date.now() + 60_000).toISOString() };
  };
  return { base, candidate };
}

test("concurrent recovery requests with distinct keys reserve one execution", async () => {
  const { base, candidate } = await fixture();
  const first = candidate(), second = candidate();
  const results = await Promise.all([saveRecovery(first), saveRecovery(second)]);
  assert.equal(results[0].id, results[1].id);
  assert.equal((await getRecovery(base.id, "retry"))!.id, results[0].id);
  assert.equal(await repository.getExecution(results[0].id === first.id ? second.id : first.id), undefined);
  const replay = await executionService.retryFailed(base.id, randomUUID(), base.walletAddress);
  assert.equal(replay.id, results[0].id);
  await repository.saveBasket({
    id: base.basketId, slug: base.basketId, name: "Recovery", thesis: "test", category: "test",
    status: "active", activeVersionId: base.basketVersionId, minUsdc: 1, protocols: [],
  });
  await assert.rejects(executionService.prepare({
    walletAddress: base.walletAddress, basketSlug: base.basketId,
    usdcAmount: replay.totalUsdc, idempotencyKey: replay.idempotencyKey,
  }), /different request/);
});

test("retry and unwind reservations are independent and each is reusable", async () => {
  const { base, candidate } = await fixture();
  const retry = await saveRecovery(candidate());
  const unwind = await saveRecovery({ ...candidate(), recoveryAction: "unwind", type: "close" });
  assert.notEqual(retry.id, unwind.id);
  assert.equal((await getRecovery(base.id, "unwind"))!.id, unwind.id);
  assert.equal((await recoveryRequest(base, randomUUID(), "retry")).existing!.id, retry.id);
  await assert.rejects(recoveryRequest(base, retry.idempotencyKey, "unwind"), /different recovery/);
});

test("audit failure rolls back the reservation and prepared execution", async () => {
  const { base, candidate } = await fixture();
  const child = candidate();
  const original = repository.logAudit;
  repository.logAudit = async () => { throw new Error("INJECTED_RECOVERY_AUDIT_FAILURE"); };
  try { await assert.rejects(saveRecovery(child), /INJECTED_RECOVERY_AUDIT_FAILURE/); }
  finally { repository.logAudit = original; }
  assert.equal(await getRecovery(base.id, "retry"), undefined);
  assert.equal(await repository.getExecution(child.id), undefined);
  assert.equal((await saveRecovery(child)).id, child.id);
});

test("refresh replaces once and a competing submit prevents replacement", async () => {
  const { base, candidate } = await fixture();
  const old = await saveRecovery({ ...candidate(), expiresAt: new Date(0).toISOString() });
  const next = { ...candidate(), expiresAt: new Date(0).toISOString() };
  assert.equal((await saveRecovery(next, old.id)).id, next.id);
  assert.equal((await repository.getExecution(old.id))!.status, "EXPIRED");
  assert.equal((await saveRecovery(candidate(), old.id)).id, next.id);
  await repository.updateExecutionStatus(next.id, "SUBMITTED");
  assert.equal((await saveRecovery(candidate(), next.id)).id, next.id);
  assert.equal((await getRecovery(base.id, "retry"))!.status, "SUBMITTED");
});

test("untracked legacy recovery and mismatched wallet cannot create a branch", async () => {
  const { base, candidate } = await fixture();
  await assert.rejects(saveRecovery({ ...candidate(), walletAddress: "another-wallet" }), /does not match/);
  const legacy = { ...candidate(), recoveryAction: undefined };
  await repository.saveExecution(legacy);
  await assert.rejects(recoveryRequest(base, randomUUID(), "retry"), /older recovery/);
});

test("refresh requires finalized blockheight expiry and empty signature history", async () => {
  const { candidate } = await fixture();
  const signer = Keypair.generate();
  const tx = new VersionedTransaction(new TransactionMessage({
    payerKey: signer.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58(), instructions: [],
  }).compileToV0Message());
  tx.sign([signer]);
  const execution = { ...candidate(), lastValidBlockHeight: 100, preparedTxs: [Buffer.from(tx.serialize()).toString("base64")],
    legs: [{ id: "leg" }] } as Execution;
  const connections = [getConnection(), getFallbackConnection()];
  const originals = connections.map(connection => ({ height: connection.getBlockHeight, statuses: connection.getSignatureStatuses }));
  const simulate = config.simulateLanding;
  config.simulateLanding = false;
  let height = 100;
  let seen = false;
  let fallbackQueries = 0;
  try {
    for (const connection of connections) {
      connection.getBlockHeight = async commitment => { assert.equal(commitment, "finalized"); return height; };
      connection.getSignatureStatuses = async (signatures, options) => {
        if (connection === connections[1]) fallbackQueries++;
        assert.equal(signatures.length, 1);
        assert.equal(options?.searchTransactionHistory, true);
        return { context: { slot: 101 }, value: [seen ? { slot: 101, confirmations: null, err: null, confirmationStatus: "finalized" } : null] };
      };
    }
    await assert.rejects(assertRecoveryExpired(execution), /still valid/);
    height = 101;
    seen = true;
    await assert.rejects(assertRecoveryExpired(execution), /chain outcome/);
    assert.equal(fallbackQueries, 0, "a valid primary outcome must never fall back to another index");
    seen = false;
    await assert.doesNotReject(assertRecoveryExpired(execution));
  } finally {
    connections.forEach((connection, index) => {
      connection.getBlockHeight = originals[index].height;
      connection.getSignatureStatuses = originals[index].statuses;
    });
    config.simulateLanding = simulate;
  }
});
