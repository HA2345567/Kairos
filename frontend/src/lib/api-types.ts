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
  priceImpactPct: string | null;
  priceSource?: "pyth" | "chainlink" | "devnet-registry";
  priceSourceRef?: string;
  priceAsOf?: string | null;
  priceConfidenceUsd?: number | null;
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
  legsHash?: string;
  registryTx?: string;
  legs: BasketLeg[];
}

export type BasketVersionDraft = Pick<BasketVersion, "version" | "changelog" | "publishedBy"> & {
  legs: Array<
    Pick<BasketLeg, "mint" | "weightBps" | "legType"> &
    Partial<Pick<BasketLeg, "id" | "venueHint" | "slippageBps">>
  >;
};

export interface BasketPublishProposal {
  id: string;
  basketSlug: string;
  proposedBy: string;
  createdAt: string;
  versionData: BasketVersionDraft;
  status: "pending" | "approved";
  approvedBy?: string;
  approvedAt?: string;
  approvalNote?: string;
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
  protocols: string[];
}

export interface BasketCatalogToken {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  type: string;
  tradingStatus: string;
  denylisted: boolean;
  priceUsd: number;
  weightBps: number;
}

export interface BasketCatalogItem extends Basket {
  activeVersion: BasketVersion | null;
  tokens: BasketCatalogToken[];
}

export interface TokenRegistryItem {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  type: string;
  tradingStatus: string;
  denylisted: boolean;
  priceUsd: number;
}

export interface TokenRegistryResponse {
  tokens: TokenRegistryItem[];
}

export interface QuoteRequest {
  basket: string;
  usdcAmount?: number;
  solAmount?: number;
}

export interface QuoteResponse {
  quote: Quote;
  funding?: { asset: "SOL" | "USDC"; amount: number; priceUsd?: number };
}

export interface PreparePositionRequest {
  basket: string;
  usdc?: number;
  solAmount?: number;
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
  baseExecutionId?: string;
  recoveryAction?: "retry" | "unwind";
  walletId: string;
  walletAddress: string;
  basketId: string;
  basketVersionId: string;
  type: "open" | "rebalance" | "close";
  status: "PREPARED" | "SUBMITTED" | "LANDING" | "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED" | "EXPIRED";
  idempotencyKey: string;
  requestHash?: string;
  totalUsdc: number;
  feeUsdc: number;
  fundingAsset?: "USDC" | "SOL";
  solInputAmount?: number;
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
  feeUsdc?: number;
  side?: "buy" | "sell";
  inputBaseUnits?: string;
  receipt?: {
    side: "buy" | "sell";
    inputMint: string;
    outputMint: string;
    actualIn: string;
    actualOut: string;
    assetBalanceAfter: string;
    assetDecimals: number;
    slot: number;
    commitment: "confirmed" | "finalized";
  };
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
  /** Reconciler provenance (PRD §7); optional for older rows. */
  lastKnownAt?: string;
  lastKnownCommitment?: "confirmed" | "finalized";
  lastObservationSource?: "landing" | "portfolio-refresh" | "reconciler";
}

export interface Position {
  id: string;
  walletAddress: string;
  basketId: string;
  basketVersionId: string;
  entryUsdc: number;
  currentValueUsd: number;
  status: "ACTIVE" | "MODIFIED" | "CLOSED";
  rebalanceState?: "NONE" | "REBALANCE_PARTIAL";
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
  token: string;
  refreshToken: string;
  user: { id: string; authProvider: string; createdAt: string; status: string; region: string };
  wallet: { id: string; address: string; type: string; delegatedSigning: boolean };
}

export interface AuthRefreshResponse {
  token: string;
  refreshToken: string;
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
  baskets: BasketCatalogItem[];
}

export interface BasketBySlugResponse {
  basket: Basket;
  activeVersion: BasketVersion | null;
  tokens: BasketCatalogToken[];
}

export interface BasketMarketAsset {
  mint: string;
  symbol: string;
  name: string;
  weightBps: number;
  marketMint: string | null;
  marketUrl: string | null;
  priceUsd: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  poolAddress: string | null;
  poolName: string | null;
  dexId: string | null;
  transactions24h: number | null;
  sparkline24h: number[] | null;
  sparklineAsOf: string | null;
  sparklineStatus: "loading" | "ready" | "summary" | "unavailable";
  status: "live" | "unavailable";
  reason?: string;
}

