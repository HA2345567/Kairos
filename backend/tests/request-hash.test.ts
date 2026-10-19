process.env.KAIROS_DB_PATH = ":memory:";

import { test } from "node:test";
import assert from "node:assert/strict";
import { hashExecutionRequest } from "../src/services/request-hash";

const { repository } = await import("../src/db/repository");

const request = {
  type: "open" as const,
  basketId: "basket-1",
  basketVersionId: "version-1",
  totalUsdcBaseUnits: "100000000",
  feeUsdcBaseUnits: "200000",
  legs: [
    { mint: "mint-a", side: "buy" as const, inUsdcBaseUnits: "50000000", expectedOut: "1000" },
  ],
};

test("request hashes are stable across object-key ordering", () => {
  assert.equal(
    hashExecutionRequest(request),
    hashExecutionRequest({
      ...request,
      legs: [{ expectedOut: "1000", inUsdcBaseUnits: "50000000", side: "buy", mint: "mint-a" }],
    })
  );
  assert.notEqual(
    hashExecutionRequest(request),
    hashExecutionRequest({ ...request, totalUsdcBaseUnits: "100000001" })
  );
});

test("request hashes persist with execution support records", async () => {
  const requestHash = hashExecutionRequest(request);
  const now = new Date().toISOString();
  await repository.saveExecution({
    id: "request-hash-execution",
    walletId: "request-hash-wallet",
    walletAddress: "request-hash-address",
    basketId: request.basketId,
    basketVersionId: request.basketVersionId,
    type: request.type,
    status: "PREPARED",
    idempotencyKey: "request-hash-key",
    requestHash,
    totalUsdc: 100,
    feeUsdc: 0.2,
    preparedTxs: [],
    messageHashes: [],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: now,
    updatedAt: now,
    legs: [],
  });

  assert.equal((await repository.getExecution("request-hash-execution"))?.requestHash, requestHash);
});
