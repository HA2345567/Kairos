import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { allocateBaseUnits, baseUnitsToUsdc, usdcToBaseUnits } from "../src/services/money";

process.env.KAIROS_DB_PATH = ":memory:";
const { repository } = await import("../src/db/repository");

describe("USDC base-unit arithmetic", () => {
  test("round-trips six-decimal amounts without floating allocation", () => {
    assert.equal(usdcToBaseUnits(25.01), 25_010_000);
    assert.equal(baseUnitsToUsdc(25_010_000), 25.01);
  });

  test("conserves every unit and assigns the remainder to the largest leg", () => {
    const allocations = allocateBaseUnits(999_999, [3333, 3333, 3334]);
    assert.deepEqual(allocations, [333_299, 333_299, 333_401]);
    assert.equal(allocations.reduce((sum, amount) => sum + amount, 0), 999_999);
  });

  test("rejects precision beyond USDC decimals and invalid weights", () => {
    assert.throws(() => usdcToBaseUnits(1.0000001), /six decimal places/);
    assert.throws(() => allocateBaseUnits(100, [5000, 4000]), /sum to 10,000/);
  });

  test("persists canonical base units alongside legacy display amounts", async () => {
    await repository.saveQuote({
      id: "quote-money-persistence",
      basketId: "basket-money",
      basketVersionId: "version-money",
      usdcAmount: 25.01,
      usdcBaseUnits: "25010000",
      legs: [],
      platformFeeUsdc: 0.05002,
      platformFeeBaseUnits: "50020",
      netInvestUsdc: 24.95998,
      netInvestBaseUnits: "24959980",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: new Date().toISOString(),
    });
    const quote = await repository.getQuote("quote-money-persistence");
    assert.equal(quote?.usdcBaseUnits, "25010000");
    assert.equal(quote?.netInvestBaseUnits, "24959980");

    await repository.addFee("execution-money-persistence", "leg-1", 0.0025, new Date().toISOString());
    assert.equal(
      (await repository.listFees()).find((fee) => fee.executionId === "execution-money-persistence")?.amountBaseUnits,
      "2500",
    );
  });
});