export interface BasketMarketDataResponse {
  source: "GeckoTerminal";
  fetchedAt: string;
  refreshAfterSec: number;
  assets: BasketMarketAsset[];
  coverage: { available: number; total: number; weightBps: number };
  totalVolume24hUsd: number;
  totalLiquidityUsd: number;
  coveredLegsChange24hPct: number | null;
  basketChange24hPct: number | null;
}

export interface BasketMarketNavHistoryResponse {
  source: "GeckoTerminal";
  window: "1W" | "1M" | "6M" | "1Y" | "3Y";
  history: Array<{ timestamp: number; navValue: number }>;
  progress: { loaded: number; publicMarkets: number; basketAssets: number; coverageWeightBps: number; pendingSymbols: string[] };
  complete: boolean;
  availableFrom: number | null;
  fetchedAt: string;
  excludedAssets: Array<{ symbol: string; reason: string }>;
  disclaimer: string;
}

export interface RebalancesResponse {
  versions: BasketVersion[];
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
  // Canonical PRD v4.0 §10 codes (docs/PRD_V4.md). The client surfaces
  // `message` when present, so these must stay in sync with backend/src/errors.ts.
  MISSING_IDEMPOTENCY_KEY = "MISSING_IDEMPOTENCY_KEY",
  INVALID_BASKET = "INVALID_BASKET",
  MESSAGE_TAMPERED = "MESSAGE_TAMPERED",
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  DUST_LEG = "DUST_LEG",
  REGION_BLOCKED = "REGION_BLOCKED",
  ELIGIBILITY_REQUIRED = "ELIGIBILITY_REQUIRED",
  IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT",
  ALREADY_TERMINAL = "ALREADY_TERMINAL",
  MARKET_CLOSED = "MARKET_CLOSED",
  PRICE_STALE = "PRICE_STALE",
  PROGRAM_NOT_ALLOWED = "PROGRAM_NOT_ALLOWED",
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  RATE_LIMITED = "RATE_LIMITED",
  ALL_AGGREGATORS_DOWN = "ALL_AGGREGATORS_DOWN",
  RELAYER_LOW = "RELAYER_LOW",
  KILL_SWITCH_ACTIVE = "KILL_SWITCH_ACTIVE",
  PROGRAM_NOT_DEPLOYED = "PROGRAM_NOT_DEPLOYED",
  ROUTER_REGISTRY_NOT_READY = "ROUTER_REGISTRY_NOT_READY",
  // Deprecated aliases: still emitted by older rows and accepted on read.
  TAMPERED_TRANSACTION = "TAMPERED_TRANSACTION",
  QUOTE_STALE = "QUOTE_STALE",
  DUST_LEG_FORBIDDEN = "DUST_LEG_FORBIDDEN",
}

// ---- FR-26 custom-allocation simulation (/v1/agent/simulate-graph) ----

export interface SimulationRequest {
  allocations: Array<{ mint: string; weightBps: number }>;
  window?: "1W" | "1M" | "6M" | "1Y" | "3Y";
}

export interface SimulationPoint {
  ts: string;
  value: number;
}

export interface SimulationResult {
  window: string;
  base: number;
  from: string | null;
  to: string | null;
  returnPct: number | null;
  series: SimulationPoint[];
  allocations: Array<{ mint: string; symbol: string; weightBps: number; included: boolean }>;
  excluded: Array<{ mint: string; symbol: string; reason: string }>;
  benchmark: {
    available: boolean;
    symbol: string | null;
    mint: string | null;
    returnPct: number | null;
    series: SimulationPoint[];
    label: string;
  };
  unavailableReason: string | null;
  isHypothetical: true;
  disclaimer: string;
}

export interface SimulationResponse {
  simulation: SimulationResult;
}

export interface BasketCompositionDraft {
  idea: string;
  name: string;
  thesis: string;
  category: string;
  allocations: Array<{
    mint: string;
    symbol: string;
    name: string;
    weightBps: number;
    reason: string;
  }>;
  needsClarification: boolean;
  message: string;
  agents: Array<{ name: string; summary: string }>;
}

export interface BasketCompositionResponse {
  draft: BasketCompositionDraft;
}

/** GET /v1/config — the authoritative runtime constants (no hardcoded mints). */
export interface AppConfigResponse {
  schemaVersion: number;
  cluster: string;
  devnetInitialized: boolean;
  usdcMint: string | null;
  usdcDecimals: number | null;
  platformFeeBps: number;
  rebalanceFeeBps: number;
  minBasketUsdc: number;
  dustThresholdUsdc: number;
  quoteValiditySec: number;
  simulateLanding: boolean;
  swapBuilder: string;
}

