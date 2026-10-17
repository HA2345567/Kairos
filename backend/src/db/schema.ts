export type ExecutionStatus =
  | "PREPARED"
  | "SUBMITTED"
  | "LANDING"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "FAILED"
  | "EXPIRED";

export type ExecutionType = "open" | "rebalance" | "close";

export interface User {
  id: string;
  email?: string;
  authProvider: "privy" | "siws" | "external";
  createdAt: string;
  status: "active" | "suspended";
  region: string;
}

export interface Wallet {
  id: string;
  userId: string;
  address: string;
  type: "embedded" | "external";
  delegatedSigning: boolean;
  policyJson?: {
    allowlistMints: string[];
    maxSpendUsdcPerRebalance: number;
    maxSlippageBps: number;
    version?: number; // Basket version this policy is tied to
    updatedAt?: string; // ISO timestamp when policy was last updated
  };
}

export interface Token {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  type: "spl" | "xstock" | "ondo" | "stablecoin";
  tradingStatus: "active" | "halted" | "market_closed";
  isMarketHoursRestricted?: boolean;
  denylisted: boolean;
  priceUsd: number;
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

export interface QuoteLeg {
  mint: string;
  symbol: string;
  weightBps: number;
  inUsdcAmount: number;
  expectedOutTokens: string;
  minOutTokens: string;
  priceImpactPct: string | null;
  priceSource: "pyth" | "chainlink" | "devnet-registry";
  priceSourceRef?: string;
  priceAsOf: string | null;
  priceConfidenceUsd: number | null;
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

export interface ExecutionLegReceipt {
  side: "buy" | "sell";
  inputMint: string;
  outputMint: string;
  actualIn: string;
  actualOut: string;
  assetBalanceAfter: string;
  assetDecimals: number;
  slot: number;
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
  receipt?: ExecutionLegReceipt;
  expectedOut: string;
  actualOut?: string;
  txSignature?: string;
  messageHash: string;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  error?: string;
}

export interface Execution {
  id: string;
  baseExecutionId?: string;
  recoveryAction?: "retry" | "unwind";
  walletId: string;
  walletAddress: string;
  basketId: string;
  basketVersionId: string;
  type: ExecutionType;
  status: ExecutionStatus;
  idempotencyKey: string;
  totalUsdc: number;
  feeUsdc: number;
  preparedTxs: string[]; // base64 serialized transactions
  messageHashes: string[]; // SHA256 hashes of prepared messages for byte-verification
  blockhash?: string; // recent blockhash captured at prepare time
  lastValidBlockHeight?: number; // validity window for the prepared blockhash
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  legs: ExecutionLeg[];
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

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  before?: any;
  after?: any;
  timestamp: string;
}

// ---- New durable rows (contracts.md §5) ----

export interface NonceRow {
  walletAddress: string;
  nonce: string;
  expiresAtMs: number;
  used: boolean;
  createdAt: string;
}

export interface SettingRow {
  key: string;
  value: string;
  updatedAt: string;
}

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface JobRow {
  id: string;
  executionId: string;
  legId: string | null;
  kind: string;
  payload: string | null;
  status: JobStatus;
  attempts: number;
  runAtMs: number;
  error?: string | null;
  claimedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

export interface OutboxRow {
  id: string;
  event: string;
  payload: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface FeeRow {
  id: string;
  executionId: string;
  amountUsdc: number;
  token: string;
  ts: string;
}

export interface SnapshotRow {
  id: number;
  mint: string;
  ts: string;
  priceUsd: number;
  source: string;
  sourceRef?: string;
  confidence?: number;
}

export interface RebalanceEventRow {
  id: string;
  positionId: string;
  fromVersion: string;
  toVersion: string;
  status: string;
  createdAt: string;
}

// Shape of backend/data/devnet-state.json (written by scripts/devnet-setup.ts).
// Mirrors contracts.md §6 exactly.
export interface DevnetState {
  cluster: "devnet";
  usdc: { mint: string; decimals: number; authority: string };
  treasury: { pubkey: string };
  relayer: { pubkey: string };
  assets: {
    symbol: string;
    mint: string;
    decimals: number;
    priceUsd: number;
    legType: "spl" | "xstock";
    marketClosed?: boolean;
  }[];
  updatedAt: string;
}
