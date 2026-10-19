import { createHash, randomUUID } from "node:crypto";
import type { StatementSync } from "node:sqlite";
import { AppError } from "../errors";
import {
  AnalyticsEventRow,
  Annotation,
  AnnotationKind,
  AuditLog,
  Basket,
  BasketLeg,
  BasketPublishProposal,
  BasketVersion,
  Execution,
  ExecutionLeg,
  FeeRow,
  JobRow,
  LabsBasket,
  LabsComment,
  NonceRow,
  NotificationPreferences,
  OutboxRow,
  ProgramAllowlistRow,
  Position,
  PositionLeg,
  Quote,
  QuoteLeg,
  RebalanceEventRow,
  SettingRow,
  SnapshotRow,
  Token,
  User,
  Wallet,
} from "./schema";
import { all, one, run, tx } from "./postgres";
import { usdcToBaseUnits } from "../services/money";

type Row = Record<string, unknown>;

// ---- row mappers ----
const str = (v: unknown, d = ""): string => (v === null || v === undefined ? d : String(v));
const num = (v: unknown, d = 0): number => (v === null || v === undefined ? d : Number(v));
const bool = (v: unknown): boolean => v === 1 || v === true || v === "1";
const boolU = (v: unknown): boolean | undefined =>
  v === null || v === undefined ? undefined : bool(v);
const json = <T>(v: unknown, d: T): T => {
  if (v === null || v === undefined) return d;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return d;
  }
};
const jsonStr = (v: unknown, d = "null"): string =>
  v === undefined || v === null ? d : typeof v === "string" ? v : JSON.stringify(v);
const nowIso = (): string => new Date().toISOString();

function stableJsonValue(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) throw new TypeError("OUTBOX_PAYLOAD_MUST_BE_ACYCLIC");
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => stableJsonValue(item, seen));
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .filter((key) => record[key] !== undefined)
        .map((key) => [key, stableJsonValue(record[key], seen)])
    );
  } finally {
    seen.delete(value);
  }
}

function stableOutboxPayload(payload: unknown): string {
  if (payload === undefined) return "{}";
  if (typeof payload === "string") return payload;
  return JSON.stringify(stableJsonValue(payload)) ?? "null";
}

function executionNotificationId(event: string, payload: unknown): string | null {
  if (!event.startsWith("execution.")) return null;
  let candidate: unknown = payload;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const record = candidate as Record<string, unknown>;
  const value = record.executionId ?? record.execution_id;
  return value === undefined || value === null || String(value).length === 0 ? null : String(value);
}

function mapUser(r: Row): User {
  return {
    id: str(r.id),
    email: r.email === null || r.email === undefined ? undefined : str(r.email),
    authProvider: str(r.auth_provider, "siws") as User["authProvider"],
    createdAt: str(r.created_at),
    status: str(r.status, "active") as User["status"],
    region: str(r.region, "unknown"),
    ageVerified: bool(r.age_verified),
    eligibilityStatus: str(r.eligibility_status, "eligible") as User["eligibilityStatus"],
  };
}

function mapWallet(r: Row): Wallet {
  return {
    id: str(r.id),
    userId: str(r.user_id),
    address: str(r.address),
    type: str(r.type, "external") as Wallet["type"],
    delegatedSigning: bool(r.delegated_signing),
    policyJson: json<Wallet["policyJson"]>(r.policy_json, undefined as never),
  };
}

/** Split ids for an IN (...) clause so parameter counts stay bounded. */
function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function mapToken(r: Row): Token {
  return {
    mint: str(r.mint),
    symbol: str(r.symbol),
    name: str(r.name),
    decimals: num(r.decimals),
    type: str(r.type, "spl") as Token["type"],
    tradingStatus: str(r.trading_status, "active") as Token["tradingStatus"],
    isMarketHoursRestricted: boolU(r.is_market_hours_restricted),
    denylisted: bool(r.denylisted),
    priceUsd: num(r.price_usd),
    backtestable: r.backtestable === null || r.backtestable === undefined ? true : bool(r.backtestable),
    liquidityUsd: r.liquidity_usd === null || r.liquidity_usd === undefined ? null : num(r.liquidity_usd),
    liquiditySource: r.liquidity_source == null ? null : str(r.liquidity_source),
    liquidityCheckedAt: r.liquidity_checked_at == null ? null : str(r.liquidity_checked_at),
  };
}

function mapAnnotation(r: Row): Annotation {
  return {
    id: str(r.id),
    basketId: str(r.basket_id),
    versionId: r.version_id == null ? null : str(r.version_id),
    kind: str(r.kind, "news") as AnnotationKind,
    title: str(r.title),
    body: str(r.body),
    sourceUrl: r.source_url == null ? null : str(r.source_url),
    source: r.source == null ? null : str(r.source),
    impact: (r.impact == null ? null : str(r.impact)) as Annotation["impact"],
    publishedAt: str(r.published_at),
    createdBy: str(r.created_by),
    createdAt: str(r.created_at),
  };
}

function mapLabsBasket(r: Row, votes: number): LabsBasket {
  return {
    id: str(r.id),
    slug: str(r.slug),
    name: str(r.name),
    thesis: str(r.thesis),
    category: str(r.category, "Labs"),
    coverImageDataUrl: r.cover_image_data_url == null ? null : str(r.cover_image_data_url),
    allocations: json<LabsBasket["allocations"]>(r.allocations_json, []),
    createdBy: str(r.created_by),
    status: str(r.status, "draft") as LabsBasket["status"],
    moderationNote: r.moderation_note == null ? null : str(r.moderation_note),
    basketId: r.basket_id == null ? null : str(r.basket_id),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    votes,
  };
}

function mapBasket(r: Row): Basket {
  return {
    id: str(r.id),
    slug: str(r.slug),
    name: str(r.name),
    thesis: str(r.thesis),
    category: str(r.category),
    status: str(r.status, "active") as Basket["status"],
    activeVersionId: str(r.active_version_id),
    minUsdc: num(r.min_usdc, 25),
    protocols: json<string[]>(r.protocols_json, []),
  };
}

function mapBasketLeg(r: Row): BasketLeg {
  return {
    id: str(r.id),
    versionId: str(r.version_id),
    mint: str(r.mint),
    weightBps: num(r.weight_bps),
    legType: str(r.leg_type, "spl"),
    venueHint: r.venue_hint === null || r.venue_hint === undefined ? undefined : str(r.venue_hint),
    slippageBps:
      r.slippage_bps === null || r.slippage_bps === undefined ? undefined : num(r.slippage_bps),
  };
}

function mapBasketPublishProposal(r: Row): BasketPublishProposal {
  return {
    id: str(r.id),
    basketSlug: str(r.basket_slug),
    proposedBy: str(r.proposed_by),
    createdAt: str(r.created_at),
    versionData: json<BasketPublishProposal["versionData"]>(r.version_data_json, undefined as never),
    status: str(r.status, "pending") as BasketPublishProposal["status"],
    approvedBy: r.approved_by == null ? undefined : str(r.approved_by),
    approvedAt: r.approved_at == null ? undefined : str(r.approved_at),
    approvalNote: r.approval_note == null ? undefined : str(r.approval_note),
  };
}

function mapQuote(r: Row): Quote {
  return {
    id: str(r.id),
    basketId: str(r.basket_id),
    basketVersionId: str(r.basket_version_id),
    usdcAmount: num(r.usdc_amount),
    usdcBaseUnits: r.usdc_base_units == null ? undefined : str(r.usdc_base_units),
    legs: json<QuoteLeg[]>(r.legs_json, []),
    platformFeeUsdc: num(r.platform_fee_usdc),
    platformFeeBaseUnits: r.platform_fee_base_units == null ? undefined : str(r.platform_fee_base_units),
    netInvestUsdc: num(r.net_invest_usdc),
    netInvestBaseUnits: r.net_invest_base_units == null ? undefined : str(r.net_invest_base_units),
    expiresAt: str(r.expires_at),
    createdAt: str(r.created_at),
  };
}

function mapExecutionLeg(r: Row): ExecutionLeg {
  const storedReceipt = r.receipt_json == null
    ? undefined
    : json<Partial<NonNullable<ExecutionLeg["receipt"]>>>(r.receipt_json, {});
  const leg: ExecutionLeg = {
    id: str(r.id),
    executionId: str(r.execution_id),
    mint: str(r.mint),
    symbol: str(r.symbol),
    inAmountUsdc: num(r.in_amount_usdc),
    inUsdcBaseUnits: r.in_usdc_base_units == null ? undefined : str(r.in_usdc_base_units),
    feeUsdc: num(r.fee_usdc),
    feeBaseUnits: r.fee_base_units == null ? undefined : str(r.fee_base_units),
    side: r.side == null ? undefined : str(r.side) as ExecutionLeg["side"],
    inputBaseUnits: r.input_base_units == null ? undefined : str(r.input_base_units),
    receipt: storedReceipt
      ? { ...storedReceipt, commitment: storedReceipt.commitment ?? "confirmed" } as ExecutionLeg["receipt"]
      : undefined,
    expectedOut: str(r.expected_out, "0"),
    messageHash: str(r.message_hash),
    status: str(r.status, "PENDING") as ExecutionLeg["status"],
  };
  if (r.actual_out !== null && r.actual_out !== undefined) leg.actualOut = str(r.actual_out);
  if (r.tx_signature !== null && r.tx_signature !== undefined)
    leg.txSignature = str(r.tx_signature);
  if (r.error !== null && r.error !== undefined) leg.error = str(r.error);
  return leg;
}

