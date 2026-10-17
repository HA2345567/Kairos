/** USDC amounts stay in integer base units until presentation. */
export function usdcBase(amount: number): number {
  const base = Math.round(amount * 1_000_000);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(base)) {
    throw new Error("Invalid USDC amount");
  }
  return base;
}

export function feeBase(amount: number, bps: number): number {
  if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new Error("Invalid fee input");
  }
  return Number(BigInt(amount) * BigInt(bps) / 10_000n);
}

/** Floor each allocation; give the remainder to the largest weight. */
export function allocateBase(amount: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(amount) || amount < 0 || weights.some(w => !Number.isSafeInteger(w) || w < 0)) {
    throw new Error("Invalid allocation input");
  }
  const sum = weights.reduce((total, weight) => total + BigInt(weight), 0n);
  if (sum === 0n) return weights.map(() => 0);
  const result = weights.map(weight => Number(BigInt(amount) * BigInt(weight) / sum));
  const largest = weights.indexOf(Math.max(...weights));
  result[largest] += amount - result.reduce((total, value) => total + value, 0);
  return result;
}
