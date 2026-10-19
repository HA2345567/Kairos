import { test } from "node:test";
import assert from "node:assert/strict";

// Isolate this repository round-trip from any configured external database.
process.env.KAIROS_DB_PATH = ":memory:";

const { repository } = await import("../src/db/repository");
const { closeDatabase } = await import("../src/db/postgres");

test("execution funding metadata survives persistence for Devnet receipt parsing", async () => {
  const now = new Date().toISOString();
  const execution = {
    id: "exec-funding-roundtrip",
    walletId: "wallet-funding-roundtrip",
    walletAddress: "11111111111111111111111111111111",
    basketId: "basket-funding-roundtrip",
    basketVersionId: "version-funding-roundtrip",
    type: "open" as const,
    fundingAsset: "SOL" as const,
    solInputAmount: 0.25,
    solPriceUsd: 184.2,
    status: "PREPARED" as const,
    idempotencyKey: "idempotency-funding-roundtrip",
    totalUsdc: 46.05,
    feeUsdc: 0.0921,
    preparedTxs: [],
    messageHashes: [],
    expiresAt: now,
    createdAt: now,
    updatedAt: now,
    legs: [],
  };

  try {
    await repository.saveExecution(execution);
    const stored = await repository.getExecution(execution.id);
    assert.equal(stored?.fundingAsset, "SOL");
    assert.equal(stored?.solInputAmount, 0.25);
    assert.equal(stored?.solPriceUsd, 184.2);
  } finally {
    await closeDatabase();
  }
});