function mapExecution(r: Row, legs: ExecutionLeg[]): Execution {
  const exec: Execution = {
    id: str(r.id),
    walletId: str(r.wallet_id),
    walletAddress: str(r.wallet_address),
    basketId: str(r.basket_id),
    basketVersionId: str(r.basket_version_id),
    type: str(r.type, "open") as Execution["type"],
    fundingAsset: str(r.funding_asset, "USDC") as Execution["fundingAsset"],
    solInputAmount: r.sol_input_amount == null ? undefined : num(r.sol_input_amount),
    solPriceUsd: r.sol_price_usd == null ? undefined : num(r.sol_price_usd),
    status: str(r.status, "PREPARED") as Execution["status"],
    idempotencyKey: str(r.idempotency_key),
    requestHash: r.request_hash == null ? undefined : str(r.request_hash),
    totalUsdc: num(r.total_usdc),
    totalUsdcBaseUnits: r.total_usdc_base_units == null ? undefined : str(r.total_usdc_base_units),
    feeUsdc: num(r.fee_usdc),
    feeUsdcBaseUnits: r.fee_usdc_base_units == null ? undefined : str(r.fee_usdc_base_units),
    preparedTxs: json<string[]>(r.prepared_txs_json, []),
    messageHashes: json<string[]>(r.message_hashes_json, []),
    expiresAt: str(r.expires_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    legs,
  };
  if (r.blockhash !== null && r.blockhash !== undefined) exec.blockhash = str(r.blockhash);
  if (r.base_execution_id != null) exec.baseExecutionId = str(r.base_execution_id);
  if (r.recovery_action != null) exec.recoveryAction = str(r.recovery_action) as Execution["recoveryAction"];
  if (r.last_valid_block_height !== null && r.last_valid_block_height !== undefined)
    exec.lastValidBlockHeight = num(r.last_valid_block_height);
  return exec;
}

function mapPositionLeg(r: Row): PositionLeg {
  const leg: PositionLeg = {
    mint: str(r.mint),
    symbol: str(r.symbol),
    targetBps: num(r.target_bps),
    currentAmount: num(r.current_amount),
    currentValueUsd: num(r.current_value_usd),
  };
  if (r.last_known_at != null) leg.lastKnownAt = str(r.last_known_at);
  if (r.last_known_commitment === "confirmed" || r.last_known_commitment === "finalized") {
    leg.lastKnownCommitment = r.last_known_commitment;
  }
  if (r.last_observation_source === "landing" || r.last_observation_source === "portfolio-refresh" || r.last_observation_source === "reconciler") {
    leg.lastObservationSource = r.last_observation_source;
  }
  return leg;
}

function mapPosition(r: Row, legs: PositionLeg[]): Position {
  return {
    id: str(r.id),
    walletAddress: str(r.wallet_address),
    basketId: str(r.basket_id),
    basketVersionId: str(r.basket_version_id),
    entryUsdc: num(r.entry_usdc),
    currentValueUsd: num(r.current_value_usd),
    status: str(r.status, "ACTIVE") as Position["status"],
    rebalanceState: str(r.rebalance_state, "NONE") as Position["rebalanceState"],
    autoRebalance: bool(r.auto_rebalance),
    driftPct: num(r.drift_pct),
    rebalanceAvailable: bool(r.rebalance_available ?? 1),
    legs,
    updatedAt: str(r.updated_at),
  };
}

function mapJob(r: Row): JobRow {
  const job: JobRow = {
    id: str(r.id),
    executionId: str(r.execution_id),
    legId: r.leg_id === null || r.leg_id === undefined ? null : str(r.leg_id),
    kind: str(r.kind),
    payload: r.payload === null || r.payload === undefined ? null : str(r.payload),
    status: str(r.status, "queued") as JobRow["status"],
    attempts: num(r.attempts),
    runAtMs: num(r.run_at_ms),
    error: r.error === null || r.error === undefined ? null : str(r.error),
    claimedAt: r.claimed_at === null || r.claimed_at === undefined ? null : str(r.claimed_at),
    finishedAt:
      r.finished_at === null || r.finished_at === undefined ? null : str(r.finished_at),
    createdAt: str(r.created_at),
  };
  return job;
}

function mapAudit(r: Row): AuditLog {
  const log: AuditLog = {
    id: str(r.id),
    actor: str(r.actor),
    action: str(r.action),
    entity: str(r.entity),
    entityId: str(r.entity_id),
    timestamp: str(r.timestamp),
  };
  if (r.before_json !== null && r.before_json !== undefined)
    log.before = json<any>(r.before_json, undefined as any);
  if (r.after_json !== null && r.after_json !== undefined)
    log.after = json<any>(r.after_json, undefined as any);
  return log;
}

async function loadExecutionLegs(executionId: string): Promise<ExecutionLeg[]> {
  return (await all<Row>(
    "SELECT * FROM execution_legs WHERE execution_id = ? ORDER BY rowid ASC",
    executionId
  )).map(mapExecutionLeg);
}

async function loadPositionLegs(positionId: string): Promise<PositionLeg[]> {
  return (await all<Row>(
    "SELECT * FROM position_legs WHERE position_id = ? ORDER BY rowid ASC",
    positionId
  )).map(mapPositionLeg);
}

async function loadVersionLegs(versionId: string): Promise<BasketLeg[]> {
  return (await all<Row>("SELECT * FROM basket_legs WHERE version_id = ? ORDER BY rowid ASC", versionId)).map(
    mapBasketLeg
  );
}

export class Repository {
  // ================= Users =================
  async getUser(id: string): Promise<User | undefined> {
    const row = (await one<Row>("SELECT * FROM users WHERE id = ?", id));
    return row ? mapUser(row) : undefined;
  }

  async saveUser(user: User): Promise<User> {
    (await run(
      `INSERT INTO users (id, email, auth_provider, created_at, status, region, age_verified, eligibility_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         auth_provider = excluded.auth_provider,
         status = excluded.status,
         region = excluded.region,
         age_verified = excluded.age_verified,
         eligibility_status = excluded.eligibility_status`,
      user.id,
      user.email ?? null,
      user.authProvider,
      user.createdAt,
      user.status,
      user.region,
      user.ageVerified ? 1 : 0,
      user.eligibilityStatus
    ));
    return user;
  }

  /** FR-04: update eligibility state (age attestation / compliance flag). */
  async updateUserEligibility(
    id: string,
    patch: { ageVerified?: boolean; eligibilityStatus?: User["eligibilityStatus"]; region?: string }
  ): Promise<User | undefined> {
    const current = (await this.getUser(id));
    if (!current) return undefined;
    const next: User = {
      ...current,
      ageVerified: patch.ageVerified ?? current.ageVerified,
      eligibilityStatus: patch.eligibilityStatus ?? current.eligibilityStatus,
      region: patch.region ?? current.region,
    };
    return this.saveUser(next);
  }

  // ================= Wallets =================
  async getWalletByAddress(address: string): Promise<Wallet | undefined> {
    const row = (await one<Row>(
      "SELECT * FROM wallets WHERE address = ? LIMIT 1",
      address
    ));
    return row ? mapWallet(row) : undefined;
  }

  async saveWallet(wallet: Wallet): Promise<Wallet> {
    (await run(
      `INSERT INTO wallets (id, user_id, address, type, delegated_signing, policy_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         user_id = excluded.user_id,
         address = excluded.address,
         type = excluded.type,
         delegated_signing = excluded.delegated_signing,
         policy_json = excluded.policy_json`,
      wallet.id,
      wallet.userId,
      wallet.address,
      wallet.type,
      wallet.delegatedSigning,
      wallet.policyJson ? JSON.stringify(wallet.policyJson) : null
    ));
    return wallet;
  }

  /** `policyJson: null` clears the stored policy (used by the one-click revoke). */
  async setDelegatedSigning(
    walletId: string,
    enabled: boolean,
    policyJson?: Wallet["policyJson"] | null
  ): Promise<void> {
    if (policyJson === undefined) {
      (await run("UPDATE wallets SET delegated_signing = ? WHERE id = ?", enabled, walletId));
    } else {
      (await run(
        "UPDATE wallets SET delegated_signing = ?, policy_json = ? WHERE id = ?",
        enabled,
        policyJson ? JSON.stringify(policyJson) : null,
        walletId
      ));
    }
  }

  // ================= Tokens =================
  async getToken(mint: string): Promise<Token | undefined> {
    const row = (await one<Row>("SELECT * FROM tokens WHERE mint = ?", mint));
    return row ? mapToken(row) : undefined;
  }

  /**
   * Registry read including denylisted rows (PRD §10: /tokens filters by
   * denylist). getAllTokens() stays the safe default that hides denylisted
   * mints from catalog, portfolio and quote paths.
   */
  async getAllTokensIncludingDenylisted(): Promise<Token[]> {
    return (await all<Row>("SELECT * FROM tokens ORDER BY rowid ASC")).map(mapToken);
  }

  async getAllTokens(): Promise<Token[]> {
    return (await all<Row>("SELECT * FROM tokens WHERE denylisted = 0 ORDER BY rowid ASC")).map(mapToken);
  }

  /**
   * Batch token read (NFR-02). Catalog composition used to issue one query per
   * leg, which turned a single `/v1/baskets` read into dozens of round trips on
   * a networked database. Denylisting is *not* applied here: callers ask for
   * exact mints and decide visibility themselves, matching getToken().
   */
  async saveToken(token: Token): Promise<Token> {
    (await run(
      `INSERT INTO tokens (mint, symbol, name, decimals, type, trading_status,
                           is_market_hours_restricted, denylisted, price_usd, updated_at,
                           backtestable, liquidity_usd, liquidity_source, liquidity_checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(mint) DO UPDATE SET
         symbol = excluded.symbol,
         name = excluded.name,
         decimals = excluded.decimals,
         type = excluded.type,
         trading_status = excluded.trading_status,
         is_market_hours_restricted = excluded.is_market_hours_restricted,
         denylisted = excluded.denylisted,
         price_usd = excluded.price_usd,
         updated_at = excluded.updated_at,
         backtestable = excluded.backtestable,
         liquidity_usd = excluded.liquidity_usd,
         liquidity_source = excluded.liquidity_source,
         liquidity_checked_at = excluded.liquidity_checked_at`,
      token.mint,
      token.symbol,
      token.name ?? "",
      token.decimals,
      token.type,
      token.tradingStatus,
      token.isMarketHoursRestricted === undefined ? null : token.isMarketHoursRestricted ? 1 : 0,
      token.denylisted,
      token.priceUsd,
      nowIso(),
      token.backtestable === false ? 0 : 1,
      token.liquidityUsd ?? null,
      token.liquiditySource ?? null,
      token.liquidityCheckedAt ?? null
    ));
    return token;
  }

  /** FR-03: record liquidity evidence for a registry token. */
  async updateTokenLiquidity(
    mint: string,
    liquidity: { liquidityUsd: number | null; source?: string | null; backtestable?: boolean }
  ): Promise<Token | undefined> {
    (await run(
      `UPDATE tokens SET liquidity_usd = ?, liquidity_source = ?, liquidity_checked_at = ?,
         backtestable = COALESCE(?, backtestable), updated_at = ? WHERE mint = ?`,
      liquidity.liquidityUsd,
      liquidity.source ?? null,
      nowIso(),
      liquidity.backtestable === undefined ? null : liquidity.backtestable ? 1 : 0,
      nowIso(),
      mint
    ));
    return this.getToken(mint);
  }

  async updateTokenPrice(mint: string, priceUsd: number): Promise<void> {
    (await run("UPDATE tokens SET price_usd = ?, updated_at = ? WHERE mint = ?", priceUsd, nowIso(), mint));
  }

  async getProgramAllowlist(): Promise<ProgramAllowlistRow[]> {
    return (await all<Row>("SELECT * FROM program_allowlist ORDER BY program_id ASC")).map((row) => ({
      programId: str(row.program_id),
      name: str(row.name),
      version: row.version == null ? undefined : str(row.version),
      addedAt: str(row.added_at),
    }));
  }

  async isMintAllowlisted(mint: string): Promise<boolean> {
    const row = await one<Row>(
      "SELECT mint FROM tokens WHERE mint = ? AND denylisted = 0",
      mint
    );
    return Boolean(row);
  }

  // ================= Baskets & Versions =================
  async getBasket(id: string): Promise<Basket | undefined> {
    const row = (await one<Row>("SELECT * FROM baskets WHERE id = ?", id));
    return row ? mapBasket(row) : undefined;
  }

  async getBasketBySlug(slug: string): Promise<Basket | undefined> {
    const row = (await one<Row>("SELECT * FROM baskets WHERE slug = ? OR id = ? LIMIT 1", slug, slug));
    return row ? mapBasket(row) : undefined;
  }

  async getAllBaskets(): Promise<Basket[]> {
    return (await all<Row>("SELECT * FROM baskets ORDER BY rowid ASC")).map(mapBasket);
  }

  async saveBasket(basket: Basket): Promise<Basket> {
    (await run(
      `INSERT INTO baskets (id, slug, name, thesis, category, status, active_version_id,
                            min_usdc, performance_json, protocols_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         slug = excluded.slug,
         name = excluded.name,
         thesis = excluded.thesis,
         category = excluded.category,
         status = excluded.status,
         active_version_id = excluded.active_version_id,
         min_usdc = excluded.min_usdc,
         performance_json = excluded.performance_json,
         protocols_json = excluded.protocols_json`,
      basket.id,
      basket.slug,
      basket.name,
      basket.thesis,
      basket.category,
      basket.status,
      basket.activeVersionId,
      basket.minUsdc,
      "{}",
      JSON.stringify(basket.protocols)
    ));
    return basket;
  }

  async getBasketVersion(id: string): Promise<BasketVersion | undefined> {
    const row = (await one<Row>("SELECT * FROM basket_versions WHERE id = ?", id));
    if (!row) return undefined;
    return {
      id: str(row.id),
      basketId: str(row.basket_id),
      version: num(row.version),
      changelog: str(row.changelog),
      publishedBy: str(row.published_by),
      publishedAt: str(row.published_at),
      legsHash: row.legs_hash == null ? undefined : str(row.legs_hash),
      registryTx: row.registry_tx == null ? undefined : str(row.registry_tx),
      legs: (await loadVersionLegs(str(row.id))),
    };
  }

  /**
   * Batch version read (NFR-02): one round trip fetches the versions and their
   * legs via a LEFT JOIN, instead of one query per table per route.
   */
  async getBasketVersions(ids: string[]): Promise<BasketVersion[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];
    const byVersion = new Map<string, BasketVersion>();
    for (const chunk of chunked(unique, 300)) {
      const placeholders = chunk.map(() => "?").join(",");
      const rows = await all<Row>(
        `SELECT v.*, l.id AS leg_id, l.version_id AS leg_version_id, l.mint AS leg_mint,
                l.weight_bps AS leg_weight_bps, l.leg_type AS leg_leg_type,
                l.venue_hint AS leg_venue_hint, l.slippage_bps AS leg_slippage_bps
           FROM basket_versions v
           LEFT JOIN basket_legs l ON l.version_id = v.id
          WHERE v.id IN (${placeholders})
          ORDER BY l.rowid ASC`,
        ...chunk
      );
      for (const row of rows) {
        const id = str(row.id);
        let version = byVersion.get(id);
        if (!version) {
          version = {
            id,
            basketId: str(row.basket_id),
            version: num(row.version),
            changelog: str(row.changelog),
            publishedBy: str(row.published_by),
            publishedAt: str(row.published_at),
            legsHash: row.legs_hash == null ? undefined : str(row.legs_hash),
            registryTx: row.registry_tx == null ? undefined : str(row.registry_tx),
            legs: [],
          };
          byVersion.set(id, version);
        }
        if (row.leg_id != null) {
          version.legs.push(
            mapBasketLeg({
              id: row.leg_id,
              version_id: row.leg_version_id,
              mint: row.leg_mint,
              weight_bps: row.leg_weight_bps,
              leg_type: row.leg_leg_type,
              venue_hint: row.leg_venue_hint,
              slippage_bps: row.leg_slippage_bps,
            })
          );
        }
      }
    }
    return [...byVersion.values()];
  }

  async getVersionsForBasket(basketId: string): Promise<BasketVersion[]> {
    const rows = (await all<Row>(
      "SELECT * FROM basket_versions WHERE basket_id = ? ORDER BY version DESC",
      basketId
    ));
    const legs = (await all<Row>(
      `SELECT l.* FROM basket_legs l
       JOIN basket_versions v ON l.version_id = v.id
       WHERE v.basket_id = ? ORDER BY l.rowid ASC`,
      basketId
    ));
    return rows.map((r) => ({
      id: str(r.id),
      basketId: str(r.basket_id),
      version: num(r.version),
      changelog: str(r.changelog),
      publishedBy: str(r.published_by),
      publishedAt: str(r.published_at),
      legsHash: r.legs_hash == null ? undefined : str(r.legs_hash),
      registryTx: r.registry_tx == null ? undefined : str(r.registry_tx),
      legs: legs.filter((l) => str(l.version_id) === str(r.id)).map(mapBasketLeg),
    }));
  }

  async getBasketPublishProposal(id: string): Promise<BasketPublishProposal | undefined> {
    const row = (await one<Row>("SELECT * FROM basket_publish_proposals WHERE id = ?", id));
    return row ? mapBasketPublishProposal(row) : undefined;
  }

  async listPendingBasketPublishProposals(): Promise<BasketPublishProposal[]> {
    return (await all<Row>(
      "SELECT * FROM basket_publish_proposals WHERE status = 'pending' ORDER BY created_at ASC"
    )).map(mapBasketPublishProposal);
  }

  async createBasketPublishProposal(proposal: BasketPublishProposal): Promise<BasketPublishProposal> {
    (await run(
      `INSERT INTO basket_publish_proposals (id, basket_slug, proposed_by, created_at, version_data_json)
       VALUES (?, ?, ?, ?, ?)`,
      proposal.id,
      proposal.basketSlug,
      proposal.proposedBy,
      proposal.createdAt,
      JSON.stringify(proposal.versionData)
    ));
    return proposal;
  }

  async approveBasketPublishProposal(
    id: string,
    approver: string,
    approvedAt: string,
    note: string,
    version: BasketVersion,
    basket: Basket,
    registryTx: string,
    legsHash: string
  ): Promise<BasketPublishProposal> {
    return (await tx(async () => {
      const changes = (await run(
        `UPDATE basket_publish_proposals
         SET status = 'approved', approved_by = ?, approved_at = ?, approval_note = ?
         WHERE id = ? AND status = 'pending' AND proposed_by <> ?`,
        approver,
        approvedAt,
        note,
        id,
        approver
      ));
      if (changes !== 1) throw new Error("PUBLISH_PROPOSAL_NOT_PENDING_OR_SAME_ADMIN");
      (await this.savePublishedBasketVersion({ ...version, registryTx, legsHash }, basket));
      const proposal = (await this.getBasketPublishProposal(id));
      if (!proposal) throw new Error("PUBLISH_PROPOSAL_NOT_FOUND");
      return proposal;
    }));
  }

  async saveBasketVersion(version: BasketVersion, immutable = false): Promise<BasketVersion> {
    (await tx(async () => {
      const existing = await one<Row>("SELECT id FROM basket_versions WHERE id = ?", version.id);
      if (existing) {
        if (immutable) {
          throw new AppError("BASKET_VERSION_ALREADY_EXISTS", `Basket version ${version.id} already exists`, 409);
        }
        // Seed/replay callers are idempotent, but published rows are never
        // rewritten. The database append-only trigger protects other writers.
        return;
      }
      (await run(
        `INSERT INTO basket_versions (id, basket_id, version, changelog, published_by, published_at, legs_hash, registry_tx)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        version.id,
        version.basketId,
        version.version,
        version.changelog,
        version.publishedBy,
        version.publishedAt,
        version.legsHash ?? null,
        version.registryTx ?? null
      ));
      (await run("DELETE FROM basket_legs WHERE version_id = ?", version.id));
      for (const leg of version.legs ?? []) {
        (await run(
         `INSERT INTO basket_legs (id, version_id, mint, weight_bps, leg_type, venue_hint, slippage_bps)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          leg.id,
          leg.versionId ?? version.id,
          leg.mint,
          leg.weightBps,
          leg.legType ?? "spl",
          leg.venueHint ?? null,
          leg.slippageBps ?? null
        ));
      }
    }));
    return version;
  }

  async savePublishedBasketVersion(version: BasketVersion, basket: Basket): Promise<BasketVersion> {
    (await tx(async () => {
      (await this.saveBasketVersion(version, true));
      (await this.saveBasket(basket));
    }));
    return version;
  }

  // ================= Quotes =================
  async getQuote(id: string): Promise<Quote | undefined> {
    const row = (await one<Row>("SELECT * FROM quotes WHERE id = ?", id));
    return row ? mapQuote(row) : undefined;
  }

  async saveQuote(quote: Quote): Promise<Quote> {
    (await run(
      `INSERT INTO quotes (id, basket_id, basket_version_id, usdc_amount, usdc_base_units, legs_json,
                           platform_fee_usdc, platform_fee_base_units, net_invest_usdc, net_invest_base_units, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         basket_id = excluded.basket_id,
         basket_version_id = excluded.basket_version_id,
         usdc_amount = excluded.usdc_amount,
         usdc_base_units = excluded.usdc_base_units,
         legs_json = excluded.legs_json,
         platform_fee_usdc = excluded.platform_fee_usdc,
         platform_fee_base_units = excluded.platform_fee_base_units,
         net_invest_usdc = excluded.net_invest_usdc,
         net_invest_base_units = excluded.net_invest_base_units,
         expires_at = excluded.expires_at,
         created_at = excluded.created_at`,
      quote.id,
      quote.basketId,
      quote.basketVersionId,
      quote.usdcAmount,
      quote.usdcBaseUnits ?? String(usdcToBaseUnits(quote.usdcAmount)),
      JSON.stringify(quote.legs),
      quote.platformFeeUsdc,
      quote.platformFeeBaseUnits ?? String(usdcToBaseUnits(quote.platformFeeUsdc)),
      quote.netInvestUsdc,
      quote.netInvestBaseUnits ?? String(usdcToBaseUnits(quote.netInvestUsdc)),
      quote.expiresAt,
      quote.createdAt
    ));
    return quote;
  }

  // ================= Executions & Idempotency =================
  async getExecution(id: string): Promise<Execution | undefined> {
    const row = (await one<Row>("SELECT * FROM executions WHERE id = ?", id));
    return row ? mapExecution(row, (await loadExecutionLegs(str(row.id)))) : undefined;
  }

  /** Serialize execution transitions and commit their DB effects together. */
  async withExecutionLock<T>(id: string, operation: (execution: Execution) => Promise<T>): Promise<T> {
    return tx(async () => {
      const row = await one<Row>("SELECT * FROM executions WHERE id = ? FOR UPDATE", id);
      if (!row) throw new AppError("EXECUTION_NOT_FOUND", undefined, 404);
      return operation(mapExecution(row, await loadExecutionLegs(id)));
    });
  }

  async updateExecutionStatus(id: string, status: Execution["status"]): Promise<void> {
    await run("UPDATE executions SET status = ?, updated_at = ? WHERE id = ?", status, nowIso(), id);
  }

  // Idempotency keys are scoped to a wallet, matching the unique constraint.
  async getExecutionByIdempotency(key: string, walletAddress: string): Promise<Execution | undefined> {
    const row = (await one<Row>(
      "SELECT * FROM executions WHERE idempotency_key = ? AND wallet_address = ? ORDER BY created_at DESC LIMIT 1",
      key,
      walletAddress
    ));
    return row ? mapExecution(row, (await loadExecutionLegs(str(row.id)))) : undefined;
  }

  async getExecutionsForWallet(walletAddress: string): Promise<Execution[]> {
    const rows = await all<Row>("SELECT * FROM executions WHERE wallet_address = ? ORDER BY created_at DESC LIMIT 30", walletAddress);
    return Promise.all(rows.map(async row => mapExecution(row, await loadExecutionLegs(str(row.id)))));
  }

  async saveExecution(execution: Execution): Promise<Execution> {
    try {
      (await tx(async () => {
        (await run(
          `INSERT INTO executions (id, wallet_id, wallet_address, basket_id, basket_version_id,
                                   type, funding_asset, sol_input_amount, sol_price_usd, status, idempotency_key, request_hash, total_usdc, total_usdc_base_units, fee_usdc, fee_usdc_base_units,
                                   prepared_txs_json, message_hashes_json, blockhash,
                                   last_valid_block_height, expires_at, created_at, updated_at, base_execution_id, recovery_action)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             wallet_id = excluded.wallet_id,
             wallet_address = excluded.wallet_address,
             basket_id = excluded.basket_id,
             basket_version_id = excluded.basket_version_id,
              type = excluded.type,
              funding_asset = excluded.funding_asset,
              sol_input_amount = excluded.sol_input_amount,
              sol_price_usd = excluded.sol_price_usd,
              status = excluded.status,
              idempotency_key = excluded.idempotency_key,
              request_hash = excluded.request_hash,
              total_usdc = excluded.total_usdc,
             total_usdc_base_units = excluded.total_usdc_base_units,
             fee_usdc = excluded.fee_usdc,
             fee_usdc_base_units = excluded.fee_usdc_base_units,
             prepared_txs_json = excluded.prepared_txs_json,
             message_hashes_json = excluded.message_hashes_json,
             blockhash = excluded.blockhash,
             last_valid_block_height = excluded.last_valid_block_height,
             expires_at = excluded.expires_at,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at,
             base_execution_id = excluded.base_execution_id,
             recovery_action = excluded.recovery_action`,
          execution.id,
          execution.walletId,
          execution.walletAddress,
          execution.basketId,
          execution.basketVersionId,
           execution.type,
           execution.fundingAsset ?? "USDC",
           execution.solInputAmount ?? null,
           execution.solPriceUsd ?? null,
           execution.status,
            execution.idempotencyKey,
            execution.requestHash ?? null,
            execution.totalUsdc,
           execution.totalUsdcBaseUnits ?? String(usdcToBaseUnits(execution.totalUsdc)),
           execution.feeUsdc,
           execution.feeUsdcBaseUnits ?? String(usdcToBaseUnits(execution.feeUsdc)),
          JSON.stringify(execution.preparedTxs ?? []),
          JSON.stringify(execution.messageHashes ?? []),
          execution.blockhash ?? null,
          execution.lastValidBlockHeight ?? null,
          execution.expiresAt,
          execution.createdAt,
          execution.updatedAt,
          execution.baseExecutionId ?? null,
          execution.recoveryAction ?? null
        ));
        (await run("DELETE FROM execution_legs WHERE execution_id = ?", execution.id));
        for (const leg of execution.legs ?? []) {
          (await run(
            `INSERT INTO execution_legs (id, execution_id, mint, symbol, in_amount_usdc, in_usdc_base_units, fee_usdc, fee_base_units,
                                         expected_out, actual_out, tx_signature, message_hash,
                                         status, error, side, receipt_json, input_base_units)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            leg.id,
            leg.executionId ?? execution.id,
            leg.mint,
            leg.symbol ?? "",
            leg.inAmountUsdc,
            leg.inUsdcBaseUnits ?? String(usdcToBaseUnits(leg.inAmountUsdc)),
            leg.feeUsdc ?? 0,
            leg.feeBaseUnits ?? String(usdcToBaseUnits(leg.feeUsdc ?? 0)),
            leg.expectedOut ?? "0",
            leg.actualOut ?? null,
            leg.txSignature ?? null,
            leg.messageHash ?? "",
            leg.status ?? "PENDING",
            leg.error ?? null,
            leg.side ?? null,
            leg.receipt ? JSON.stringify(leg.receipt) : null,
            leg.inputBaseUnits ?? null
          ));
        }
      }));
    } catch (err) {
      if (
        err instanceof Error &&
        /executions\.wallet_id, executions\.idempotency_key/.test(err.message)
      ) {
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          `Execution with idempotency key "${execution.idempotencyKey}" already exists for wallet ${execution.walletId}`,
          409
        );
      }
      throw err;
    }
    return execution;
  }

  async listExecutions(status?: string, limit: number = 100): Promise<Execution[]> {
    const rows = status
      ? (await all<Row>(
          "SELECT * FROM executions WHERE status = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
          status,
          limit
        ))
      : (await all<Row>(
          "SELECT * FROM executions ORDER BY created_at DESC, rowid DESC LIMIT ?",
          limit
        ));
    return (await Promise.all(rows.map(async (r) => mapExecution(r, (await loadExecutionLegs(str(r.id)))))));
  }

  async updateExecutionLeg(executionId: string, legId: string, patch: Partial<ExecutionLeg>): Promise<void> {
    const colMap: Record<string, string> = {
      mint: "mint",
      symbol: "symbol",
      inAmountUsdc: "in_amount_usdc",
      expectedOut: "expected_out",
      actualOut: "actual_out",
      side: "side",
      inputBaseUnits: "input_base_units",
      receipt: "receipt_json",
      txSignature: "tx_signature",
      messageHash: "message_hash",
      status: "status",
      error: "error",
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, col] of Object.entries(colMap)) {
      if (patch[key as keyof ExecutionLeg] !== undefined) {
        sets.push(`${col} = ?`);
        vals.push(key === "receipt" ? JSON.stringify(patch.receipt) : patch[key as keyof ExecutionLeg]);
      }
    }
    if (sets.length === 0) return;
    vals.push(executionId, legId);
    (await run(
      `UPDATE execution_legs SET ${sets.join(", ")} WHERE execution_id = ? AND id = ?`,
      ...vals
    ));
  }

  // ================= Positions =================
  async getPosition(id: string): Promise<Position | undefined> {
    const row = (await one<Row>("SELECT * FROM positions WHERE id = ?", id));
    return row ? mapPosition(row, (await loadPositionLegs(str(row.id)))) : undefined;
  }

  async getPositionsForWallet(walletAddress: string): Promise<Position[]> {
    const rows = (await all<Row>(
      "SELECT * FROM positions WHERE wallet_address = ? ORDER BY rowid ASC",
      walletAddress
    ));
    return (await Promise.all(rows.map(async (r) => mapPosition(r, (await loadPositionLegs(str(r.id)))))));
  }

  async savePosition(position: Position): Promise<Position> {
    (await tx(async () => {
      const wallet = (await one<Row>(
        "SELECT id FROM wallets WHERE address = ? LIMIT 1",
        position.walletAddress
      ));
      (await run(
        `INSERT INTO positions (id, wallet_address, wallet_id, basket_id, basket_version_id,
                                entry_usdc, current_value_usd, status, rebalance_state, auto_rebalance,
                                drift_pct, rebalance_available, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           wallet_address = excluded.wallet_address,
           wallet_id = COALESCE(excluded.wallet_id, positions.wallet_id),
           basket_id = excluded.basket_id,
           basket_version_id = excluded.basket_version_id,
            entry_usdc = excluded.entry_usdc,
            current_value_usd = excluded.current_value_usd,
            status = excluded.status,
            rebalance_state = excluded.rebalance_state,
            auto_rebalance = excluded.auto_rebalance,
           drift_pct = excluded.drift_pct,
           rebalance_available = excluded.rebalance_available,
           updated_at = excluded.updated_at`,
        position.id,
        position.walletAddress,
        wallet ? str(wallet.id) : null,
        position.basketId,
        position.basketVersionId,
        position.entryUsdc,
        position.currentValueUsd,
        position.status,
        position.rebalanceState ?? "NONE",
        position.autoRebalance,
        position.driftPct,
        position.rebalanceAvailable,
        position.updatedAt
      ));
      (await run("DELETE FROM position_legs WHERE position_id = ?", position.id));
      for (const leg of position.legs ?? []) {
        (await run(
          `INSERT INTO position_legs (position_id, mint, symbol, target_bps, current_amount,
                                      current_value_usd, last_known_amount, last_known_at,
                                      last_known_commitment, last_observation_source, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          position.id,
          leg.mint,
          leg.symbol ?? "",
          leg.targetBps,
           leg.currentAmount,
           leg.currentValueUsd,
           String(leg.currentAmount),
           leg.lastKnownAt ?? position.updatedAt,
           leg.lastKnownCommitment ?? null,
           leg.lastObservationSource ?? null,
           position.updatedAt
        ));
      }
    }));
    return position;
  }

  // target/last-known leg upsert used by the landing worker after confirmation.
  async upsertPositionLeg(
    positionId: string,
    mint: string,
    targetBps: number,
    lastKnownAmount: number | string,
    observation?: {
      observedAt: string;
      commitment: "confirmed" | "finalized";
      source: "landing" | "portfolio-refresh" | "reconciler";
    }
  ): Promise<void> {
    const amountNum = Number(lastKnownAmount);
    (await run(
      `INSERT INTO position_legs (position_id, mint, symbol, target_bps, current_amount,
                                  current_value_usd, last_known_amount, last_known_at,
                                  last_known_commitment, last_observation_source, updated_at)
       VALUES (?, ?, '', ?, ?, 0, ?, ?, ?, ?, ?)
       ON CONFLICT(position_id, mint) DO UPDATE SET
          target_bps = excluded.target_bps,
          current_amount = excluded.current_amount,
          last_known_amount = excluded.last_known_amount,
          last_known_at = COALESCE(excluded.last_known_at, position_legs.last_known_at),
          last_known_commitment = COALESCE(excluded.last_known_commitment, position_legs.last_known_commitment),
          last_observation_source = COALESCE(excluded.last_observation_source, position_legs.last_observation_source),
          updated_at = excluded.updated_at`,
      positionId,
      mint,
      targetBps,
       Number.isFinite(amountNum) ? amountNum : 0,
       String(lastKnownAmount),
       observation?.observedAt ?? null,
       observation?.commitment ?? null,
       observation?.source ?? null,
       nowIso()
     ));
  }

  async recordPositionObservation(
    positionId: string,
    mint: string,
    amount: number | string,
    observation: {
      observedAt: string;
      commitment: "confirmed" | "finalized";
      source: "landing" | "portfolio-refresh" | "reconciler";
    }
  ): Promise<void> {
    (await run(
      `UPDATE position_legs
          SET current_amount = ?, last_known_amount = ?, last_known_at = ?,
              last_known_commitment = ?, last_observation_source = ?, updated_at = ?
        WHERE position_id = ? AND mint = ?`,
      Number(amount),
      String(amount),
      observation.observedAt,
      observation.commitment,
      observation.source,
      observation.observedAt,
      positionId,
      mint
    ));
  }

  // ================= Nonces (SIWS) =================
  async createNonce(walletAddress: string, nonce: string, expiresAtMs: number): Promise<void> {
    (await run(
      `INSERT INTO nonces (wallet_address, nonce, expires_at_ms, used, created_at)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(wallet_address, nonce) DO UPDATE SET
         expires_at_ms = excluded.expires_at_ms,
         used = 0`,
      walletAddress,
      nonce,
      expiresAtMs,
      nowIso()
    ));
  }

  // Single-use consumption: returns true only if the nonce existed, was unused
  // and unexpired. The conditional UPDATE makes this race-free.
  async consumeNonce(walletAddress: string, nonce: string): Promise<boolean> {
    const changes = (await run(
      "UPDATE nonces SET used = 1 WHERE wallet_address = ? AND nonce = ? AND used = 0 AND expires_at_ms > ?",
      walletAddress,
      nonce,
      Date.now()
    ));
    return changes === 1;
  }

  async getNonce(walletAddress: string, nonce: string): Promise<NonceRow | undefined> {
    const row = (await one<Row>(
      "SELECT * FROM nonces WHERE wallet_address = ? AND nonce = ?",
      walletAddress,
      nonce
    ));
    if (!row) return undefined;
    return {
      walletAddress: str(row.wallet_address),
      nonce: str(row.nonce),
      expiresAtMs: num(row.expires_at_ms),
      used: bool(row.used),
      createdAt: str(row.created_at),
    };
  }

  // ================= Refresh tokens =================
  async saveRefreshToken(id: string, userId: string, tokenHash: string, expiresAtMs: number): Promise<void> {
    (await run(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at_ms, revoked, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
      id,
      userId,
      tokenHash,
      expiresAtMs,
      nowIso()
    ));
  }

  async getRefreshToken(tokenHash: string): Promise<{ userId: string; id: string; expiresAtMs: number } | null> {
    const row = (await one<Row>("SELECT * FROM refresh_tokens WHERE token_hash = ?", tokenHash));
    if (!row) return null;
    if (bool(row.revoked)) return null;
    if (num(row.expires_at_ms) <= Date.now()) return null;
    return {
      userId: str(row.user_id),
      id: str(row.id),
      expiresAtMs: num(row.expires_at_ms),
    };
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    (await run("UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?", tokenHash));
  }

  // ================= Settings (kill switch etc.) =================
  async getSetting(key: string): Promise<string | null> {
    const row = (await one<Row>("SELECT value FROM settings WHERE key = ?", key));
    return row && row.value !== null && row.value !== undefined ? str(row.value) : null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    (await run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key,
      value,
      nowIso()
    ));
  }

  async getSettings(): Promise<SettingRow[]> {
    return (await all<Row>("SELECT * FROM settings ORDER BY key ASC")).map((r) => ({
      key: str(r.key),
      value: str(r.value),
      updatedAt: str(r.updated_at),
    }));
  }

  // ================= Price snapshots =================
  async addSnapshot(
    mint: string,
    tsIso: string,
    priceUsd: number,
    source: string,
    sourceRef?: string,
    confidence?: number
  ): Promise<boolean> {
    return (await run(
      `INSERT INTO price_snapshots (mint, ts, price_usd, source, source_ref, confidence)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM price_snapshots WHERE mint = ? AND ts = ? AND source = ?
       )`,
      mint,
      tsIso,
      priceUsd,
      source,
      sourceRef ?? null,
      confidence ?? null,
      mint,
      tsIso,
      source
    )) === 1;
  }

  async getSnapshots(mint: string, fromIso: string, toIso: string): Promise<{ ts: string; priceUsd: number }[]> {
    return (await all<Row>(
      `SELECT ts, price_usd FROM price_snapshots
       WHERE mint = ? AND ts >= ? AND ts <= ?
         AND source IN ('pyth', 'chainlink')
       ORDER BY ts ASC, id ASC`,
      mint,
      fromIso,
      toIso
    )).map((r) => ({ ts: str(r.ts), priceUsd: num(r.price_usd) }));
  }

  async latestPrice(mint: string, source?: "pyth" | "chainlink"): Promise<{
    priceUsd: number;
    ts: string;
    source: "pyth" | "chainlink";
    sourceRef?: string;
    confidence?: number;
  } | null> {
    const row = source
      ? (await one<Row>(
        `SELECT ts, price_usd, source, source_ref, confidence FROM price_snapshots
         WHERE mint = ? AND source = ? ORDER BY ts DESC, id DESC LIMIT 1`,
        mint,
        source
      ))
      : (await one<Row>(
        `SELECT ts, price_usd, source, source_ref, confidence FROM price_snapshots
         WHERE mint = ? AND source IN ('pyth', 'chainlink')
         ORDER BY ts DESC, id DESC LIMIT 1`,
        mint
      ));
    if (!row) return null;
    return {
      priceUsd: num(row.price_usd),
      ts: str(row.ts),
      source: str(row.source) as "pyth" | "chainlink",
      sourceRef: row.source_ref == null ? undefined : str(row.source_ref),
      confidence: row.confidence == null ? undefined : num(row.confidence),
    };
  }

  async getSnapshotsRaw(mint: string, fromIso?: string, toIso?: string): Promise<SnapshotRow[]> {
    return (await all<Row>(
      `SELECT * FROM price_snapshots
       WHERE mint = ?
         AND (?::text IS NULL OR ts >= ?)
         AND (?::text IS NULL OR ts <= ?)
       ORDER BY ts ASC, id ASC`,
      mint,
      fromIso ?? null,
      fromIso ?? null,
      toIso ?? null,
      toIso ?? null
    )).map((r) => ({
      id: num(r.id),
      mint: str(r.mint),
      ts: str(r.ts),
      priceUsd: num(r.price_usd),
      source: str(r.source, "mock"),
      sourceRef: r.source_ref == null ? undefined : str(r.source_ref),
      confidence: r.confidence == null ? undefined : num(r.confidence),
    }));
  }

  // ================= Fee ledger =================
  async addFee(executionId: string, legId: string, amountUsdc: number, tsIso: string): Promise<void> {
    (await run(
      "INSERT INTO fee_ledger (id, execution_id, leg_id, amount_usdc, amount_base_units, token, ts) VALUES (?, ?, ?, ?, ?, 'USDC', ?) ON CONFLICT (execution_id, leg_id) DO NOTHING",
      "fee-" + randomUUID(),
      executionId,
      legId,
      amountUsdc,
      usdcToBaseUnits(amountUsdc),
      tsIso
    ));
  }

  /**
   * Delivered notification events for one wallet's executions (FR-18 read
   * surface). Until a real transport exists these rows are the only place a user
   * can observe what the outbox produced, so they are read-only and scoped by
   * wallet — never by a caller-supplied execution id.
   */
  async listNotificationsForWallet(
    walletAddress: string,
    limit = 100
  ): Promise<Array<{
    id: string;
    event: string;
    eventType: string | null;
    executionId: string | null;
    payload: unknown;
    createdAt: string;
    sentAt: string | null;
  }>> {
    const capped = Math.min(Math.max(1, Math.floor(limit)), 200);
    const rows = (await all<Row>(
      `SELECT o.id, o.event, o.event_type, o.execution_id, o.payload, o.created_at, o.sent_at
         FROM outbox o
         JOIN executions e ON e.id = o.execution_id
        WHERE e.wallet_address = ?
        ORDER BY o.rowid DESC
        LIMIT ?`,
      walletAddress,
      capped
    ));
    return rows.map((row) => {
      let payload: unknown = null;
      const raw = row.payload == null ? null : str(row.payload);
      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = raw;
        }
      }
      return {
        id: str(row.id),
        event: str(row.event),
        eventType: row.event_type == null ? null : str(row.event_type),
        executionId: row.execution_id == null ? null : str(row.execution_id),
        payload,
        createdAt: str(row.created_at),
        sentAt: row.sent_at == null ? null : str(row.sent_at),
      };
    });
  }

  async listFees(): Promise<FeeRow[]> {
    return (await all<Row>("SELECT * FROM fee_ledger ORDER BY ts ASC, rowid ASC")).map((r) => ({
      id: str(r.id),
      executionId: str(r.execution_id),
      amountUsdc: num(r.amount_usdc),
      amountBaseUnits: r.amount_base_units == null ? undefined : str(r.amount_base_units),
      token: str(r.token, "USDC"),
      ts: str(r.ts),
    }));
  }

  // ================= Outbox =================
  async enqueueOutbox(event: string, payload: unknown): Promise<void> {
    const serialized = stableOutboxPayload(payload);
    const executionId = executionNotificationId(event, payload);
    let legId: string | null = null;
    if (executionId && event.startsWith("execution.leg.")) {
      let candidate: unknown = payload;
      if (typeof candidate === "string") {
        try { candidate = JSON.parse(candidate); } catch { candidate = null; }
      }
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        const value = (candidate as Record<string, unknown>).legId ?? (candidate as Record<string, unknown>).leg_id;
        if (value !== undefined && value !== null && String(value).length > 0) legId = String(value);
      }
    }
    // Execution notifications have one durable identity per execution and event
    // type. Other events retain a content-based identity, with separators and
    // canonical JSON so equivalent payloads cannot collide accidentally or
    // duplicate merely because their object keys were inserted in another order.
    const dedupeKey = createHash("sha256")
      .update(executionId ? "execution\0" : "event\0")
      .update(executionId ?? event)
      .update("\0")
      .update(executionId ? `${event}${legId === null ? "" : `\0${legId}`}` : serialized)
      .digest("hex");
    (await run(
      `INSERT INTO outbox
         (id, event, event_type, execution_id, leg_id, payload, created_at, sent_at, dedupe_key, attempts, lease_until_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, 0)
       ON CONFLICT DO NOTHING`,
      "outbox-" + randomUUID(),
      event,
      event,
      executionId,
      legId,
      serialized,
      nowIso(),
      dedupeKey
    ));
  }

  // At-least-once delivery: each claim gets a durable lease token. The token
  // is required for acknowledgement so a worker that lost its lease cannot
  // mark a later worker's delivery as sent.
  async claimOutbox(
    limit: number,
    nowMs: number = Date.now()
  ): Promise<{ id: string; event: string; payload: any; attempts: number; leaseUntilMs: number; leaseToken: string }[]> {
    if (limit <= 0) return [];
    const leaseToken = randomUUID();
    const leaseUntilMs = nowMs + 30_000;
    return (await all<Row>(
      `UPDATE outbox SET
         lease_until_ms = ?,
         lease_token = ?,
         attempts = attempts + 1
       WHERE id IN (
         SELECT id FROM outbox
          WHERE sent_at IS NULL AND lease_until_ms < ?
          ORDER BY rowid ASC LIMIT ? FOR UPDATE SKIP LOCKED
       )
       RETURNING id, event, payload, attempts, lease_until_ms, lease_token`,
      leaseUntilMs,
      leaseToken,
      nowMs,
      limit
    )).map((r) => {
      const raw = r.payload === null || r.payload === undefined ? null : str(r.payload);
      let payload: any = raw;
      if (raw !== null) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = raw;
        }
      }
      return {
        id: str(r.id),
        event: str(r.event),
        payload,
        attempts: num(r.attempts),
        leaseUntilMs: num(r.lease_until_ms),
        leaseToken: str(r.lease_token),
      };
    });
  }

  async acknowledgeOutbox(id: string, leaseToken: string): Promise<boolean> {
    return (await run(
      `UPDATE outbox
          SET sent_at = ?, lease_until_ms = 0, lease_token = NULL
        WHERE id = ?
          AND sent_at IS NULL
          AND lease_token = ?
          AND lease_until_ms >= ?`,
      nowIso(),
      id,
      leaseToken,
      Date.now()
    )) === 1;
  }

  async markOutboxSent(id: string, leaseToken: string): Promise<void> {
    const acknowledged = await this.acknowledgeOutbox(id, leaseToken);
    if (!acknowledged) throw new Error("OUTBOX_LEASE_LOST");
  }

  // ================= Jobs (landing queue) =================
  async enqueueJob(
    executionId: string,
    legId: string,
    kind: string,
    payloadJson: string | object | null,
    runAtMs: number
  ): Promise<void> {
    (await run(
      `INSERT INTO jobs (id, execution_id, leg_id, kind, payload, status, attempts, run_at_ms, created_at)
       VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?)`,
      "job-" + randomUUID(),
      executionId,
      legId,
      kind,
      jsonStr(payloadJson, "{}"),
      runAtMs,
      nowIso()
    ));
  }

  // Crash-safe claim: a single conditional UPDATE flips queued -> running with a
  // per-call claim token; the claimed rows are then read back by that token. If
  // the process dies mid-claim, rows stay 'running' and can be recovered via
  // requeueJob (or a sweeper requeueing stale 'running' rows).
  async claimJobs(limit: number, nowMs: number): Promise<JobRow[]> {
    const claimToken = randomUUID();
    (await run(
      `UPDATE jobs SET status = 'running', attempts = attempts + 1, claimed_at = ?, lease_until_ms = ?
       WHERE id IN (
         SELECT id FROM jobs
         WHERE (status = 'queued' AND run_at_ms <= ?) OR (status = 'running' AND lease_until_ms < ?)
         ORDER BY run_at_ms ASC, rowid ASC
         LIMIT ? FOR UPDATE SKIP LOCKED
       )`,
      claimToken,
      nowMs + 120_000,
      nowMs,
      nowMs,
      limit
    ));
    return (await all<Row>(
      "SELECT * FROM jobs WHERE claimed_at = ? AND status = 'running' ORDER BY run_at_ms ASC, rowid ASC",
      claimToken
    )).map(mapJob);
  }

  async finishJob(id: string, ok: boolean, error?: string): Promise<void> {
    (await run(
      "UPDATE jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?",
      ok ? "done" : "failed",
      error ?? null,
      nowIso(),
      id
    ));
  }

  async requeueJob(id: string, runAtMs: number, error?: string): Promise<void> {
    (await run(
      "UPDATE jobs SET status = 'queued', run_at_ms = ?, claimed_at = NULL, lease_until_ms = 0, finished_at = NULL, error = COALESCE(?, error) WHERE id = ? AND status <> 'done'",
      runAtMs,
      error ?? null,
      id
    ));
  }

  async getJob(id: string): Promise<JobRow | undefined> {
    const row = (await one<Row>("SELECT * FROM jobs WHERE id = ?", id));
    return row ? mapJob(row) : undefined;
  }

  // ================= Rebalance events =================
  async addRebalanceEvent(
    positionId: string,
    fromVersion: string,
    toVersion: string,
    status: string
  ): Promise<void> {
    (await run(
      "INSERT INTO rebalance_events (id, position_id, from_version, to_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      "rbe-" + randomUUID(),
      positionId,
      fromVersion,
      toVersion,
      status,
      nowIso()
    ));
  }

  async listRebalanceEvents(positionId: string): Promise<RebalanceEventRow[]> {
    return (await all<Row>(
      "SELECT * FROM rebalance_events WHERE position_id = ? ORDER BY created_at DESC, rowid DESC",
      positionId
    )).map((r) => ({
      id: str(r.id),
      positionId: str(r.position_id),
      fromVersion: str(r.from_version),
      toVersion: str(r.to_version),
      status: str(r.status, "PENDING"),
      createdAt: str(r.created_at),
    }));
  }

  // ================= Notification preferences (FR-18) =================
  async getNotificationPreferences(walletAddress: string): Promise<NotificationPreferences> {
    const row = (await one<Row>(
      "SELECT * FROM notification_preferences WHERE wallet_address = ?",
      walletAddress
    ));
    if (!row) {
      return {
        walletAddress,
        inApp: true,
        email: false,
        push: false,
        executionUpdates: true,
        rebalanceUpdates: true,
        versionPublish: true,
        updatedAt: nowIso(),
      };
    }
    return {
      walletAddress: str(row.wallet_address),
      inApp: bool(row.in_app),
      email: bool(row.email),
      push: bool(row.push),
      executionUpdates: bool(row.execution_updates),
      rebalanceUpdates: bool(row.rebalance_updates),
      versionPublish: bool(row.version_publish),
      updatedAt: str(row.updated_at),
    };
  }

  async saveNotificationPreferences(
    prefs: Omit<NotificationPreferences, "updatedAt">
  ): Promise<NotificationPreferences> {
    const updatedAt = nowIso();
    (await run(
      `INSERT INTO notification_preferences (wallet_address, in_app, email, push,
         execution_updates, rebalance_updates, version_publish, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(wallet_address) DO UPDATE SET
         in_app = excluded.in_app,
         email = excluded.email,
         push = excluded.push,
         execution_updates = excluded.execution_updates,
         rebalance_updates = excluded.rebalance_updates,
         version_publish = excluded.version_publish,
         updated_at = excluded.updated_at`,
      prefs.walletAddress,
      prefs.inApp ? 1 : 0,
      prefs.email ? 1 : 0,
      prefs.push ? 1 : 0,
      prefs.executionUpdates ? 1 : 0,
      prefs.rebalanceUpdates ? 1 : 0,
      prefs.versionPublish ? 1 : 0,
      updatedAt
    ));
    return { ...prefs, updatedAt };
  }

  // ================= Annotations (FR-27) =================
  async createAnnotation(
    annotation: Omit<Annotation, "createdAt"> & { createdAt?: string }
  ): Promise<Annotation> {
    const entry: Annotation = { ...annotation, createdAt: annotation.createdAt ?? nowIso() };
    (await run(
      `INSERT INTO annotations (id, basket_id, version_id, kind, title, body,
         source_url, source, impact, published_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.id,
      entry.basketId,
      entry.versionId,
      entry.kind,
      entry.title,
      entry.body,
      entry.sourceUrl,
      entry.source,
      entry.impact,
      entry.publishedAt,
      entry.createdBy,
      entry.createdAt
    ));
    return entry;
  }

  async getAnnotation(id: string): Promise<Annotation | undefined> {
    const row = (await one<Row>("SELECT * FROM annotations WHERE id = ?", id));
    return row ? mapAnnotation(row) : undefined;
  }

  async listAnnotations(basketId: string, versionId?: string): Promise<Annotation[]> {
    const rows = versionId
      ? await all<Row>(
          "SELECT * FROM annotations WHERE basket_id = ? AND (version_id = ? OR version_id IS NULL) ORDER BY published_at DESC",
          basketId,
          versionId
        )
      : await all<Row>(
          "SELECT * FROM annotations WHERE basket_id = ? ORDER BY published_at DESC",
          basketId
        );
    return rows.map(mapAnnotation);
  }

  async deleteAnnotation(id: string): Promise<boolean> {
    const existing = (await this.getAnnotation(id));
    if (!existing) return false;
    (await run("DELETE FROM annotations WHERE id = ?", id));
    return true;
  }

  // ================= Labs (FR-25) =================
  async createLabsBasket(
    basket: Omit<LabsBasket, "createdAt" | "updatedAt" | "votes" | "moderationNote" | "basketId"> &
      Partial<Pick<LabsBasket, "moderationNote" | "basketId">>
  ): Promise<LabsBasket> {
    const createdAt = nowIso();
    const entry: LabsBasket = {
      ...basket,
      moderationNote: basket.moderationNote ?? null,
      basketId: basket.basketId ?? null,
      createdAt,
      updatedAt: createdAt,
      votes: 0,
    };
    (await run(
      `INSERT INTO labs_baskets (id, slug, name, thesis, category, cover_image_data_url, allocations_json,
         created_by, status, moderation_note, basket_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.id,
      entry.slug,
      entry.name,
      entry.thesis,
      entry.category,
      entry.coverImageDataUrl ?? null,
      JSON.stringify(entry.allocations),
      entry.createdBy,
      entry.status,
      entry.moderationNote,
      entry.basketId,
      entry.createdAt,
      entry.updatedAt
    ));
    return entry;
  }

  async getLabsBasket(idOrSlug: string): Promise<LabsBasket | undefined> {
    const row = (await one<Row>(
      "SELECT * FROM labs_baskets WHERE id = ? OR slug = ? LIMIT 1",
      idOrSlug,
      idOrSlug
    ));
    if (!row) return undefined;
    const votes = await this.countLabsVotes(str(row.id));
    return mapLabsBasket(row, votes);
  }

  async listLabsBaskets(status?: string): Promise<LabsBasket[]> {
    const rows = status
      ? await all<Row>(
          "SELECT * FROM labs_baskets WHERE status = ? ORDER BY created_at DESC",
          status
        )
      : await all<Row>("SELECT * FROM labs_baskets ORDER BY created_at DESC");
    if (rows.length === 0) return [];
    const counts = (await all<Row>(
      `SELECT labs_basket_id, COUNT(*) AS votes FROM labs_votes GROUP BY labs_basket_id`
    ));
    const voteByBasket = new Map(counts.map((c) => [str(c.labs_basket_id), num(c.votes)]));
    return rows.map((row) => mapLabsBasket(row, voteByBasket.get(str(row.id)) ?? 0));
  }

  async updateLabsBasketStatus(
    id: string,
    status: LabsBasket["status"],
    patch: { moderationNote?: string | null; basketId?: string | null } = {}
  ): Promise<LabsBasket | undefined> {
    const existing = (await this.getLabsBasket(id));
    if (!existing) return undefined;
    const updatedAt = nowIso();
    (await run(
      `UPDATE labs_baskets SET status = ?, moderation_note = COALESCE(?, moderation_note),
         basket_id = COALESCE(?, basket_id), updated_at = ? WHERE id = ?`,
      status,
      patch.moderationNote === undefined ? null : patch.moderationNote,
      patch.basketId === undefined ? null : patch.basketId,
      updatedAt,
      existing.id
    ));
    return this.getLabsBasket(existing.id);
  }

  async countLabsVotes(labsBasketId: string): Promise<number> {
    const row = (await one<Row>(
      "SELECT COUNT(*) AS votes FROM labs_votes WHERE labs_basket_id = ?",
      labsBasketId
    ));
    return num(row?.votes);
  }

  async hasLabsVote(labsBasketId: string, walletAddress: string): Promise<boolean> {
    const row = (await one<Row>(
      "SELECT id FROM labs_votes WHERE labs_basket_id = ? AND wallet_address = ?",
      labsBasketId,
      walletAddress
    ));
    return Boolean(row);
  }

  /** Idempotent: a second vote from the same wallet is a no-op, never a double count. */
  async addLabsVote(labsBasketId: string, walletAddress: string): Promise<boolean> {
    const changes = await run(
      `INSERT INTO labs_votes (id, labs_basket_id, wallet_address, created_at)
       VALUES (?, ?, ?, ?) ON CONFLICT (labs_basket_id, wallet_address) DO NOTHING`,
      "lv-" + randomUUID(),
      labsBasketId,
      walletAddress,
      nowIso()
    );
    return changes > 0;
  }

  async removeLabsVote(labsBasketId: string, walletAddress: string): Promise<boolean> {
    const changes = await run(
      "DELETE FROM labs_votes WHERE labs_basket_id = ? AND wallet_address = ?",
      labsBasketId,
      walletAddress
    );
    return changes > 0;
  }

  async listLabsComments(labsBasketId: string, includeHidden = false): Promise<LabsComment[]> {
    const rows = await all<Row>(
      `SELECT * FROM labs_comments WHERE labs_basket_id = ?${
        includeHidden ? "" : " AND hidden = 0"
      } ORDER BY created_at ASC`,
      labsBasketId
    );
    return rows.map((row) => ({
      id: str(row.id),
      labsBasketId: str(row.labs_basket_id),
      walletAddress: str(row.wallet_address),
      body: str(row.body),
      hidden: bool(row.hidden),
      createdAt: str(row.created_at),
    }));
  }

  async addLabsComment(labsBasketId: string, walletAddress: string, body: string): Promise<LabsComment> {
    const entry: LabsComment = {
      id: "lc-" + randomUUID(),
      labsBasketId,
      walletAddress,
      body,
      hidden: false,
      createdAt: nowIso(),
    };
    (await run(
      `INSERT INTO labs_comments (id, labs_basket_id, wallet_address, body, hidden, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      entry.id,
      entry.labsBasketId,
      entry.walletAddress,
      entry.body,
      0,
      entry.createdAt
    ));
    return entry;
  }

  async setLabsCommentHidden(id: string, hidden: boolean): Promise<boolean> {
    const row = (await one<Row>("SELECT id FROM labs_comments WHERE id = ?", id));
    if (!row) return false;
    (await run("UPDATE labs_comments SET hidden = ? WHERE id = ?", hidden ? 1 : 0, id));
    return true;
  }

  // ================= Analytics + retention (FE-09 / NFR-10 / NFR-12) =================
  async recordAnalyticsEvent(
    event: Omit<AnalyticsEventRow, "id" | "ts"> & { ts?: string }
  ): Promise<void> {
    (await run(
      `INSERT INTO analytics_events (name, path, region, session_hash, ts) VALUES (?, ?, ?, ?, ?)`,
      event.name,
      event.path,
      event.region,
      event.sessionHash,
      event.ts ?? nowIso()
    ));
  }

  async countAnalyticsSince(sinceIso: string): Promise<number> {
    const row = (await one<Row>(
      "SELECT COUNT(*) AS n FROM analytics_events WHERE ts >= ?",
      sinceIso
    ));
    return num(row?.n);
  }

  /** NFR-10/NFR-12: analytics rows carry no PII and expire on a 30-day window. */
  async purgeAnalyticsBefore(cutoffIso: string): Promise<number> {
    const row = (await one<Row>(
      "SELECT COUNT(*) AS n FROM analytics_events WHERE ts < ?",
      cutoffIso
    ));
    (await run("DELETE FROM analytics_events WHERE ts < ?", cutoffIso));
    return num(row?.n);
  }

  async purgeExpiredNonces(nowMs: number): Promise<number> {
    const row = (await one<Row>(
      "SELECT COUNT(*) AS n FROM nonces WHERE expires_at_ms < ?",
      nowMs
    ));
    (await run("DELETE FROM nonces WHERE expires_at_ms < ?", nowMs));
    return num(row?.n);
  }

  async purgeExpiredRefreshTokens(nowMs: number): Promise<number> {
    const row = (await one<Row>(
      "SELECT COUNT(*) AS n FROM refresh_tokens WHERE expires_at_ms < ?",
      nowMs
    ));
    (await run("DELETE FROM refresh_tokens WHERE expires_at_ms < ?", nowMs));
    return num(row?.n);
  }

  /** NFR-10: audit rows older than the configured retention window. */
  async purgeAuditBefore(cutoffIso: string): Promise<number> {
    const row = (await one<Row>(
      "SELECT COUNT(*) AS n FROM audit_log WHERE timestamp < ?",
      cutoffIso
    ));
    (await run("DELETE FROM audit_log WHERE timestamp < ?", cutoffIso));
    return num(row?.n);
  }

  // ================= Audit log =================
  async logAudit(log: Omit<AuditLog, "id" | "timestamp">): Promise<AuditLog> {
    const entry: AuditLog = {
      ...log,
      id: "audit-" + randomUUID(),
      timestamp: nowIso(),
    };
    (await run(
      `INSERT INTO audit_log (id, actor, action, entity, entity_id, before_json, after_json, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.id,
      entry.actor,
      entry.action,
      entry.entity,
      entry.entityId,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.timestamp
    ));
    return entry;
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return (await all<Row>("SELECT * FROM audit_log ORDER BY rowid ASC")).map(mapAudit);
  }
}

export const repository = new Repository();
