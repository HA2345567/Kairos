// Application error codes (contracts.md §3). Errors always serialize as `{ error: CODE, message? }`.
export const ErrorCodes = [
  "QUOTE_EXPIRED",
  "SLIPPAGE_EXCEEDED",
  "INSUFFICIENT_BALANCE",
  "MARKET_CLOSED",
  "REGION_BLOCKED",
  "KILL_SWITCH_ACTIVE",
  "BASKET_NOT_ACTIVE",
  "WEIGHT_SUM_INVALID",
  "TAMPERED_TRANSACTION",
  "EXECUTION_EXPIRED",
  "EXECUTION_NOT_FOUND",
  "IDEMPOTENCY_CONFLICT",
  "QUOTE_STALE",
  "PRICE_IMPACT_EXCEEDED",
  "SIMULATION_FAILED",
  "PROGRAM_NOT_ALLOWED",
  "MINT_NOT_ALLOWED",
  "MIN_INVESTMENT",
  "POSITION_NOT_FOUND",
  "DUST_LEG_FORBIDDEN",
  "UNAUTHORIZED",
] as const;

export type ErrorCode = (typeof ErrorCodes)[number];

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  QUOTE_EXPIRED: 410,
  SLIPPAGE_EXCEEDED: 422,
  INSUFFICIENT_BALANCE: 422,
  MARKET_CLOSED: 422,
  REGION_BLOCKED: 403,
  KILL_SWITCH_ACTIVE: 503,
  BASKET_NOT_ACTIVE: 422,
  WEIGHT_SUM_INVALID: 422,
  TAMPERED_TRANSACTION: 400,
  EXECUTION_EXPIRED: 410,
  EXECUTION_NOT_FOUND: 404,
  IDEMPOTENCY_CONFLICT: 409,
  QUOTE_STALE: 409,
  PRICE_IMPACT_EXCEEDED: 422,
  SIMULATION_FAILED: 422,
  PROGRAM_NOT_ALLOWED: 422,
  MINT_NOT_ALLOWED: 422,
  MIN_INVESTMENT: 422,
  POSITION_NOT_FOUND: 404,
  DUST_LEG_FORBIDDEN: 422,
  UNAUTHORIZED: 401,
};

export class AppError extends Error {
  constructor(
    public code: string,
    message?: string,
    public status?: number
  ) {
    super(message ?? code);
    this.name = "AppError";
    this.status = status ?? DEFAULT_STATUS[code as ErrorCode] ?? 400;
  }

  /** Coerce any thrown value into an AppError (unknown errors → 500). */
  static from(err: unknown): AppError {
    if (err instanceof AppError) return err;
    const message = err instanceof Error ? err.message : String(err);
    return new AppError("INTERNAL_SERVER_ERROR", message, 500);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
