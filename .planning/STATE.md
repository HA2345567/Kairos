---
gsd_state_version: "1.0"
milestone: v1.0
milestone_name: Devnet product aligned to PRD v4.0
status: in_progress
stopped_at: Live devnet bootstrap blocked by unfunded relayer
last_updated: "2026-10-17T13:22:06Z"
state_head: bf2d268eeb4f36a9559b32c4f1af3b63ab68c09f
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 1
  completed_plans: 1
  percent: 0
updated: 2026-10-17
current_phase: 1
---

# Current Position

Phase 1 — Catalog truth and foundation. Plan 01 is implemented and locally verified; Phase 1 still retains registry/oracle and live-devnet acceptance gaps. SIWS sessions now bind protected money-path routes and frontend wallet actions, and quote/execution/fee persistence now carries integer USDC base units alongside legacy display amounts. Phase 3 has partial local verification but remains open for live receipt/restart evidence.

## Implemented; local verification complete

- Catalog, composition, and version history are sourced from backend data; the redundant static market page was removed.
- Removed seeded random-walk price history, the minute-by-minute jitter worker, fabricated basket return fields, and the fixed 8% benchmark curve. Only Pyth/Chainlink snapshots are eligible for history; absent data stays unavailable.
- Removed the fake on-chain basket deployment page and the random-walk sparkline. Create aliases now use the idea editor, which clearly states that ideas are browser-local until publishing is connected.
- Labs token selection now uses active, non-denylisted backend devnet assets instead of mainnet mint constants. Removed unsupported price/return estimates and the simulated backtest chart.
- Invest UI fails closed when quote/prepare/sign/submit is unavailable and only reports success after backend `COMPLETED`; transaction links use a landed leg signature.
- Portfolio valuation no longer substitutes fixed SOL/JUP/JTO prices; missing prices render as unavailable. Removed the unused local Jupiter transaction builder.
- Idempotency is wallet-scoped and rejects a reused key with a different basket or amount.
- Anchor version publishing requires the basket admin and a second distinct signer from a configured three-key approval set. The approval set lives in its own one-time PDA. Registry hashes use SHA-256 over mint/weight pairs sorted by mint bytes. Backend publication now builds the exact instruction, verifies both wallet signatures and the landed version PDA, then atomically activates the catalog version with the registry hash and transaction signature. The admin page exposes a sequential two-wallet signing flow.
- Removed the known default admin token. Admin routes fail closed until configured; publishing is rate-limited and checks both credential secrets with constant-time comparison.
- Removed the known JWT signing-secret fallback. Devnet gets a process-random secret when none is supplied; mainnet refuses to start without an explicit 32-byte secret.
- Added configurable Pyth Hermes ingestion for explicitly mapped token mints, recording feed IDs, confidence, and publish time with idempotent snapshots. Quotes and the invest preview expose feed source and timestamp; live catalog prices update only from newer provider data.
- Backend version publication requires the next sequential version, validates 1–10 unique active registry mints with positive prices and exact integer weights, and atomically inserts the immutable version while switching the basket pointer.

## Local verification

