// PostgreSQL schema. Versioned additions must use idempotent ALTER statements.
export const DDL = `
CREATE TABLE IF NOT EXISTS users (
  rowid BIGSERIAL UNIQUE,
  id            TEXT PRIMARY KEY,
  email         TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'siws',
  created_at    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  region        TEXT NOT NULL DEFAULT 'unknown'
);

CREATE TABLE IF NOT EXISTS wallets (
  rowid BIGSERIAL UNIQUE,
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  address           TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'external',
  delegated_signing INTEGER NOT NULL DEFAULT 0,
  policy_json       TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_address ON wallets(address);

CREATE TABLE IF NOT EXISTS tokens (
  rowid BIGSERIAL UNIQUE,
  mint                       TEXT PRIMARY KEY,
  symbol                     TEXT NOT NULL,
  name                       TEXT NOT NULL DEFAULT '',
  decimals                   INTEGER NOT NULL DEFAULT 6,
  type                       TEXT NOT NULL DEFAULT 'spl',
  trading_status             TEXT NOT NULL DEFAULT 'active',
  is_market_hours_restricted INTEGER,
  denylisted                 INTEGER NOT NULL DEFAULT 0,
  price_usd                  DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at                 TEXT
);

CREATE TABLE IF NOT EXISTS program_allowlist (
  program_id TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  version    TEXT,
  added_at   TEXT NOT NULL
);
INSERT INTO program_allowlist (program_id, name, version, added_at) VALUES
  ('11111111111111111111111111111111', 'System Program', 'native', CURRENT_TIMESTAMP),
  ('ComputeBudget111111111111111111111111111111', 'Compute Budget Program', 'native', CURRENT_TIMESTAMP),
  ('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', 'Associated Token Program', 'spl', CURRENT_TIMESTAMP),
  ('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'SPL Token Program', 'spl', CURRENT_TIMESTAMP),
  ('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', 'SPL Memo Program', 'v2', CURRENT_TIMESTAMP),
  ('3jWJZPdDou1h8UrT871Qi573yqQkFYYW8Jqiug9Pne5w', 'Kairos Router', 'devnet', CURRENT_TIMESTAMP),
  ('DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb', 'Raydium CPMM', 'devnet', CURRENT_TIMESTAMP)
ON CONFLICT (program_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS baskets (
  rowid BIGSERIAL UNIQUE,
  id                TEXT PRIMARY KEY,
  slug              TEXT NOT NULL,
  name              TEXT NOT NULL,
  thesis            TEXT NOT NULL DEFAULT '',
  category          TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'active',
  active_version_id TEXT NOT NULL DEFAULT '',
  min_usdc          DOUBLE PRECISION NOT NULL DEFAULT 25,
  performance_json  TEXT NOT NULL DEFAULT '{}',
  protocols_json    TEXT NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_baskets_slug ON baskets(slug);

CREATE TABLE IF NOT EXISTS basket_versions (
  rowid BIGSERIAL UNIQUE,
  id           TEXT PRIMARY KEY,
  basket_id    TEXT NOT NULL,
  version      INTEGER NOT NULL,
  changelog    TEXT NOT NULL DEFAULT '',
  published_by TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  legs_hash    TEXT,
  registry_tx  TEXT,
  UNIQUE (basket_id, version)
);

CREATE TABLE IF NOT EXISTS basket_legs (
  rowid BIGSERIAL UNIQUE,
  id           TEXT NOT NULL,
  version_id   TEXT NOT NULL REFERENCES basket_versions(id) ON DELETE CASCADE,
  mint         TEXT NOT NULL,
  weight_bps   INTEGER NOT NULL CHECK (weight_bps >= 0 AND weight_bps <= 10000),
  leg_type     TEXT NOT NULL DEFAULT 'spl',
  venue_hint   TEXT,
  slippage_bps INTEGER,
  PRIMARY KEY (version_id, id)
);
ALTER TABLE basket_legs DROP CONSTRAINT IF EXISTS basket_legs_weight_bps_check;
ALTER TABLE basket_legs ADD CONSTRAINT basket_legs_weight_bps_check
  CHECK (weight_bps > 0 AND weight_bps <= 10000);
CREATE UNIQUE INDEX IF NOT EXISTS idx_basket_legs_version_mint
  ON basket_legs(version_id, mint);

-- Published versions are append-only. The service already validates versions;
-- these triggers protect the invariant when another writer bypasses it.
CREATE OR REPLACE FUNCTION kairos_reject_published_version_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PUBLISHED_BASKET_VERSION_IMMUTABLE';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS basket_versions_append_only ON basket_versions;
CREATE TRIGGER basket_versions_append_only
  BEFORE UPDATE OR DELETE ON basket_versions
  FOR EACH ROW EXECUTE FUNCTION kairos_reject_published_version_mutation();

DROP TRIGGER IF EXISTS basket_legs_append_only ON basket_legs;
CREATE TRIGGER basket_legs_append_only
  BEFORE UPDATE OR DELETE ON basket_legs
  FOR EACH ROW EXECUTE FUNCTION kairos_reject_published_version_mutation();

CREATE OR REPLACE FUNCTION kairos_validate_basket_version_weights()
RETURNS trigger AS $$
DECLARE
  version_id_value TEXT;
  leg_count_value INTEGER;
  weight_sum_value INTEGER;
BEGIN
  version_id_value := COALESCE(NEW.version_id, OLD.version_id);
  SELECT COUNT(*), COALESCE(SUM(weight_bps), 0)
    INTO leg_count_value, weight_sum_value
    FROM basket_legs
   WHERE version_id = version_id_value;
  IF leg_count_value < 1 OR weight_sum_value <> 10000 THEN
    RAISE EXCEPTION 'BASKET_VERSION_WEIGHTS_INVALID:%:%', version_id_value, weight_sum_value;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS basket_legs_weight_sum ON basket_legs;
CREATE CONSTRAINT TRIGGER basket_legs_weight_sum
  AFTER INSERT OR UPDATE OR DELETE ON basket_legs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION kairos_validate_basket_version_weights();

CREATE TABLE IF NOT EXISTS basket_publish_proposals (
  rowid BIGSERIAL UNIQUE,
  id                TEXT PRIMARY KEY,
  basket_slug       TEXT NOT NULL,
  proposed_by       TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  version_data_json TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  approved_by       TEXT,
  approved_at       TEXT,
  approval_note     TEXT
);
CREATE INDEX IF NOT EXISTS idx_publish_proposals_status_created
  ON basket_publish_proposals(status, created_at);

CREATE TABLE IF NOT EXISTS quotes (
  rowid BIGSERIAL UNIQUE,
  id                TEXT PRIMARY KEY,
  basket_id         TEXT NOT NULL,
  basket_version_id TEXT NOT NULL,
  usdc_amount       DOUBLE PRECISION NOT NULL,
  legs_json         TEXT NOT NULL DEFAULT '[]',
  platform_fee_usdc DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_invest_usdc   DOUBLE PRECISION NOT NULL DEFAULT 0,
  expires_at        TEXT NOT NULL,
  created_at        TEXT NOT NULL
);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS usdc_base_units BIGINT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS platform_fee_base_units BIGINT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS net_invest_base_units BIGINT;

CREATE TABLE IF NOT EXISTS executions (
  rowid BIGSERIAL UNIQUE,
  id                   TEXT PRIMARY KEY,
  wallet_id            TEXT NOT NULL,
  wallet_address       TEXT NOT NULL,
  basket_id            TEXT NOT NULL,
  basket_version_id    TEXT NOT NULL,
  type                 TEXT NOT NULL CHECK (type IN ('open', 'rebalance', 'close')),
  funding_asset        TEXT NOT NULL DEFAULT 'USDC',
  sol_input_amount     DOUBLE PRECISION,
  sol_price_usd        DOUBLE PRECISION,
  status               TEXT NOT NULL,
  idempotency_key      TEXT NOT NULL,
  request_hash         TEXT,
  total_usdc           DOUBLE PRECISION NOT NULL DEFAULT 0,
  fee_usdc             DOUBLE PRECISION NOT NULL DEFAULT 0,
  prepared_txs_json    TEXT NOT NULL DEFAULT '[]',
  message_hashes_json  TEXT NOT NULL DEFAULT '[]',
  blockhash            TEXT,
  last_valid_block_height INTEGER,
  expires_at           TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  UNIQUE (wallet_id, idempotency_key)
);
ALTER TABLE executions ADD COLUMN IF NOT EXISTS request_hash TEXT;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS total_usdc_base_units BIGINT;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS fee_usdc_base_units BIGINT;
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_idempotency ON executions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_executions_request_hash ON executions(request_hash);
CREATE INDEX IF NOT EXISTS idx_executions_wallet_created ON executions(wallet_address, created_at DESC);
ALTER TABLE executions ADD COLUMN IF NOT EXISTS base_execution_id TEXT REFERENCES executions(id);
ALTER TABLE executions ADD COLUMN IF NOT EXISTS recovery_action TEXT CHECK (recovery_action IN ('retry', 'unwind'));
ALTER TABLE executions ADD COLUMN IF NOT EXISTS funding_asset TEXT NOT NULL DEFAULT 'USDC';
ALTER TABLE executions ADD COLUMN IF NOT EXISTS sol_input_amount DOUBLE PRECISION;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS sol_price_usd DOUBLE PRECISION;
CREATE TABLE IF NOT EXISTS execution_recoveries (
  base_execution_id TEXT NOT NULL REFERENCES executions(id),
  action TEXT NOT NULL CHECK (action IN ('retry', 'unwind')),
  execution_id TEXT NOT NULL REFERENCES executions(id),
  PRIMARY KEY (base_execution_id, action)
);

CREATE TABLE IF NOT EXISTS execution_legs (
  rowid BIGSERIAL UNIQUE,
  id             TEXT NOT NULL,
  execution_id   TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  mint           TEXT NOT NULL,
  symbol         TEXT NOT NULL DEFAULT '',
  in_amount_usdc DOUBLE PRECISION NOT NULL DEFAULT 0,
  fee_usdc       DOUBLE PRECISION NOT NULL DEFAULT 0,
  expected_out   TEXT NOT NULL DEFAULT '0',
  actual_out     TEXT,
  tx_signature   TEXT,
  message_hash   TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'PENDING',
  error          TEXT,
  PRIMARY KEY (execution_id, id)
);
ALTER TABLE execution_legs ADD COLUMN IF NOT EXISTS fee_usdc DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE execution_legs ADD COLUMN IF NOT EXISTS side TEXT CHECK (side IN ('buy', 'sell'));
ALTER TABLE execution_legs ADD COLUMN IF NOT EXISTS receipt_json TEXT;
ALTER TABLE execution_legs ADD COLUMN IF NOT EXISTS input_base_units TEXT;
ALTER TABLE execution_legs ADD COLUMN IF NOT EXISTS in_usdc_base_units BIGINT;
ALTER TABLE execution_legs ADD COLUMN IF NOT EXISTS fee_base_units BIGINT;

CREATE TABLE IF NOT EXISTS positions (
  rowid BIGSERIAL UNIQUE,
  id                TEXT PRIMARY KEY,
  wallet_address    TEXT NOT NULL,
  wallet_id         TEXT,
  basket_id         TEXT NOT NULL,
  basket_version_id TEXT NOT NULL,
  entry_usdc        DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_value_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'ACTIVE',
  rebalance_state   TEXT NOT NULL DEFAULT 'NONE',
  auto_rebalance    INTEGER NOT NULL DEFAULT 0,
  drift_pct         DOUBLE PRECISION NOT NULL DEFAULT 0,
  rebalance_available INTEGER NOT NULL DEFAULT 1,
  updated_at        TEXT NOT NULL
);
ALTER TABLE positions ADD COLUMN IF NOT EXISTS rebalance_state TEXT NOT NULL DEFAULT 'NONE';
CREATE INDEX IF NOT EXISTS idx_positions_wallet ON positions(wallet_address);

CREATE TABLE IF NOT EXISTS position_legs (
  rowid BIGSERIAL UNIQUE,
  position_id       TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  mint              TEXT NOT NULL,
  symbol            TEXT NOT NULL DEFAULT '',
  target_bps        INTEGER NOT NULL DEFAULT 0 CHECK (target_bps >= 0 AND target_bps <= 10000),
  current_amount    DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_value_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_known_amount TEXT,
  last_known_at     TEXT,
  last_known_commitment TEXT,
  last_observation_source TEXT,
  updated_at        TEXT,
  PRIMARY KEY (position_id, mint)
);
ALTER TABLE position_legs ADD COLUMN IF NOT EXISTS last_known_at TEXT;
ALTER TABLE position_legs ADD COLUMN IF NOT EXISTS last_known_commitment TEXT;
ALTER TABLE position_legs ADD COLUMN IF NOT EXISTS last_observation_source TEXT;

CREATE TABLE IF NOT EXISTS nonces (
  rowid BIGSERIAL UNIQUE,
  wallet_address TEXT NOT NULL,
  nonce          TEXT NOT NULL,
  expires_at_ms  BIGINT NOT NULL,
  used           INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  PRIMARY KEY (wallet_address, nonce)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  rowid BIGSERIAL UNIQUE,
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at_ms BIGINT NOT NULL,
  revoked       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS settings (
  rowid BIGSERIAL UNIQUE,
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  rowid BIGSERIAL UNIQUE,
  id           TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  leg_id       TEXT,
  kind         TEXT NOT NULL,
  payload      TEXT,
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  run_at_ms    BIGINT NOT NULL,
  error        TEXT,
  claimed_at   TEXT,
  lease_until_ms BIGINT NOT NULL DEFAULT 0,
  finished_at  TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_run_at_status ON jobs(run_at_ms, status);
CREATE INDEX IF NOT EXISTS idx_jobs_execution ON jobs(execution_id);

CREATE TABLE IF NOT EXISTS outbox (
  rowid BIGSERIAL UNIQUE,
  id         TEXT PRIMARY KEY,
  event      TEXT NOT NULL,
  event_type TEXT,
  execution_id TEXT,
  leg_id     TEXT,
  payload    TEXT,
  created_at TEXT NOT NULL,
  sent_at    TEXT,
  dedupe_key TEXT UNIQUE,
  attempts   INTEGER NOT NULL DEFAULT 0,
  lease_until_ms BIGINT NOT NULL DEFAULT 0,
  lease_token TEXT
);
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS execution_id TEXT;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS leg_id TEXT;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS lease_until_ms BIGINT NOT NULL DEFAULT 0;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS lease_token TEXT;
UPDATE outbox SET event_type = event WHERE event_type IS NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_sent ON outbox(sent_at);
CREATE INDEX IF NOT EXISTS idx_outbox_pending_lease ON outbox(sent_at, lease_until_ms);
DROP INDEX IF EXISTS idx_outbox_execution_event;
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_execution_event
  ON outbox(execution_id, event_type)
  WHERE execution_id IS NOT NULL AND leg_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_execution_event_leg
  ON outbox(execution_id, event_type, leg_id)
  WHERE execution_id IS NOT NULL AND leg_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS fee_ledger (
  rowid BIGSERIAL UNIQUE,
  id           TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  leg_id       TEXT,
  amount_usdc  DOUBLE PRECISION NOT NULL,
  token        TEXT NOT NULL DEFAULT 'USDC',
  ts           TEXT NOT NULL
);
ALTER TABLE fee_ledger ADD COLUMN IF NOT EXISTS leg_id TEXT;
ALTER TABLE fee_ledger ADD COLUMN IF NOT EXISTS amount_base_units BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_ledger_execution_leg ON fee_ledger(execution_id, leg_id);
CREATE INDEX IF NOT EXISTS idx_fee_ledger_execution ON fee_ledger(execution_id);

CREATE TABLE IF NOT EXISTS price_snapshots (
  rowid BIGSERIAL UNIQUE,
  id          BIGSERIAL PRIMARY KEY,
  mint        TEXT NOT NULL,
  ts          TEXT NOT NULL,
  price_usd   DOUBLE PRECISION NOT NULL,
  source      TEXT NOT NULL DEFAULT 'mock',
  source_ref  TEXT,
  confidence  DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_price_snapshots_mint_ts ON price_snapshots(mint, ts);

-- Public market-history responses are safe to cache across API restarts. The
-- composition hash prevents a prior allocation from being shown for a new one.
CREATE TABLE IF NOT EXISTS basket_market_nav_history_cache (
  cache_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_basket_market_nav_history_updated
  ON basket_market_nav_history_cache(updated_at);

-- Shared public-market references survive serverless cold starts. They never
-- enter the oracle snapshot table used for execution quotes or NAV.
CREATE TABLE IF NOT EXISTS market_reference_price_cache (
  market_mint TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

-- Public OHLCV references are shared across short-lived API instances. These
-- display-only candles never enter the oracle or execution price tables.
CREATE TABLE IF NOT EXISTS basket_market_data_cache (
  cache_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS market_reference_candle_cache (
  market_mint TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('hour', 'day')),
  pool_address TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (market_mint, timeframe)
);

CREATE TABLE IF NOT EXISTS rebalance_events (
  rowid BIGSERIAL UNIQUE,
  id          TEXT PRIMARY KEY,
  position_id TEXT NOT NULL,
  from_version TEXT,
  to_version  TEXT,
  status      TEXT NOT NULL DEFAULT 'PENDING',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rebalance_events_position ON rebalance_events(position_id);

CREATE TABLE IF NOT EXISTS audit_log (
  rowid BIGSERIAL UNIQUE,
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

-- ============ PRD v4.0 completion (Slice F) ============

-- FR-04 / §13.1: eligibility + age gate state (region lives on users).
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS eligibility_status TEXT NOT NULL DEFAULT 'eligible';

-- FR-03: registry liquidity evidence + backtestability.
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS backtestable INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS liquidity_usd DOUBLE PRECISION;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS liquidity_source TEXT;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS liquidity_checked_at TEXT;

-- FR-18: notification preferences per wallet (channels + event classes).
CREATE TABLE IF NOT EXISTS notification_preferences (
  wallet_address     TEXT PRIMARY KEY,
  in_app             INTEGER NOT NULL DEFAULT 1,
  email              INTEGER NOT NULL DEFAULT 0,
  push               INTEGER NOT NULL DEFAULT 0,
  execution_updates  INTEGER NOT NULL DEFAULT 1,
  rebalance_updates  INTEGER NOT NULL DEFAULT 1,
  version_publish    INTEGER NOT NULL DEFAULT 1,
  updated_at         TEXT NOT NULL
);

-- FR-27: annotation layer (news/events) + checkpoints, incentives and
-- liquidation info from the §19 glossary, all attachable to a basket version.
CREATE TABLE IF NOT EXISTS annotations (
  rowid       BIGSERIAL UNIQUE,
  id          TEXT PRIMARY KEY,
  basket_id   TEXT NOT NULL REFERENCES baskets(id),
  version_id  TEXT REFERENCES basket_versions(id),
  kind        TEXT NOT NULL DEFAULT 'news',
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  source_url  TEXT,
  source      TEXT,
  impact      TEXT,
  published_at TEXT NOT NULL,
  created_by  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_annotations_basket ON annotations(basket_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_annotations_version ON annotations(version_id);

-- FR-25: durable Labs basket creation, moderation and community voting.
CREATE TABLE IF NOT EXISTS labs_baskets (
  rowid            BIGSERIAL UNIQUE,
  id               TEXT PRIMARY KEY,
  slug             TEXT NOT NULL,
  name             TEXT NOT NULL,
  thesis           TEXT NOT NULL DEFAULT '',
  category         TEXT NOT NULL DEFAULT 'Labs',
  cover_image_data_url TEXT,
  allocations_json TEXT NOT NULL,
  created_by       TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft',
  moderation_note  TEXT,
  basket_id        TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
ALTER TABLE labs_baskets ADD COLUMN IF NOT EXISTS cover_image_data_url TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_labs_baskets_slug ON labs_baskets(slug);
CREATE INDEX IF NOT EXISTS idx_labs_baskets_status ON labs_baskets(status, created_at DESC);

CREATE TABLE IF NOT EXISTS labs_votes (
  rowid          BIGSERIAL UNIQUE,
  id             TEXT PRIMARY KEY,
  labs_basket_id TEXT NOT NULL REFERENCES labs_baskets(id),
  wallet_address TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_labs_votes_unique ON labs_votes(labs_basket_id, wallet_address);

CREATE TABLE IF NOT EXISTS labs_comments (
  rowid          BIGSERIAL UNIQUE,
  id             TEXT PRIMARY KEY,
  labs_basket_id TEXT NOT NULL REFERENCES labs_baskets(id),
  wallet_address TEXT NOT NULL,
  body           TEXT NOT NULL,
  hidden         INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_labs_comments_basket ON labs_comments(labs_basket_id, created_at ASC);

-- FE-09 / NFR-12: anonymized page-view analytics (no IP, no PII).
CREATE TABLE IF NOT EXISTS analytics_events (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  path         TEXT NOT NULL,
  region       TEXT,
  session_hash TEXT NOT NULL,
  ts           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_ts ON analytics_events(ts);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(name, ts);
`;
