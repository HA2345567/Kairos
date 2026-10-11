import type { DatabaseSync } from "node:sqlite";

// Idempotent DDL for every PRD §5 table plus nonces, refresh_tokens, settings,
// jobs, outbox. All statements are CREATE ... IF NOT EXISTS so this is safe to
// run on every boot. SQLite is typed loosely (TEXT/REAL/INTEGER) so a later
// Postgres swap only touches db/sqlite.ts.
//
// Key constraints (per PRD §5 / contracts.md):
//  - executions: UNIQUE (wallet_id, idempotency_key)
//  - basket_legs: CHECK (weight_bps BETWEEN 0 AND 10000)
//  - indexes: positions(wallet_address), executions(status),
//             price_snapshots(mint, ts), jobs(run_at_ms, status)
const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'siws',
  created_at    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  region        TEXT NOT NULL DEFAULT 'unknown'
);

CREATE TABLE IF NOT EXISTS wallets (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  address           TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'external',
  delegated_signing INTEGER NOT NULL DEFAULT 0,
  policy_json       TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_address ON wallets(address);

CREATE TABLE IF NOT EXISTS tokens (
  mint                       TEXT PRIMARY KEY,
  symbol                     TEXT NOT NULL,
  name                       TEXT NOT NULL DEFAULT '',
  decimals                   INTEGER NOT NULL DEFAULT 6,
  type                       TEXT NOT NULL DEFAULT 'spl',
  trading_status             TEXT NOT NULL DEFAULT 'active',
  is_market_hours_restricted INTEGER,
  denylisted                 INTEGER NOT NULL DEFAULT 0,
  price_usd                  REAL NOT NULL DEFAULT 0,
  updated_at                 TEXT
);

CREATE TABLE IF NOT EXISTS baskets (
  id                TEXT PRIMARY KEY,
  slug              TEXT NOT NULL,
  name              TEXT NOT NULL,
  thesis            TEXT NOT NULL DEFAULT '',
  category          TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'active',
  active_version_id TEXT NOT NULL DEFAULT '',
  min_usdc          REAL NOT NULL DEFAULT 25,
  performance_json  TEXT NOT NULL DEFAULT '{}',
  protocols_json    TEXT NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_baskets_slug ON baskets(slug);

CREATE TABLE IF NOT EXISTS basket_versions (
  id           TEXT PRIMARY KEY,
  basket_id    TEXT NOT NULL,
  version      INTEGER NOT NULL,
  changelog    TEXT NOT NULL DEFAULT '',
  published_by TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  UNIQUE (basket_id, version)
);

CREATE TABLE IF NOT EXISTS basket_legs (
  id           TEXT NOT NULL,
  version_id   TEXT NOT NULL REFERENCES basket_versions(id) ON DELETE CASCADE,
  mint         TEXT NOT NULL,
  weight_bps   INTEGER NOT NULL CHECK (weight_bps >= 0 AND weight_bps <= 10000),
  leg_type     TEXT NOT NULL DEFAULT 'spl',
  venue_hint   TEXT,
  slippage_bps INTEGER,
  PRIMARY KEY (version_id, id)
);

CREATE TABLE IF NOT EXISTS quotes (
  id                TEXT PRIMARY KEY,
  basket_id         TEXT NOT NULL,
  basket_version_id TEXT NOT NULL,
  usdc_amount       REAL NOT NULL,
  legs_json         TEXT NOT NULL DEFAULT '[]',
  platform_fee_usdc REAL NOT NULL DEFAULT 0,
  net_invest_usdc   REAL NOT NULL DEFAULT 0,
  expires_at        TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS executions (
  id                   TEXT PRIMARY KEY,
  wallet_id            TEXT NOT NULL,
  wallet_address       TEXT NOT NULL,
  basket_id            TEXT NOT NULL,
  basket_version_id    TEXT NOT NULL,
  type                 TEXT NOT NULL CHECK (type IN ('open', 'rebalance', 'close')),
  status               TEXT NOT NULL,
  idempotency_key      TEXT NOT NULL,
  total_usdc           REAL NOT NULL DEFAULT 0,
  fee_usdc             REAL NOT NULL DEFAULT 0,
  prepared_txs_json    TEXT NOT NULL DEFAULT '[]',
  message_hashes_json  TEXT NOT NULL DEFAULT '[]',
  blockhash            TEXT,
  last_valid_block_height INTEGER,
  expires_at           TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  UNIQUE (wallet_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_idempotency ON executions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_executions_wallet_created ON executions(wallet_address, created_at DESC);

CREATE TABLE IF NOT EXISTS execution_legs (
  id             TEXT NOT NULL,
  execution_id   TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  mint           TEXT NOT NULL,
  symbol         TEXT NOT NULL DEFAULT '',
  in_amount_usdc REAL NOT NULL DEFAULT 0,
  expected_out   TEXT NOT NULL DEFAULT '0',
  actual_out     TEXT,
  tx_signature   TEXT,
  message_hash   TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'PENDING',
  error          TEXT,
  PRIMARY KEY (execution_id, id)
);

CREATE TABLE IF NOT EXISTS positions (
  id                TEXT PRIMARY KEY,
  wallet_address    TEXT NOT NULL,
  wallet_id         TEXT,
  basket_id         TEXT NOT NULL,
  basket_version_id TEXT NOT NULL,
  entry_usdc        REAL NOT NULL DEFAULT 0,
  current_value_usd REAL NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'ACTIVE',
  auto_rebalance    INTEGER NOT NULL DEFAULT 0,
  drift_pct         REAL NOT NULL DEFAULT 0,
  rebalance_available INTEGER NOT NULL DEFAULT 1,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_positions_wallet ON positions(wallet_address);

CREATE TABLE IF NOT EXISTS position_legs (
  position_id       TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  mint              TEXT NOT NULL,
  symbol            TEXT NOT NULL DEFAULT '',
  target_bps        INTEGER NOT NULL DEFAULT 0 CHECK (target_bps >= 0 AND target_bps <= 10000),
  current_amount    REAL NOT NULL DEFAULT 0,
  current_value_usd REAL NOT NULL DEFAULT 0,
  last_known_amount TEXT,
  updated_at        TEXT,
  PRIMARY KEY (position_id, mint)
);

CREATE TABLE IF NOT EXISTS nonces (
  wallet_address TEXT NOT NULL,
  nonce          TEXT NOT NULL,
  expires_at_ms  INTEGER NOT NULL,
  used           INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  PRIMARY KEY (wallet_address, nonce)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at_ms INTEGER NOT NULL,
  revoked       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  leg_id       TEXT,
  kind         TEXT NOT NULL,
  payload      TEXT,
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  run_at_ms    INTEGER NOT NULL,
  error        TEXT,
  claimed_at   TEXT,
  finished_at  TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_run_at_status ON jobs(run_at_ms, status);
CREATE INDEX IF NOT EXISTS idx_jobs_execution ON jobs(execution_id);

CREATE TABLE IF NOT EXISTS outbox (
  id         TEXT PRIMARY KEY,
  event      TEXT NOT NULL,
  payload    TEXT,
  created_at TEXT NOT NULL,
  sent_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_sent ON outbox(sent_at);

CREATE TABLE IF NOT EXISTS fee_ledger (
  id           TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  amount_usdc  REAL NOT NULL,
  token        TEXT NOT NULL DEFAULT 'USDC',
  ts           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fee_ledger_execution ON fee_ledger(execution_id);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  mint      TEXT NOT NULL,
  ts        TEXT NOT NULL,
  price_usd REAL NOT NULL,
  source    TEXT NOT NULL DEFAULT 'mock'
);
CREATE INDEX IF NOT EXISTS idx_price_snapshots_mint_ts ON price_snapshots(mint, ts);

CREATE TABLE IF NOT EXISTS rebalance_events (
  id          TEXT PRIMARY KEY,
  position_id TEXT NOT NULL,
  from_version TEXT,
  to_version  TEXT,
  status      TEXT NOT NULL DEFAULT 'PENDING',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rebalance_events_position ON rebalance_events(position_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  actor       TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL DEFAULT '',
  entity_id   TEXT NOT NULL DEFAULT '',
  before_json TEXT,
  after_json  TEXT,
  timestamp   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
`;

export function applyMigrations(db: DatabaseSync): void {
  db.exec(DDL);
}
