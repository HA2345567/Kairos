export interface HealthResponse {
  status: string;
  service: string;
  cluster: string;
  killSwitchActive: boolean;
  devnetInitialized: boolean;
  timestamp: string;
}

export interface HealthzResponse {
  status: string;
  service: string;
  cluster: string;
  killSwitchActive: boolean;
  devnet: {
    initialized: boolean;
  };
  relayer: {
    pubkey: string;
    solBalance: number;
    funded: boolean;
  };
  counts: {
    baskets: number;
    tokens: number;
    executions: number;
  };
  timestamp: string;
}

export interface QuoteLeg {
  mint: string;
  symbol: string;
  weightBps: number;
  inUsdcAmount: number;
  expectedOutTokens: string;
  minOutTokens: string;
  priceImpactPct: string;
  routeHint?: string;
}

export interface Quote {
  id: string;
  basketId: string;
  basketVersionId: string;
  usdcAmount: number;
  legs: QuoteLeg[];
  platformFeeUsdc: number;
  netInvestUsdc: number;
  expiresAt: string;
  createdAt: string;
}

export interface BasketLeg {
  id: string;
  versionId: string;
  mint: string;
  weightBps: number; // 0..10000
  legType: string;
  venueHint?: string;
  slippageBps?: number;
}

export interface BasketVersion {
  id: string;
  basketId: string;
  version: number;
  changelog: string;
  publishedBy: string;
  publishedAt: string;
  legs: BasketLeg[];
}

export interface Basket {
  id: string;
  slug: string;
  name: string;
  thesis: string;
  category: string;
  status: "active" | "paused" | "deprecated";
  activeVersionId: string;
  minUsdc: number;
  performance: {
    "1W": number;
    "1M": number;
    "6M": number;
    "1Y": number;
  };
  protocols: string[];
}

export interface QuoteRequest {
  basket: string;
  usdcAmount: number;
}

export interface QuoteResponse {
  quote: Quote;
}

export interface PreparePositionRequest {
  basket: string;
  usdc: number;
  walletAddress: string;
  idempotencyKey: string;
}

export interface PreparePositionResponse {
  execution: {
    id: string;
    preparedTxs: string[];
    status: string;
    legs?: unknown[];
  };
}

export interface SubmitPositionRequest {
  executionId: string;
  signedTxs: string[];
  idempotencyKey?: string;
}

export interface SubmitPositionResponse {
  execution: {
    status: string;
    id?: string;
  };
}

export interface Execution {
  id: string;
  walletId: string;
  walletAddress: string;
  basketId: string;
  basketVersionId: string;
  type: "open" | "rebalance" | "close";
  status: "PREPARED" | "SUBMITTED" | "LANDING" | "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED" | "EXPIRED";
  idempotencyKey: string;
  totalUsdc: number;
  feeUsdc: number;
  preparedTxs: string[];
  messageHashes: string[];
  blockhash?: string;
  lastValidBlockHeight?: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  legs: ExecutionLeg[];
}

export interface ExecutionLeg {
  id: string;
  executionId: string;
  mint: string;
  symbol: string;
  inAmountUsdc: number;
  expectedOut: string;
  actualOut?: string;
  txSignature?: string;
  messageHash: string;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  error?: string;
}

export interface PositionsResponse {
  positions: Position[];
}

export interface PositionLeg {
  mint: string;
  symbol: string;
  targetBps: number;
  currentAmount: number;
  currentValueUsd: number;
}

export interface Position {
  id: string;
  walletAddress: string;
  basketId: string;
  basketVersionId: string;
  entryUsdc: number;
  currentValueUsd: number;
  status: "ACTIVE" | "MODIFIED" | "CLOSED";
  autoRebalance: boolean;
  driftPct: number;
  rebalanceAvailable: boolean;
  legs: PositionLeg[];
  updatedAt: string;
}

export interface AuthNonceResponse {
  nonce: string;
  expiresInSec: number;
}