/** FR-18 notification read surface; only delivered events are listed. */
export interface WalletNotification {
  id: string;
  event: string;
  eventType: string | null;
  executionId: string | null;
  payload: unknown;
  createdAt: string;
  sentAt: string | null;
}

export interface NotificationsResponse {
  notifications: WalletNotification[];
  deliveredOnly: boolean;
}

/** GET /v1/executions/:id/status — compact resume shape (PRD §4.5). */
export interface ExecutionStatusResponse {
  executionId: string;
  status: string;
  terminal: boolean;
  type: string;
  basketId: string;
  createdAt: string;
  updatedAt: string;
  legs: Array<{
    legId: string;
    index: number;
    mint: string;
    symbol: string;
    status: string;
    error: string | null;
  }>;
  seq: number;
}

export interface AuthLogoutResponse {
  revoked: boolean;
}

/** PRD §10 stream contract served over HTTP polling. */
export interface StreamSliceResponse {
  resource: string;
  schema_version: number;
  seq: number;
  events: Array<{
    seq: number;
    event: string;
    resource: string;
    schema_version: number;
    ts: string;
    data: Record<string, unknown>;
  }>;
  resyncRequired: boolean;
}

// ---- Slice F surfaces (FR-04 eligibility, FR-27 annotations, FR-24 registry,
// FR-25 Labs, FR-18 notification preferences) ----

export interface EligibilityView {
  walletAddress: string;
  region: string;
  status: "eligible" | "requires_action" | "restricted";
  ageVerified: boolean;
  regionEligible: boolean;
  eligible: boolean;
  reason: string | null;
}

export interface EligibilityResponse {
  eligibility: EligibilityView;
}

export interface NotificationPreferences {
  walletAddress: string;
  inApp: boolean;
  email: boolean;
  push: boolean;
  executionUpdates: boolean;
  rebalanceUpdates: boolean;
  versionPublish: boolean;
  updatedAt: string;
}

export interface NotificationPreferencesResponse {
  preferences: NotificationPreferences;
}

export interface Annotation {
  id: string;
  basketId: string;
  versionId: string | null;
  kind: "news" | "event" | "checkpoint" | "incentive" | "liquidation";
  title: string;
  body: string;
  sourceUrl: string | null;
  source: string | null;
  impact: "positive" | "negative" | "neutral" | null;
  publishedAt: string;
  createdBy: string;
  createdAt: string;
}

export interface AnnotationsResponse {
  annotations: Annotation[];
  byKind: Record<Annotation["kind"], Annotation[]>;
}

export interface RegistryVerificationResponse {
  basketId: string;
  versionId: string;
  version: number;
  registryTx: string | null;
  storedLegsHash: string | null;
  verified: boolean;
  reason: string | null;
  legsHash: string;
  address: string;
  onchainLegsHash: string | null;
}

export interface LabsBasket {
  id: string;
  slug: string;
  name: string;
  thesis: string;
  category: string;
  coverImageDataUrl?: string | null;
  allocations: Array<{ mint: string; weightBps: number }>;
  createdBy: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "promoted";
  moderationNote: string | null;
  basketId: string | null;
  createdAt: string;
  updatedAt: string;
  votes: number;
}

export interface LabsBasketsResponse {
  labsBaskets: LabsBasket[];
}

export interface LabsBasketResponse {
  labsBasket: LabsBasket;
  comments?: LabsCommentRow[];
  viewerVoted?: boolean;
}

export type BacktestWindow = "1W" | "1M" | "6M" | "1Y" | "3Y";

export interface BasketBacktestResponse {
  slug: string;
  basketVersionId: string;
  window: BacktestWindow;
  from: string;
  to: string;
  returnPct: number;
  benchmarkReturnPct: number | null;
  alphaPct: number | null;
  series: Array<{ ts: string; value: number }>;
  excludedLegs: Array<{ mint: string; symbol: string; reason: string }>;
  isHypothetical: true;
  benchmarkLabel: string;
  disclaimer: string;
}

export interface LabsVoteResponse {
  labsBasket: LabsBasket;
  counted: boolean;
}

export interface LabsCommentRow {
  id: string;
  labsBasketId: string;
  walletAddress: string;
  body: string;
  hidden: boolean;
  createdAt: string;
}

export interface LabsCommentsResponse {
  comments: LabsCommentRow[];
}
