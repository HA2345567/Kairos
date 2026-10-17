---
phase: 03-landing-fees-recovery
status: in_progress
updated: 2026-10-17
---

# Execution recovery implementation evidence

This is partial implementation evidence, not phase completion.

- Submission now locks the execution row and commits its status, signed transaction jobs, audit record, and outbox event in one PostgreSQL transaction. Concurrent submissions return the already accepted execution.
- Settlement locks and rereads the execution, then commits the leg outcome, fee ledger, position, aggregate status, outbox records, and job completion together. Database errors roll back all effects and release the job for retry.
- Status updates no longer delete/reinsert the execution's legs. Confirmed legs cannot be downgraded by a stale failure outcome. Duplicate deliveries preserve subsequently reconciled position amounts.
- The serial worker claims one job at a time so queued jobs do not lose their leases while waiting behind an earlier confirmation.
- Live settlement requires a successful transaction receipt. Exact wallet token deltas, direction, slot, and observed asset balance are persisted; missing receipts retry instead of substituting a quote. Execution history displays the received amount without floating-point formatting.
- Sell input base units and direction survive persistence. Retry preserves the original direction, allows sell recovery during the kill switch, and preserves the failed buy leg fee on retry. Unwind only sells confirmed buy outputs, quotes gross proceeds, and lets the transaction deduct its fee once.
- Close and rebalance preparation persist blockhash validity height. Partial sells preserve remaining holdings and no longer mark a nonempty position closed.
- Buys wait for funding sells even when queue retries reorder jobs. Failed sells and insufficient actual net USDC block buy broadcasts. Persisted parent execution IDs let retries account for earlier received/spent proceeds using exact integers. Unknown lineage/direction/amounts fail closed; database failures requeue. Position initialization deduplicates repeated asset mints.
- Recovery reservation rows serialize requests by source execution and retry/unwind action. Different request keys reuse the same recovery; prepared execution and audit persist atomically. Refresh requires chain block-height expiry and no recorded signature outcome, then compares the current reservation under lock so concurrent refresh/submit cannot create another branch. Legacy untracked recoveries fail closed. The frontend can refresh expired recoveries.

## Verification

- `bun run --cwd backend typecheck`: passed.
- `bun run --cwd backend test`: 51 passed, 3 devnet-only skipped.
- `bun run build:backend`: passed.
- `bun backend/scripts/check-database.ts`: passed against configured Neon PostgreSQL; migrations applied and nine recovery columns checked.
- `bun run --cwd frontend build`: passed, including TypeScript checks; entry chunk 973 kB, with an existing large-chunk warning.
- `bun run --cwd frontend test`: 20 passed, 1 live-simulation skipped.
- Integration cases cover duplicate effects, preservation of later balances, rollback/retry of successful and failed outcomes, audit failure at submission, concurrent duplicate submits, delayed transaction receipts, and partial sells. Receipt parser tests cover exact large integers, newly created/closed token accounts, unrelated owners, and invalid metadata. Recovery planning tests cover direction, fee conservation, missing input metadata, and pending executions.
- These tests do not prove live Solana confirmation, multi-process PostgreSQL contention, or user notification delivery.

## Remaining work

Live devnet restart/expiry/partial recovery acceptance requires the funded relayer and deployment signer. Recovery reservations and rebalance sell/buy dependency ordering pass local tests; multi-process PostgreSQL contention and live wallet behavior remain unverified. Program-backed rebalance preparation remains incomplete, including fee semantics and dependent simulation. Notification delivery currently uses a console transport.

## Rebalance and program builder follow-up (2026-10-17)

- Corrected PRD fees: rebalance defaults to 10 bps on each side; close uses 20 bps. Per-leg fees and buy allocations use integer USDC base units. Buy funding includes the fee debit.
- Split rebalance planning (160 lines) and transaction assembly (199 lines) out of the service (381 lines). Program builder is 90 lines.
- Program builder fixes: directional pool vaults, relayer-funded idempotent ATAs, writable USDC, and explicit Memo program CPI account. Rust exits remain available during pauses.
- Full app test run: backend 51 pass/3 skip, frontend 20 pass/1 skip; subsequent focused fee/plan/recovery suite: 8 pass, including the added program-mode guard. Backend/frontend builds and typechecks passed; git diff --check passed.
- Program close/rebalance fails explicitly instead of falling back to treasury trades. On-chain fee policy and dependent simulation remain unfinished.
- Resolved the Anchor IDL compatibility failure by upgrading Rust and all JS workspaces to 0.31.1. IDL generation passed using the installed 0.30.1 CLI; both swap instructions have 20 accounts, writable USDC, and Memo program accounts. The updated Anchor 0.31 Rust code passes IDL generation, `cargo check`, and optimized `cargo build-sbf`.
- Anchor test runner now uses Bun. Aligning all JS workspaces to 0.31.1 repaired the missing discriminator.js import. The contract test bundle passes, and tests construct Program from generated IDL instead of the unavailable ESM workspace export. Live contract execution still requires a validator and signing wallet.