export interface AuthVerifyResponse {
  success: boolean;
  token?: string;
  refreshToken?: string;
}

export interface AuthRefreshResponse {
  success: boolean;
  token?: string;
  refreshToken?: string;
}

export interface FaucetAirdropResponse {
  success: boolean;
  recipient: string;
  token: string;
  amount: number;
  ata: string;
  txSignature?: string;
  simulated?: boolean;
  message: string;
}

export interface AdminKillSwitchResponse {
  killSwitchActive: boolean;
}

export interface BasketsResponse {
  baskets: Basket[];
}

export interface BasketBySlugResponse {
  basket: Basket;
  activeVersion: any; // BasketVersion | null
}

export interface RebalancesResponse {
  versions: string[]; // version IDs
}

export interface KillSwitchToggleRequest {
  active: boolean;
  reason?: string;
}

export interface BasketsSlugStatusRequest {
  status: "active" | "paused" | "deprecated";
}

export interface ErrorResponse {
  error: string;
  message: string;
}

export interface NotFoundError {
  error: string;
  message: string;
}

// Error code mappings from PRD
export enum AppErrorCode {
  NONCE_ISSUE_FAILED = "NONCE_ISSUE_FAILED",
  INVALID_SIGNATURE_OR_NONCE = "INVALID_SIGNATURE_OR_NONCE",
  NONCE_REPLAYED = "NONCE_REPLAYED",
  WALLET_ADDRESS_REQUIRED = "WALLET_ADDRESS_REQUIRED",
  MISSING_AUTH_FIELDS = "MISSING_AUTH_FIELDS",
  INVALID_REFRESH_TOKEN = "INVALID_REFRESH_TOKEN",
  QUOTE_EXPIRED = "QUOTE_EXPIRED",
  QUOTE_FAILED = "QUOTE_FAILED",
  SLIPPAGE_EXCEEDED = "SLIPPAGE_EXCEEDED",
  INVALID_QUOTE_PARAMETERS = "INVALID_QUOTE_PARAMETERS",
  MISSING_REQUIRED_PREPARE_FIELDS = "MISSING_REQUIRED_PREPARE_FIELDS",
  POSITION_NOT_FOUND = "POSITION_NOT_FOUND",
  UNAUTHORIZED = "UNAUTHORIZED",
  INVALID_AUTO_REBALANCE_POLICY = "INVALID_AUTO_REBALANCE_POLICY",
  FORBIDDEN_ADMIN_TOKEN_REQUIRED = "FORBIDDEN_ADMIN_TOKEN_REQUIRED",
  FAUCET_DEVNET_ONLY = "FAUCET_DEVNET_ONLY",
  DEVNET_NOT_INITIALIZED = "DEVNET_NOT_INITIALIZED",
  FAUCET_FAILED = "FAUCET_FAILED",
  VERSION_AND_LEGS_REQUIRED = "VERSION_AND_LEGS_REQUIRED",
  BASKET_NOT_FOUND = "BASKET_NOT_FOUND",
  ACTIVE_MUST_BE_BOOLEAN = "ACTIVE_MUST_BE_BOOLEAN",
  DELEGATED_SIGNING_NOT_ENABLED = "DELEGATED_SIGNING_NOT_ENABLED",
  AUTO_REBALANCE_REQUIRES_EMBEDDED_WALLET = "AUTO_REBALANCE_REQUIRES_EMBEDDED_WALLET",
  INVALID_BASKET_STATUS = "INVALID_BASKET_STATUS",
  INVALID_TRADING_STATUS = "INVALID_TRADING_STATUS",
  TOKEN_NOT_FOUND = "TOKEN_NOT_FOUND",
  ENABLED_MUST_BE_BOOLEAN = "ENABLED_MUST_BE_BOOLEAN",
  MISSING_IDEMPOTENCY_KEY_OR_WALLET = "MISSING_IDEMPOTENCY_KEY_OR_WALLET",
  EXECUTION_NOT_FOUND = "EXECUTION_NOT_FOUND",
}