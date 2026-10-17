import { createHash } from "node:crypto";

export interface RequestHashLeg {
  mint: string;
  side?: "buy" | "sell";
  inUsdcBaseUnits?: string;
  inputBaseUnits?: string;
  feeBaseUnits?: string;
  expectedOut?: string;
  minOut?: string;
}

export interface ExecutionRequestHashInput {
  type: "open" | "rebalance" | "close";
  basketId: string;
  basketVersionId: string;
  totalUsdcBaseUnits: string;
  feeUsdcBaseUnits: string;
  legs: RequestHashLeg[];
  baseExecutionId?: string;
  recoveryAction?: "retry" | "unwind";
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, canonicalize(record[key])])
  );
}

/** Stable SHA-256 fingerprint of the economic request, excluding its idempotency key. */
export function hashExecutionRequest(input: ExecutionRequestHashInput): string {
  const canonical = JSON.stringify(canonicalize(input));
  return createHash("sha256").update(canonical).digest("hex");
}