- Replaced SQLite with a PostgreSQL repository and async queries. Backend startup loads `backend/.env` from its module path; Neon pooled connections use `public` because the pooler rejects startup `search_path` parameters. The Neon connection and migration smoke check passed.
- Backend typecheck and bundle passed. Latest backend suite: 55 passed, 3 devnet-only skipped; frontend typecheck, production build, and tests passed: 20 passed, 1 live-simulation skipped. `cargo check` previously passed with Anchor macro cfg warnings. The earlier Solana SBF build completed.
- Latest precision/security checkpoint: backend suite 62 passed, 3 devnet-only skipped; frontend suite 21 passed, 1 live-simulation skipped. Backend and frontend builds passed; the Vite build still reports the existing large-chunk warning. PostgreSQL migration smoke check passed after adding quote/execution/fee base-unit columns.
- Follow-up security audit: both swap instruction account contexts now box global and basket accounts to fit the BPF stack; SBF compilation no longer reports the prior 4 KiB stack overflow. Submission now verifies every required Ed25519 signature and the prepared wallet signer. Malformed messages, mismatched messages, and invalid signatures are rejected without consuming the still-valid PREPARED execution. Added a regression test; backend typecheck and tests pass.
- Allocated platform fees across open, retry, close, unwind, and rebalance sell legs. Each confirmed leg records only its own fee; the PostgreSQL ledger deduplicates by execution and leg. Added conservation and idempotency tests.
- Added a direct, wallet-signed devnet USDC withdrawal to any Solana address, including recipient ATA creation; this bypasses the server queue and kill switch. On-chain withdrawal acceptance remains pending.
- Landing now derives the signature from persisted signed transaction bytes, searches transaction history, safely rebroadcasts identical bytes, and requeues uncertain confirmations. Confirmed-leg fee, position, and outbox effects replay idempotently after a crash. Added queue and simulated landing recovery tests; these exposed and fixed an ambiguous PostgreSQL position upsert. Backend config now loads `backend/.env` by module path so root Bun scripts receive the same settings.
- Root-level backend startup against the configured Neon database returned HTTP 200 from `/health`. The route shell now lazy-loads screens; the production entry chunk decreased from 1.55 MB to 973 kB (303 kB gzip), with market and chart code in separate chunks.
- Resolved the pre-deployment program identity mismatch: neither the previous configured ID nor the generated deploy-keypair ID existed on devnet; Anchor's local deploy keypair is now the shared program ID across Anchor, backend, and devnet config. Set Anchor's provider cluster to Devnet. Regenerated the IDL and TypeScript bindings; the IDL embeds the synchronized program ID and all eight current instructions. No program was deployed.
- Removed the public seed-42 relayer fallback from non-test runtime. Devnet and mainnet now require an environment-configured base58 secret; only isolated test runtime can use deterministic test material. Rebalance and execution use the same configured signer. The new devnet signer is stored only in ignored `backend/.env`; tracked config templates contain no key.
- Sanitized API-key query parameters in devnet bootstrap logs and made setup stop before mint creation when the relayer cannot be funded.

## Verification limits

- The Solana program recomputes `legs_hash` from active mint/weight pairs sorted by mint bytes and rejects mismatches. The configured Anchor fixture uses the same canonical bytes; the stale duplicate program test file was removed.

- The backend-to-program transaction flow, DB migration, and two-wallet UI pass local build/tests but have not been exercised on devnet. Anchor SBF and explicit IDL generation pass; the generated IDL reflects the boxed swap account contexts and synchronized program ID. Anchor CLI 1.1.2 still warns that the Rust Anchor version is 0.30.1. Both candidate program IDs were absent on devnet; deployment/initialization still needs the requested wallet signer.
- The supplied AV38 wallet is confirmed at 5 SOL via the fallback devnet RPC, but only its public address is available here. The configured relayer currently has 0 SOL, and the configured program ID has no executable account on devnet. Deployment/initialization and a real devnet investment still need funding for the relayer and a signer for AV38.
- The devnet bootstrap was attempted twice with the generated relayer. Helius airdrop returned HTTP 500 and the public Solana faucet returned HTTP 429 (limit reached/faucet dry); no test mints were created. Logs now redact RPC credentials, and setup stops with an insufficient-SOL error before mint transactions.
- Admin authentication remains environment-configured bearer credentials; one caller can still possess both credentials. The PRD's separate SSO/2FA admin application and identity-backed separation of duties are not implemented.
- The token registry does not yet store liquidity evidence, so publication cannot currently enforce the PRD's illiquidity threshold.
- Pyth ingestion has not been built or run with a real API key/feed map; no Chainlink fallback or verified SOL benchmark is configured. Historical performance therefore remains unavailable until real data accumulates. Devnet quotes disclose when they fall back to configured registry rates; price impact is explicitly unavailable until a pool quote exists.
- Browser/mobile acceptance and the opt-in live Jupiter/mainnet simulation remain outstanding. Local builds/tests pass with the explicitly listed skips.

## Next actions

Phase 3 now has partial verification and explicit acceptance cases under `.planning/phases/03-landing-fees-recovery/`. Submission and settlement use execution row locks and atomic PostgreSQL transactions; failure-injection tests prove rollback and retry locally. Live settlement now requires confirmed transaction receipts, stores exact wallet token deltas, and displays actual received amounts in execution history. Receipt indexing lag requeues safely. Retry preserves sell direction/input; unwind only sells confirmed buy outputs and deducts fees once. Close/rebalance capture blockhash expiry height; partial sells preserve remaining holdings. Backend tests include controlled RPC receipts and PostgreSQL-compatible PGlite; live receipt/restart recovery remains unverified.

