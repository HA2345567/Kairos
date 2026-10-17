---
phase: 03-landing-fees-recovery
verified: 2026-10-17
status: gaps_found
score: partial
---

# Phase 3 verification

Goal: every execution reaches a reproducible terminal state, including partial completion and recovery.

| Requirement | Evidence | Status |
| --- | --- | --- |
| Durable submission and local settlement | Failure injection rolls back jobs, statuses, fees, positions, audit/outbox effects; retry succeeds | Verified locally |
| Duplicate submission and delivery | Concurrent requests enqueue once; duplicate settlement preserves later balances and a single fee row | Verified locally |
| Live restart, expiry and rebroadcast | Signature is derived from persisted bytes and history is queried; live process-kill test has not run | Unverified |
| Actual received amounts | Confirmed transaction token deltas are stored in exact base units; missing receipts requeue without marking completion; RPC fixture verifies delayed receipt recovery | Verified with fixtures; live unverified |
| Partial execution retry/unwind | Retry preserves direction and sell input; unwind selects buys and deducts fees once; pending executions reject recovery | Local regressions pass; devnet unverified |
| Rebalance funding order | Queue integration deliberately runs buy first; it requeues until sell confirmation. Exact proceeds, prior buy spending, and ancestry are checked | Verified locally; live acceptance pending |
| Recovery deduplication | Source/action reservation, different-key concurrency, audit rollback, stale refresh, submit conflict, chain expiry/history checks | Local regression tests pass; multi-process PostgreSQL and devnet acceptance pending |
| Durable notification delivery | Outbox writes share settlement transaction; transport is console logging | Partial |

Tests use PGlite, simulated confirmation, and controlled RPC receipts; they are not proof of devnet release readiness. See `03-UAT.md` for outstanding acceptance scenarios and `03-RECOVERY-SUMMARY.md` for the latest command results.
