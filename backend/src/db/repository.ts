import { randomUUID } from "node:crypto";
import type { StatementSync } from "node:sqlite";
import { AppError } from "../errors";
import {
  AuditLog,
  Basket,
  BasketLeg,
  BasketVersion,
  Execution,
  ExecutionLeg,
  FeeRow,
  JobRow,
  NonceRow,
  OutboxRow,
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
import { db, migrate } from "./sqlite";

// Idempotent DDL runs once at module load (contracts.md §1).
migrate();

type Row = Record<string, unknown>;

// ---- prepared-statement cache (all statements prepared once) ----
const statements = new Map<string, StatementSync>();

function st(sql: string): StatementSync {
  let s = statements.get(sql);
  if (!s) {
    s = db.prepare(sql);
    statements.set(sql, s);
  }
  return s;
}

// node:sqlite rejects `undefined` and `boolean` bindings — normalize.
type Bindable = null | number | bigint | string | Buffer;
function bind(v: unknown): Bindable {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" || typeof v === "bigint" || typeof v === "string") return v;
  if (Buffer.isBuffer(v)) return v;
  return String(v); // objects must never be bound directly; always pre-JSON
}

function all<T = Row>(sql: string, ...params: unknown[]): T[] {
  return st(sql).all(...params.map(bind)) as T[];
}

function one<T = Row>(sql: string, ...params: unknown[]): T | undefined {
  return st(sql).get(...params.map(bind)) as T | undefined;
}

function run(sql: string, ...params: unknown[]): number {
  const res = st(sql).run(...params.map(bind));
  return Number(res.changes);
}

// Small transaction helper (node:sqlite has no built-in one). Re-entrant safe.
let txDepth = 0;
function tx<T>(fn: () => T): T {
  if (txDepth > 0) return fn();
  db.exec("BEGIN IMMEDIATE");
  txDepth++;
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    throw err;
  } finally {
    txDepth--;
  }
}

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

