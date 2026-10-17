export const USDC_DECIMALS = 6;
export const USDC_BASE_UNITS = 10 ** USDC_DECIMALS;

/** Convert a user-facing USDC amount to the integer representation used on-chain. */
export function usdcToBaseUnits(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError("USDC amount must be finite and non-negative");
  const baseUnits = Math.round(amount * USDC_BASE_UNITS);
  if (!Number.isSafeInteger(baseUnits)) throw new RangeError("USDC amount exceeds safe base-unit precision");
  if (Math.abs(baseUnits / USDC_BASE_UNITS - amount) > Number.EPSILON * Math.max(1, Math.abs(amount))) {
    throw new RangeError("USDC amount supports at most six decimal places");
  }
  return baseUnits;
}

export function baseUnitsToUsdc(baseUnits: number): number {
  if (!Number.isSafeInteger(baseUnits) || baseUnits < 0) {
    throw new RangeError("USDC base units must be a safe non-negative integer");
  }
  return baseUnits / USDC_BASE_UNITS;
}

/** Allocate integer USDC units by basis-point weights, giving remainder to the largest leg. */
export function allocateBaseUnits(totalBaseUnits: number, weightsBps: number[]): number[] {
  if (!Number.isSafeInteger(totalBaseUnits) || totalBaseUnits < 0 || weightsBps.length === 0) {
    throw new RangeError("Cannot allocate invalid USDC base units");
  }
  const weightSum = weightsBps.reduce((sum, weight) => sum + weight, 0);
  if (weightSum !== 10_000 || weightsBps.some((weight) => !Number.isInteger(weight) || weight <= 0)) {
    throw new RangeError("Weights must be positive integers that sum to 10,000 bps");
  }
  const allocations = weightsBps.map((weight) => Math.floor((totalBaseUnits * weight) / 10_000));
  const allocated = allocations.reduce((sum, amount) => sum + amount, 0);
  const largestIndex = weightsBps.reduce(
    (largest, weight, index) => (weight > weightsBps[largest] ? index : largest),
    0,
  );
  allocations[largestIndex] += totalBaseUnits - allocated;
  return allocations;
}
