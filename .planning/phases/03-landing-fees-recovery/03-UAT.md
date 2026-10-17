---
status: partial
phase: 03-landing-fees-recovery
source: [03-RECOVERY-SUMMARY.md]
started: 2026-10-17
updated: 2026-10-17
---

## Current Test

number: 1
name: Devnet restart after broadcast
awaiting: funded relayer and deployment signer

## Tests

### 1. Devnet restart after broadcast
expected: After killing and restarting the backend immediately after broadcast, the persisted signed transaction reaches one terminal outcome with one fee record and one notification event.
result: blocked
blocked_by: third-party
reason: Configured relayer has zero SOL and router is undeployed. Only the supplied funded wallet's public address is available.

### 2. Partial execution retry and unwind
expected: A failed leg can be retried without resending successful legs; unwind uses actual landed amounts and returns tokens to wallet USDC after user signature.
result: blocked
blocked_by: prior-phase
reason: Requires deployed devnet accounts, signing/funding prerequisites, and receipt-derived actual token amounts.

### 3. Execution history after browser refresh
expected: Closing or refreshing the app while an execution lands restores its status by ID, shows per-leg results, and exposes the appropriate recovery actions.
result: pending

## Summary

total: 3
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 2
