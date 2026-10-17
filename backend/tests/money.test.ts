import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { allocateBaseUnits, baseUnitsToUsdc, usdcToBaseUnits } from "../src/services/money";

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
});