Rebalance funding now gates each buy broadcast on all current sells settling successfully and sufficient actual net USDC proceeds for the complete signed buy plan. Persisted retry ancestry carries prior sell receipts forward and subtracts prior confirmed buy inputs. Tests deliberately queue a buy before its sell and verify wait/requeue, then successful settlement; malformed lineage and missing amounts fail closed. The new migrations applied successfully to Neon through `bun backend/scripts/check-database.ts`. Live behavior and concurrent recovery branches remain unverified.

Recovery reservations now serialize each source/action under a PostgreSQL row lock. Repeated requests with different keys return the same prepared/submitted/terminal recovery. Reservation, execution, and audit commit together; audit faults roll back. An expired preview can be replaced only after finalized block-height expiry and empty signature history; a concurrent submit prevents replacement. RPC failover does not override a known chain outcome. The UI exposes Refresh recovery, and reused recovery keys cannot masquerade as ordinary invest/close/rebalance requests. Six regression cases pass locally; Neon migrations and nine recovery columns passed the database check. Live concurrency/recovery acceptance is still outstanding.

Immediate follow-up: fund the configured relayer and make the Anchor deployment signer available for live devnet acceptance. Root `bun run test` invokes the backend and frontend test runners explicitly; `bun run build` builds both workspaces. The reproducibility contract is now pinned by `.bun-version`, `Dockerfile`, `Makefile`, `bun.lock`, and the updated `README.md`.

1. Fund the configured relayer (`76ERXGuZsC2V8jzxGyuohW75UYfDLvPKyXGYSUEsn6UJ` currently has 0 SOL) and provide a working devnet faucet/RPC path; deploy and initialize the updated router, then exercise two-wallet publication and a real investment.
2. Configure the Pyth API key/feed IDs and verified SOL benchmark, then validate freshness and historical snapshots.
3. Finish any remaining catalog/registry acceptance gaps and verify the base-unit columns against live deployment data.
4. Continue through execution, landing/recovery, portfolio, governance, and devnet release phases; do not mark the milestone complete until PRD acceptance evidence exists.

## Rebalance and program builder follow-up (2026-10-17)

- Corrected PRD fees: rebalance defaults to 10 bps on each side; close uses 20 bps. Per-leg fees and buy allocations use integer USDC base units. Buy funding includes the fee debit.
- Split rebalance planning (160 lines) and transaction assembly (199 lines) out of the service (381 lines). Program builder is 90 lines.
- Program builder fixes: directional pool vaults, relayer-funded idempotent ATAs, writable USDC, and explicit Memo program CPI account. Rust exits remain available during pauses.
- Full app test run: backend 51 pass/3 skip, frontend 20 pass/1 skip; subsequent focused fee/plan/recovery suite: 8 pass, including the added program-mode guard. Backend/frontend builds and typechecks passed; git diff --check passed.
- Program close/rebalance fails explicitly instead of falling back to treasury trades. On-chain fee policy and dependent simulation remain unfinished.
- Resolved the Anchor IDL compatibility failure by upgrading Rust and all JS workspaces to 0.31.1. IDL generation passed using the installed 0.30.1 CLI; both swap instructions have 20 accounts, writable USDC, and Memo program accounts. The updated Anchor 0.31 Rust code passes IDL generation, `cargo check`, and optimized `cargo build-sbf`.
- Anchor test runner now uses Bun. Aligning all JS workspaces to 0.31.1 repaired the missing discriminator.js import. The contract test bundle passes, and tests construct Program from generated IDL instead of the unavailable ESM workspace export. Live contract execution still requires a validator and signing wallet.
- Aligned the on-chain global fee ceiling with PRD OD-2 (75 bps); added Rust boundary coverage (75 accepted, 76 rejected) and a validator contract case. Current verification: `cargo test -p kairos-router --lib` passed (2 tests), `cargo check` and optimized `cargo build-sbf` passed with existing Anchor cfg/deprecation warnings; root Bun tests passed (62 backend/3 devnet skips, 21 frontend/1 simulation skip); backend/frontend production build passed. Contract test source bundles, but validator-backed contract execution was not run.
- Rechecked devnet with the configured RPC: the relayer still has 0 SOL, the supplied wallet has 5 SOL, and the configured router address is not executable. No deployment or live swap was attempted.

## Session

**Last session:** 2026-10-17T13:22:06Z
**Stopped at:** Live devnet bootstrap blocked by unfunded relayer
**Resume file:** .planning/phases/01-catalog-truth-and-foundation/01-VERIFICATION.md
