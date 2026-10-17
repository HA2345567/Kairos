# Kairos Delivery Status

**PRD:** Kairos v4.0 · **Updated:** 2026-10-17

## Stack

- TypeScript with Bun for the web app, backend, scripts, builds, and tests.
- PostgreSQL through the async repository; Neon is the configured hosted database.
- Solana devnet through Anchor Rust/JS 0.31.1; the React/Vite client uses wallet-signed transactions.

## Verified locally

- Backend typecheck, bundle, PostgreSQL-backed startup, and `/health` smoke check pass.
- Backend tests: 51 pass, 3 devnet-dependent tests skipped.
- Frontend typecheck, production build, and tests pass: 20 pass, 1 live-simulation test skipped.
- Anchor 0.31 Rust `cargo check`, optimized SBF build, and IDL generation pass with macro configuration warnings.
- Submission and settlement use atomic PostgreSQL transactions with execution row locks. Failure-injection tests verify rollback/retry and concurrent submission deduplication. Landing retries retain signed bytes and query signature history; live devnet recovery remains unverified.
- Confirmed receipt deltas supply actual output and observed holdings; missing receipts retry without quote substitution. Direction and sell inputs persist for recovery. Unwind fees are deducted once, partial sells preserve remaining holdings, and the UI displays exact received amounts. Tests cover controlled RPC receipts; live chain acceptance remains outstanding.
- Rebalance buys wait for confirmed sells and sufficient actual net proceeds. Retry ancestry records earlier proceeds and spending. Queue reordering and funding checks pass locally; the updated migrations also pass against Neon.
- Retry/unwind reservations reuse an existing recovery across distinct request keys. Audit failures roll back reservation creation. Refresh waits for chain expiry and checks signature history; a concurrent submit prevents replacement. The UI exposes recovery refresh. Local regressions and Neon migration checks pass.
- Route-level splitting reduced the initial JavaScript chunk from 1.55 MB to 972 kB (301 kB gzip). Market charts and other pages load as separate chunks.

## Devnet status

- The supplied wallet address has 5 SOL, confirmed through the fallback RPC.
- The configured relayer has 0 SOL. The configured router program has no executable account on devnet.
- Helius balance/account requests currently return HTTP 500; the public fallback returned the wallet balance successfully.
- A wallet address cannot sign deployment or investment transactions. The AV38 signer is not available in this workspace, so deployment, initialization, and real transaction acceptance remain unverified.
- Pyth feeds are not configured. Registry liquidity evidence, separate identity-backed admin approvals, and browser/mobile acceptance remain incomplete.
- Program-backed rebalance preparation remains incomplete. Recovery reservations and sell-before-buy dependencies need multi-process/live devnet acceptance.

## Bun commands

From the repository root:

```powershell
bun install --frozen-lockfile
bun run --cwd backend typecheck
bun run --cwd backend test
bun run build:backend
bun backend/scripts/check-database.ts
bun run --cwd frontend build
bun run --cwd frontend test
bun run check:contracts
```

Devnet provisioning requires funded relayer SOL. From `backend/`, run `bun run setup` and then `bun run seed` after the signer and RPC prerequisites are ready.

## Rebalance and program builder follow-up (2026-10-17)

- Corrected PRD fees: rebalance defaults to 10 bps on each side; close uses 20 bps. Per-leg fees and buy allocations use integer USDC base units. Buy funding includes the fee debit.
- Split rebalance planning (160 lines) and transaction assembly (199 lines) out of the service (381 lines). Program builder is 90 lines.
- Program builder fixes: directional pool vaults, relayer-funded idempotent ATAs, writable USDC, and explicit Memo program CPI account. Rust exits remain available during pauses.
- Full app test run: backend 51 pass/3 skip, frontend 20 pass/1 skip; subsequent focused fee/plan/recovery suite: 8 pass, including the added program-mode guard. Backend/frontend builds and typechecks passed; git diff --check passed.
- Program close/rebalance fails explicitly instead of falling back to treasury trades. On-chain fee policy and dependent simulation remain unfinished.
- Resolved the Anchor IDL compatibility failure by upgrading Rust and all JS workspaces to 0.31.1. IDL generation passed using the installed 0.30.1 CLI; both swap instructions have 20 accounts, writable USDC, and Memo program accounts. SBF recompilation with the new dependencies is running; the previous SBF result applies only to the prior dependency version.
- Anchor test runner now uses Bun. Aligning all JS workspaces to 0.31.1 repaired the missing discriminator.js import. The contract test bundle passes, and tests construct Program from generated IDL instead of the unavailable ESM workspace export. Live contract execution still requires a validator and signing wallet.


- Latest root `bun run test`: backend 51 passed/3 devnet skips; frontend 20 passed/1 live simulation skip. Latest `bun run build` passed both workspaces; `bun run check:contracts` passed. `git diff --check` is clean.
- Anchor 0.31 IDL generation, both 20-account swap layouts, Bun contract test bundling, and optimized SBF build passed. Live validator contract execution and devnet deployment remain unverified.
- Program-mode rebalance and close remain explicitly gated while on-chain fee policy and dependent simulation are unfinished.
