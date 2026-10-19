# Kairos Requirements

These IDs are the milestone's traceability labels. The normative contract they
trace to is [docs/PRD_V4.md](../docs/PRD_V4.md) (Kairos PRD v4.0, devnet only);
per-requirement status against that contract lives in
[docs/PRD_V4_COVERAGE_AUDIT.md](../docs/PRD_V4_COVERAGE_AUDIT.md).

## v1 Requirements

### Catalog and curation
- [ ] **CAT-01**: Visitors can browse curated baskets and immutable published versions.
- [ ] **CAT-02**: Every published version has unique mints and weights totaling 10,000 basis points.
- [ ] **CAT-03**: Unknown, denied, or ineligible mints cannot be published or quoted.

### Execution safety
- [ ] **EXE-01**: Prepare returns simulated unsigned transactions with disclosed amounts, fees, expiry, and message hashes.
- [ ] **EXE-02**: Submit accepts only the exact prepared message and required wallet signatures.
- [ ] **EXE-03**: Idempotency is wallet-scoped and rejects a reused key with a different request body.
- [ ] **EXE-04**: Fees are charged only for confirmed legs, and partial executions can be retried or unwound.

### Portfolio actions
- [ ] **PORT-01**: Portfolio positions are reconstructed from on-chain balances and external changes are marked modified.
- [ ] **PORT-02**: Users can close positions and withdraw assets to a chosen address.
- [ ] **PORT-03**: Manual rebalance previews version changes, amounts, fees, impact, and slippage before signing.

### Governance and operations
- [ ] **OPS-01**: The kill switch blocks new prepares while preserving close, unwind, and withdraw.
- [ ] **OPS-02**: Basket publishing requires two distinct approvers and privileged actions are audited.
- [ ] **OPS-03**: Notifications use a durable deduplicated outbox and execution history is reproducible by ID.

### Frontend and data integrity
- [ ] **UI-01**: Catalog, detail, invest, execution status, portfolio, settings, and admin flows are usable at mobile widths and keyboard accessible.
- [ ] **UI-02**: Transaction summaries are derived from backend quote data and execution state survives refresh.
- [ ] **DATA-01**: Missing performance data stays missing; hypothetical series, benchmarks, and methodology are clearly labeled.

### Solana and release
- [ ] **SOL-01**: The registry program records and verifies the hash of an immutable basket version without custody.
- [ ] **REL-01**: Devnet acceptance scenarios pass from a fresh environment, including tampering, idempotency, partial failure, recovery, and withdraw.

## v2 / deferred

- Embedded-wallet delegated rebalance, real-world price benchmarks, annotations, richer Labs voting, and mainnet support remain deferred until the devnet core is verified.

## Traceability

See `ROADMAP.md` for phase mapping and `STATE.md` for current status.