function mapUser(r: Row): User {
  return {
    id: str(r.id),
    email: r.email === null || r.email === undefined ? undefined : str(r.email),
    authProvider: str(r.auth_provider, "siws") as User["authProvider"],
    createdAt: str(r.created_at),
    status: str(r.status, "active") as User["status"],
    region: str(r.region, "unknown"),
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
    performance: json<Basket["performance"]>(r.performance_json, {
      "1W": 0,
      "1M": 0,
      "6M": 0,
      "1Y": 0,
    }),
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

function mapQuote(r: Row): Quote {
  return {
    id: str(r.id),
    basketId: str(r.basket_id),
    basketVersionId: str(r.basket_version_id),
    usdcAmount: num(r.usdc_amount),
    legs: json<QuoteLeg[]>(r.legs_json, []),
    platformFeeUsdc: num(r.platform_fee_usdc),
    netInvestUsdc: num(r.net_invest_usdc),
    expiresAt: str(r.expires_at),
    createdAt: str(r.created_at),
  };
}

function mapExecutionLeg(r: Row): ExecutionLeg {
  const leg: ExecutionLeg = {
    id: str(r.id),
    executionId: str(r.execution_id),
    mint: str(r.mint),
    symbol: str(r.symbol),
    inAmountUsdc: num(r.in_amount_usdc),
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
    status: str(r.status, "PREPARED") as Execution["status"],
    idempotencyKey: str(r.idempotency_key),
    totalUsdc: num(r.total_usdc),
    feeUsdc: num(r.fee_usdc),
    preparedTxs: json<string[]>(r.prepared_txs_json, []),
    messageHashes: json<string[]>(r.message_hashes_json, []),
    expiresAt: str(r.expires_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    legs,
  };
  if (r.blockhash !== null && r.blockhash !== undefined) exec.blockhash = str(r.blockhash);
  if (r.last_valid_block_height !== null && r.last_valid_block_height !== undefined)
    exec.lastValidBlockHeight = num(r.last_valid_block_height);
  return exec;
}

function mapPositionLeg(r: Row): PositionLeg {
  return {
    mint: str(r.mint),
    symbol: str(r.symbol),
    targetBps: num(r.target_bps),
    currentAmount: num(r.current_amount),
    currentValueUsd: num(r.current_value_usd),
  };
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

function loadExecutionLegs(executionId: string): ExecutionLeg[] {
  return all<Row>(
    "SELECT * FROM execution_legs WHERE execution_id = ? ORDER BY rowid ASC",
    executionId
  ).map(mapExecutionLeg);
}

function loadPositionLegs(positionId: string): PositionLeg[] {
  return all<Row>(
    "SELECT * FROM position_legs WHERE position_id = ? ORDER BY rowid ASC",
    positionId
  ).map(mapPositionLeg);
}

function loadVersionLegs(versionId: string): BasketLeg[] {
  return all<Row>("SELECT * FROM basket_legs WHERE version_id = ? ORDER BY rowid ASC", versionId).map(
    mapBasketLeg
  );
}

export class Repository {
  // ================= Users =================
  getUser(id: string): User | undefined {
    const row = one<Row>("SELECT * FROM users WHERE id = ?", id);
    return row ? mapUser(row) : undefined;
  }

  saveUser(user: User): User {
    run(
      `INSERT INTO users (id, email, auth_provider, created_at, status, region)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         auth_provider = excluded.auth_provider,
         status = excluded.status,
         region = excluded.region`,
      user.id,
      user.email ?? null,
      user.authProvider,
      user.createdAt,
      user.status,
      user.region
    );
    return user;
  }

  // ================= Wallets =================
  getWalletByAddress(address: string): Wallet | undefined {
    const row = one<Row>(
      "SELECT * FROM wallets WHERE address = ? COLLATE NOCASE LIMIT 1",
      address
    );
    return row ? mapWallet(row) : undefined;
  }

  saveWallet(wallet: Wallet): Wallet {
    run(
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
    );
    return wallet;
  }

  setDelegatedSigning(walletId: string, enabled: boolean, policyJson?: Wallet["policyJson"]): void {
    if (policyJson === undefined) {
      run("UPDATE wallets SET delegated_signing = ? WHERE id = ?", enabled, walletId);
    } else {
      run(
        "UPDATE wallets SET delegated_signing = ?, policy_json = ? WHERE id = ?",
        enabled,
        policyJson ? JSON.stringify(policyJson) : null,
        walletId
      );
    }
  }

  // ================= Tokens =================
  getToken(mint: string): Token | undefined {
    const row = one<Row>("SELECT * FROM tokens WHERE mint = ?", mint);
    return row ? mapToken(row) : undefined;
  }

  getAllTokens(): Token[] {
    return all<Row>("SELECT * FROM tokens WHERE denylisted = 0 ORDER BY rowid ASC").map(mapToken);
  }

  saveToken(token: Token): Token {
    run(
      `INSERT INTO tokens (mint, symbol, name, decimals, type, trading_status,
                           is_market_hours_restricted, denylisted, price_usd, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(mint) DO UPDATE SET
         symbol = excluded.symbol,
         name = excluded.name,
         decimals = excluded.decimals,
         type = excluded.type,
         trading_status = excluded.trading_status,
         is_market_hours_restricted = excluded.is_market_hours_restricted,
         denylisted = excluded.denylisted,
         price_usd = excluded.price_usd,
         updated_at = excluded.updated_at`,
      token.mint,
      token.symbol,
      token.name ?? "",
      token.decimals,
      token.type,
      token.tradingStatus,
      token.isMarketHoursRestricted === undefined ? null : token.isMarketHoursRestricted ? 1 : 0,
      token.denylisted,
      token.priceUsd,
      nowIso()
    );
    return token;
  }

  updateTokenPrice(mint: string, priceUsd: number): void {
    run("UPDATE tokens SET price_usd = ?, updated_at = ? WHERE mint = ?", priceUsd, nowIso(), mint);
  }

  // ================= Baskets & Versions =================
  getBasket(id: string): Basket | undefined {
    const row = one<Row>("SELECT * FROM baskets WHERE id = ?", id);
    return row ? mapBasket(row) : undefined;
  }

  getBasketBySlug(slug: string): Basket | undefined {
    const row = one<Row>("SELECT * FROM baskets WHERE slug = ? OR id = ? LIMIT 1", slug, slug);
    return row ? mapBasket(row) : undefined;
  }

  getAllBaskets(): Basket[] {
    return all<Row>("SELECT * FROM baskets ORDER BY rowid ASC").map(mapBasket);
  }

  saveBasket(basket: Basket): Basket {
    run(
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
      JSON.stringify(basket.performance),
      JSON.stringify(basket.protocols)
    );
    return basket;
  }

  getBasketVersion(id: string): BasketVersion | undefined {
    const row = one<Row>("SELECT * FROM basket_versions WHERE id = ?", id);
    if (!row) return undefined;
    return {
      id: str(row.id),
      basketId: str(row.basket_id),
      version: num(row.version),
      changelog: str(row.changelog),
      publishedBy: str(row.published_by),
      publishedAt: str(row.published_at),
      legs: loadVersionLegs(str(row.id)),
    };
  }

  getVersionsForBasket(basketId: string): BasketVersion[] {
    const rows = all<Row>(
      "SELECT * FROM basket_versions WHERE basket_id = ? ORDER BY version DESC",
      basketId
    );
    const legs = all<Row>(
      `SELECT l.* FROM basket_legs l
       JOIN basket_versions v ON l.version_id = v.id
       WHERE v.basket_id = ? ORDER BY l.rowid ASC`,
      basketId
    );
    return rows.map((r) => ({
      id: str(r.id),
      basketId: str(r.basket_id),
      version: num(r.version),
      changelog: str(r.changelog),
      publishedBy: str(r.published_by),
      publishedAt: str(r.published_at),
      legs: legs.filter((l) => str(l.version_id) === str(r.id)).map(mapBasketLeg),
    }));
  }

  saveBasketVersion(version: BasketVersion): BasketVersion {
    tx(() => {
      run(
        `INSERT INTO basket_versions (id, basket_id, version, changelog, published_by, published_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           basket_id = excluded.basket_id,
           version = excluded.version,
           changelog = excluded.changelog,
           published_by = excluded.published_by,
           published_at = excluded.published_at`,
        version.id,
        version.basketId,
        version.version,
        version.changelog,
        version.publishedBy,
        version.publishedAt
      );
      run("DELETE FROM basket_legs WHERE version_id = ?", version.id);
      for (const leg of version.legs ?? []) {
        run(
          `INSERT INTO basket_legs (id, version_id, mint, weight_bps, leg_type, venue_hint, slippage_bps)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          leg.id,
          leg.versionId ?? version.id,
          leg.mint,
          leg.weightBps,
          leg.legType ?? "spl",
          leg.venueHint ?? null,
          leg.slippageBps ?? null
        );
      }
    });
    return version;
  }

  // ================= Quotes =================
  getQuote(id: string): Quote | undefined {
    const row = one<Row>("SELECT * FROM quotes WHERE id = ?", id);
    return row ? mapQuote(row) : undefined;
  }

  saveQuote(quote: Quote): Quote {
    run(
      `INSERT INTO quotes (id, basket_id, basket_version_id, usdc_amount, legs_json,
                           platform_fee_usdc, net_invest_usdc, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         basket_id = excluded.basket_id,
         basket_version_id = excluded.basket_version_id,
         usdc_amount = excluded.usdc_amount,
         legs_json = excluded.legs_json,
         platform_fee_usdc = excluded.platform_fee_usdc,
         net_invest_usdc = excluded.net_invest_usdc,
         expires_at = excluded.expires_at,
         created_at = excluded.created_at`,
      quote.id,
      quote.basketId,
      quote.basketVersionId,
      quote.usdcAmount,
      JSON.stringify(quote.legs),
      quote.platformFeeUsdc,
      quote.netInvestUsdc,
      quote.expiresAt,
      quote.createdAt
    );
    return quote;
  }

  // ================= Executions & Idempotency =================
  getExecution(id: string): Execution | undefined {
    const row = one<Row>("SELECT * FROM executions WHERE id = ?", id);
    return row ? mapExecution(row, loadExecutionLegs(str(row.id))) : undefined;
  }

  // Backed by UNIQUE (wallet_id, idempotency_key) + idx_executions_idempotency.
  getExecutionByIdempotency(key: string): Execution | undefined {
    const row = one<Row>(
      "SELECT * FROM executions WHERE idempotency_key = ? ORDER BY created_at DESC LIMIT 1",
      key
    );
    return row ? mapExecution(row, loadExecutionLegs(str(row.id))) : undefined;
  }

  saveExecution(execution: Execution): Execution {
    try {
      tx(() => {
        run(
          `INSERT INTO executions (id, wallet_id, wallet_address, basket_id, basket_version_id,
                                   type, status, idempotency_key, total_usdc, fee_usdc,
                                   prepared_txs_json, message_hashes_json, blockhash,
                                   last_valid_block_height, expires_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             wallet_id = excluded.wallet_id,
             wallet_address = excluded.wallet_address,
             basket_id = excluded.basket_id,
             basket_version_id = excluded.basket_version_id,
             type = excluded.type,
             status = excluded.status,
             idempotency_key = excluded.idempotency_key,
             total_usdc = excluded.total_usdc,
             fee_usdc = excluded.fee_usdc,
             prepared_txs_json = excluded.prepared_txs_json,
             message_hashes_json = excluded.message_hashes_json,
             blockhash = excluded.blockhash,
             last_valid_block_height = excluded.last_valid_block_height,
             expires_at = excluded.expires_at,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at`,
          execution.id,
          execution.walletId,
          execution.walletAddress,
          execution.basketId,
          execution.basketVersionId,
          execution.type,
          execution.status,
          execution.idempotencyKey,
          execution.totalUsdc,
          execution.feeUsdc,
          JSON.stringify(execution.preparedTxs ?? []),
          JSON.stringify(execution.messageHashes ?? []),
          execution.blockhash ?? null,
          execution.lastValidBlockHeight ?? null,
          execution.expiresAt,
          execution.createdAt,
          execution.updatedAt
        );
        run("DELETE FROM execution_legs WHERE execution_id = ?", execution.id);
        for (const leg of execution.legs ?? []) {
          run(
            `INSERT INTO execution_legs (id, execution_id, mint, symbol, in_amount_usdc,
                                         expected_out, actual_out, tx_signature, message_hash,
                                         status, error)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            leg.id,
            leg.executionId ?? execution.id,
            leg.mint,
            leg.symbol ?? "",
            leg.inAmountUsdc,
            leg.expectedOut ?? "0",
            leg.actualOut ?? null,
            leg.txSignature ?? null,
            leg.messageHash ?? "",
            leg.status ?? "PENDING",
            leg.error ?? null
          );
        }
      });
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

  listExecutions(status?: string, limit: number = 100): Execution[] {
    const rows = status
      ? all<Row>(
          "SELECT * FROM executions WHERE status = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
          status,
          limit
        )
      : all<Row>(
          "SELECT * FROM executions ORDER BY created_at DESC, rowid DESC LIMIT ?",
          limit
        );
    return rows.map((r) => mapExecution(r, loadExecutionLegs(str(r.id))));
  }

  updateExecutionLeg(executionId: string, legId: string, patch: Partial<ExecutionLeg>): void {
    const colMap: Record<string, string> = {
      mint: "mint",
      symbol: "symbol",
      inAmountUsdc: "in_amount_usdc",
      expectedOut: "expected_out",
      actualOut: "actual_out",
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
        vals.push(patch[key as keyof ExecutionLeg]);
      }
    }
    if (sets.length === 0) return;
    vals.push(executionId, legId);
    run(
      `UPDATE execution_legs SET ${sets.join(", ")} WHERE execution_id = ? AND id = ?`,
      ...vals
    );
  }

  // ================= Positions =================
  getPosition(id: string): Position | undefined {
    const row = one<Row>("SELECT * FROM positions WHERE id = ?", id);
    return row ? mapPosition(row, loadPositionLegs(str(row.id))) : undefined;
  }

  getPositionsForWallet(walletAddress: string): Position[] {
    const rows = all<Row>(
      "SELECT * FROM positions WHERE wallet_address = ? COLLATE NOCASE ORDER BY rowid ASC",
      walletAddress
    );
    return rows.map((r) => mapPosition(r, loadPositionLegs(str(r.id))));
  }

  savePosition(position: Position): Position {
    tx(() => {
      const wallet = one<Row>(
        "SELECT id FROM wallets WHERE address = ? COLLATE NOCASE LIMIT 1",
        position.walletAddress
      );
      run(
        `INSERT INTO positions (id, wallet_address, wallet_id, basket_id, basket_version_id,
                                entry_usdc, current_value_usd, status, auto_rebalance,
                                drift_pct, rebalance_available, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           wallet_address = excluded.wallet_address,
           wallet_id = COALESCE(excluded.wallet_id, wallet_id),
           basket_id = excluded.basket_id,
           basket_version_id = excluded.basket_version_id,
           entry_usdc = excluded.entry_usdc,
           current_value_usd = excluded.current_value_usd,
           status = excluded.status,
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
        position.autoRebalance,
        position.driftPct,
        position.rebalanceAvailable,
        position.updatedAt
      );
      run("DELETE FROM position_legs WHERE position_id = ?", position.id);
      for (const leg of position.legs ?? []) {
        run(
          `INSERT INTO position_legs (position_id, mint, symbol, target_bps, current_amount,
                                      current_value_usd, last_known_amount, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          position.id,
          leg.mint,
          leg.symbol ?? "",
          leg.targetBps,
          leg.currentAmount,
          leg.currentValueUsd,
          String(leg.currentAmount),
          position.updatedAt
        );
      }
    });
    return position;
  }

  // target/last-known leg upsert used by the landing worker after confirmation.
  upsertPositionLeg(
    positionId: string,
    mint: string,
    targetBps: number,
    lastKnownAmount: number | string
  ): void {
    const amountNum = Number(lastKnownAmount);
    run(
      `INSERT INTO position_legs (position_id, mint, symbol, target_bps, current_amount,
                                  current_value_usd, last_known_amount, updated_at)
       VALUES (?, ?, '', ?, ?, 0, ?, ?)
       ON CONFLICT(position_id, mint) DO UPDATE SET
         target_bps = excluded.target_bps,
         current_amount = excluded.current_amount,
         last_known_amount = excluded.last_known_amount,
         updated_at = excluded.updated_at`,
      positionId,
      mint,
      targetBps,
      Number.isFinite(amountNum) ? amountNum : 0,
      String(lastKnownAmount),
      nowIso()
    );
  }

  // ================= Nonces (SIWS) =================
  createNonce(walletAddress: string, nonce: string, expiresAtMs: number): void {
    run(
      `INSERT INTO nonces (wallet_address, nonce, expires_at_ms, used, created_at)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(wallet_address, nonce) DO UPDATE SET
         expires_at_ms = excluded.expires_at_ms,
         used = 0`,
      walletAddress,
      nonce,
      expiresAtMs,
      nowIso()
    );
  }

  // Single-use consumption: returns true only if the nonce existed, was unused
  // and unexpired. The conditional UPDATE makes this race-free.
  consumeNonce(walletAddress: string, nonce: string): boolean {
    const changes = run(
      "UPDATE nonces SET used = 1 WHERE wallet_address = ? AND nonce = ? AND used = 0 AND expires_at_ms > ?",
      walletAddress,
      nonce,
      Date.now()
    );
    return changes === 1;
  }

  getNonce(walletAddress: string, nonce: string): NonceRow | undefined {
    const row = one<Row>(
      "SELECT * FROM nonces WHERE wallet_address = ? AND nonce = ?",
      walletAddress,
      nonce
    );
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
  saveRefreshToken(id: string, userId: string, tokenHash: string, expiresAtMs: number): void {
    run(
      `INSERT OR REPLACE INTO refresh_tokens (id, user_id, token_hash, expires_at_ms, revoked, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
      id,
      userId,
      tokenHash,
      expiresAtMs,
      nowIso()
    );
  }

  getRefreshToken(tokenHash: string): { userId: string; id: string; expiresAtMs: number } | null {
    const row = one<Row>("SELECT * FROM refresh_tokens WHERE token_hash = ?", tokenHash);
    if (!row) return null;
    if (bool(row.revoked)) return null;
    if (num(row.expires_at_ms) <= Date.now()) return null;
    return {
      userId: str(row.user_id),
      id: str(row.id),
      expiresAtMs: num(row.expires_at_ms),
    };
  }

  revokeRefreshToken(tokenHash: string): void {
    run("UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?", tokenHash);
  }

  // ================= Settings (kill switch etc.) =================
  getSetting(key: string): string | null {
    const row = one<Row>("SELECT value FROM settings WHERE key = ?", key);
    return row && row.value !== null && row.value !== undefined ? str(row.value) : null;
  }

  setSetting(key: string, value: string): void {
    run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key,
      value,
      nowIso()
    );
  }

  getSettings(): SettingRow[] {
    return all<Row>("SELECT * FROM settings ORDER BY key ASC").map((r) => ({
      key: str(r.key),
      value: str(r.value),
      updatedAt: str(r.updated_at),
    }));
  }

  // ================= Price snapshots =================
  addSnapshot(mint: string, tsIso: string, priceUsd: number, source: string): void {
    run(
      "INSERT INTO price_snapshots (mint, ts, price_usd, source) VALUES (?, ?, ?, ?)",
      mint,
      tsIso,
      priceUsd,
      source
    );
  }

  getSnapshots(mint: string, fromIso: string, toIso: string): { ts: string; priceUsd: number }[] {
    return all<Row>(
      "SELECT ts, price_usd FROM price_snapshots WHERE mint = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC, id ASC",
      mint,
      fromIso,
      toIso
    ).map((r) => ({ ts: str(r.ts), priceUsd: num(r.price_usd) }));
  }

  latestPrice(mint: string): { priceUsd: number; ts: string } | null {
    const row = one<Row>(
      "SELECT ts, price_usd FROM price_snapshots WHERE mint = ? ORDER BY ts DESC, id DESC LIMIT 1",
      mint
    );
    if (!row) return null;
    return { priceUsd: num(row.price_usd), ts: str(row.ts) };
  }

  getSnapshotsRaw(mint: string, fromIso?: string, toIso?: string): SnapshotRow[] {
    return all<Row>(
      `SELECT * FROM price_snapshots
       WHERE mint = ?
         AND (? IS NULL OR ts >= ?)
         AND (? IS NULL OR ts <= ?)
       ORDER BY ts ASC, id ASC`,
      mint,
      fromIso ?? null,
      fromIso ?? null,
      toIso ?? null,
      toIso ?? null
    ).map((r) => ({
      id: num(r.id),
      mint: str(r.mint),
      ts: str(r.ts),
      priceUsd: num(r.price_usd),
      source: str(r.source, "mock"),
    }));
  }

  // ================= Fee ledger =================
  addFee(executionId: string, amountUsdc: number, tsIso: string): void {
    run(
      "INSERT INTO fee_ledger (id, execution_id, amount_usdc, token, ts) VALUES (?, ?, ?, 'USDC', ?)",
      "fee-" + randomUUID(),
      executionId,
      amountUsdc,
      tsIso
    );
  }

  listFees(): FeeRow[] {
    return all<Row>("SELECT * FROM fee_ledger ORDER BY ts ASC, rowid ASC").map((r) => ({
      id: str(r.id),
      executionId: str(r.execution_id),
      amountUsdc: num(r.amount_usdc),
      token: str(r.token, "USDC"),
      ts: str(r.ts),
    }));
  }

  // ================= Outbox =================
  enqueueOutbox(event: string, payload: unknown): void {
    run(
      "INSERT INTO outbox (id, event, payload, created_at, sent_at) VALUES (?, ?, ?, ?, NULL)",
      "outbox-" + randomUUID(),
      event,
      jsonStr(payload, "{}"),
      nowIso()
    );
  }

  // At-least-once delivery: returns unsent rows; caller must markOutboxSent(id).
  claimOutbox(limit: number): { id: string; event: string; payload: any }[] {
    return all<Row>(
      "SELECT id, event, payload FROM outbox WHERE sent_at IS NULL ORDER BY rowid ASC LIMIT ?",
      limit
    ).map((r) => {
      const raw = r.payload === null || r.payload === undefined ? null : str(r.payload);
      let payload: any = raw;
      if (raw !== null) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = raw;
        }
      }
      return { id: str(r.id), event: str(r.event), payload };
    });
  }

  markOutboxSent(id: string): void {
    run("UPDATE outbox SET sent_at = ? WHERE id = ?", nowIso(), id);
  }

  // ================= Jobs (landing queue) =================
  enqueueJob(
    executionId: string,
    legId: string,
    kind: string,
    payloadJson: string | object | null,
    runAtMs: number
  ): void {
    run(
      `INSERT INTO jobs (id, execution_id, leg_id, kind, payload, status, attempts, run_at_ms, created_at)
       VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?)`,
      "job-" + randomUUID(),
      executionId,
      legId,
      kind,
      jsonStr(payloadJson, "{}"),
      runAtMs,
      nowIso()
    );
  }

  // Crash-safe claim: a single conditional UPDATE flips queued -> running with a
  // per-call claim token; the claimed rows are then read back by that token. If
  // the process dies mid-claim, rows stay 'running' and can be recovered via
  // requeueJob (or a sweeper requeueing stale 'running' rows).
  claimJobs(limit: number, nowMs: number): JobRow[] {
    const claimToken = randomUUID();
    run(
      `UPDATE jobs SET status = 'running', attempts = attempts + 1, claimed_at = ?
       WHERE id IN (
         SELECT id FROM jobs
         WHERE status = 'queued' AND run_at_ms <= ?
         ORDER BY run_at_ms ASC, rowid ASC
         LIMIT ?
       )`,
      claimToken,
      nowMs,
      limit
    );
    return all<Row>(
      "SELECT * FROM jobs WHERE claimed_at = ? AND status = 'running' ORDER BY run_at_ms ASC, rowid ASC",
      claimToken
    ).map(mapJob);
  }

  finishJob(id: string, ok: boolean, error?: string): void {
    run(
      "UPDATE jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?",
      ok ? "done" : "failed",
      error ?? null,
      nowIso(),
      id
    );
  }

  requeueJob(id: string, runAtMs: number): void {
    run(
      "UPDATE jobs SET status = 'queued', run_at_ms = ?, claimed_at = NULL WHERE id = ?",
      runAtMs,
      id
    );
  }

  getJob(id: string): JobRow | undefined {
    const row = one<Row>("SELECT * FROM jobs WHERE id = ?", id);
    return row ? mapJob(row) : undefined;
  }

  // ================= Rebalance events =================
  addRebalanceEvent(
    positionId: string,
    fromVersion: string,
    toVersion: string,
    status: string
  ): void {
    run(
      "INSERT INTO rebalance_events (id, position_id, from_version, to_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      "rbe-" + randomUUID(),
      positionId,
      fromVersion,
      toVersion,
      status,
      nowIso()
    );
  }

  listRebalanceEvents(positionId: string): RebalanceEventRow[] {
    return all<Row>(
      "SELECT * FROM rebalance_events WHERE position_id = ? ORDER BY created_at DESC, rowid DESC",
      positionId
    ).map((r) => ({
      id: str(r.id),
      positionId: str(r.position_id),
      fromVersion: str(r.from_version),
      toVersion: str(r.to_version),
      status: str(r.status, "PENDING"),
      createdAt: str(r.created_at),
    }));
  }

  // ================= Audit log =================
  logAudit(log: Omit<AuditLog, "id" | "timestamp">): AuditLog {
    const entry: AuditLog = {
      ...log,
      id: "audit-" + randomUUID(),
      timestamp: nowIso(),
    };
    run(
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
    );
    return entry;
  }

  getAuditLogs(): AuditLog[] {
    return all<Row>("SELECT * FROM audit_log ORDER BY rowid ASC").map(mapAudit);
  }
}

export const repository = new Repository();
