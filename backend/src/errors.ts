// Application error codes. Errors always serialize as `{ error: CODE, message? }`.
//
// Canonical codes are the PRD v4.0 §10 taxonomy (docs/PRD_V4.md). Codes in the
// "domain" block are implementation-specific names the PRD does not enumerate.
// The block at the end holds deprecated aliases: they stay in the status map so
// existing clients and stored execution rows remain interpretable, but new code
// must emit the canonical code and tests must assert on the canonical code.
export const ErrorCodes = [
  // --- canonical: PRD §10 error taxonomy ---
  "MISSING_IDEMPOTENCY_KEY", // 400
  "INVALID_BASKET", // 400
  "MESSAGE_TAMPERED", // 400
  "INVALID_SIGNATURE", // 400
  "DUST_LEG", // 400
  "REGION_BLOCKED", // 403
  "ELIGIBILITY_REQUIRED", // 403
  "IDEMPOTENCY_CONFLICT", // 409
  "ALREADY_TERMINAL", // 409
  "QUOTE_EXPIRED", // 410
  "SLIPPAGE_EXCEEDED", // 422
  "MARKET_CLOSED", // 422
  "PRICE_STALE", // 422
  "PROGRAM_NOT_ALLOWED", // 422
  "INSUFFICIENT_BALANCE", // 422
  "RATE_LIMITED", // 429
  "ALL_AGGREGATORS_DOWN", // 503
  "RELAYER_LOW", // 503
  "KILL_SWITCH_ACTIVE", // 503

  // --- domain codes used by the implementation ---
  "BASKET_NOT_FOUND",
  "BASKET_NOT_ACTIVE",
  "BASKET_VERSION_NOT_FOUND",
  "BASKET_VERSION_MISMATCH",
  "WEIGHT_SUM_INVALID",
  "TOKEN_HALTED",
  "EXECUTION_EXPIRED",
  "BLOCKHASH_EXPIRED",
  "PROGRAM_NOT_DEPLOYED",
  "ROUTER_REGISTRY_NOT_READY",
  "EXECUTION_NOT_FOUND",
  "PRICE_IMPACT_EXCEEDED",
  "SIMULATION_FAILED",
  "MINT_NOT_ALLOWED",
  "MIN_INVESTMENT",
  "POSITION_NOT_FOUND",
  "LABS_BASKET_NOT_FOUND",
  "LABS_BASKET_NOT_APPROVED",
  "LABS_BASKET_NOT_VOTABLE",
  "LABS_COMMENT_NOT_FOUND",
  "ANNOTATION_NOT_FOUND",
  "NO_FAILED_LEGS",
  "DEVNET_NOT_INITIALIZED",
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "INTERNAL_SERVER_ERROR",

  // --- deprecated aliases (read-compatibility only) ---
  "TAMPERED_TRANSACTION",
  "QUOTE_STALE",
  "DUST_LEG_FORBIDDEN",
] as const;

export type ErrorCode = (typeof ErrorCodes)[number];

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  // canonical
  MISSING_IDEMPOTENCY_KEY: 400,
  INVALID_BASKET: 400,
  MESSAGE_TAMPERED: 400,
  INVALID_SIGNATURE: 400,
  DUST_LEG: 400,
  REGION_BLOCKED: 403,
  ELIGIBILITY_REQUIRED: 403,
  IDEMPOTENCY_CONFLICT: 409,
  ALREADY_TERMINAL: 409,
  QUOTE_EXPIRED: 410,
  SLIPPAGE_EXCEEDED: 422,
  MARKET_CLOSED: 422,
  PRICE_STALE: 422,
  PROGRAM_NOT_ALLOWED: 422,
  INSUFFICIENT_BALANCE: 422,
  RATE_LIMITED: 429,
  ALL_AGGREGATORS_DOWN: 503,
  RELAYER_LOW: 503,
  KILL_SWITCH_ACTIVE: 503,

  // domain
  BASKET_NOT_FOUND: 404,
  BASKET_NOT_ACTIVE: 422,
  BASKET_VERSION_NOT_FOUND: 404,
  BASKET_VERSION_MISMATCH: 409,
  WEIGHT_SUM_INVALID: 422,
  TOKEN_HALTED: 422,
  EXECUTION_EXPIRED: 410,
  BLOCKHASH_EXPIRED: 410,
  PROGRAM_NOT_DEPLOYED: 503,
  ROUTER_REGISTRY_NOT_READY: 503,
  EXECUTION_NOT_FOUND: 404,
  PRICE_IMPACT_EXCEEDED: 422,
  SIMULATION_FAILED: 422,
  MINT_NOT_ALLOWED: 422,
  MIN_INVESTMENT: 422,
  POSITION_NOT_FOUND: 404,
  LABS_BASKET_NOT_FOUND: 404,
  LABS_BASKET_NOT_APPROVED: 422,
  LABS_BASKET_NOT_VOTABLE: 422,
  LABS_COMMENT_NOT_FOUND: 404,
  ANNOTATION_NOT_FOUND: 404,
  NO_FAILED_LEGS: 422,
  DEVNET_NOT_INITIALIZED: 503,
  INVALID_INPUT: 422,
  UNAUTHORIZED: 401,
  INTERNAL_SERVER_ERROR: 500,

  // deprecated aliases keep their historical meaning
  TAMPERED_TRANSACTION: 400, // replaced by MESSAGE_TAMPERED
  QUOTE_STALE: 409, // replaced by PRICE_STALE (422)
  DUST_LEG_FORBIDDEN: 422, // replaced by DUST_LEG (400)
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
