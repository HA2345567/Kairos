# Kairos — Devnet Product Roadmap

## Milestone v1.0: Devnet product aligned to PRD v4.0

### Phase 1: Catalog truth and foundation
**Goal:** Visitors see basket-specific catalog and version data, and all performance claims are traceable and honestly labeled.
**Requirements:** CAT-01, CAT-02, CAT-03, DATA-01
**Success Criteria**:
1. Catalog versions and allocations come from the backend version endpoint.
2. Unknown or unavailable performance history renders an explicit empty state without borrowing another basket's data.
3. Every hypothetical series and illustrative benchmark discloses its source and limits.
4. Devnet/test-token context is visible throughout the web app.

### Phase 2: Signed execution safety
**Goal:** A user can preview, sign, and submit a validated multi-leg devnet execution without Kairos gaining authority over user assets.
**Requirements:** EXE-01, EXE-02, EXE-03
**Success Criteria**:
1. Prepare validates eligibility, token/program allow-lists, minimums, expiry, slippage, and simulation before returning unsigned transactions.
2. Submit verifies the exact serialized message and every required signature before enqueueing any work.
3. Same-wallet retries with the same key and body replay safely; a different body returns a conflict.
4. Prepare and submit behavior is covered by deterministic tests.

### Phase 3: Landing, fees, and recovery
**Goal:** Every execution reaches a reproducible terminal state, including partial completion and recovery.
**Requirements:** EXE-04, OPS-03
**Success Criteria**:
1. Leg confirmation, retry, rebroadcast, and expiry are persisted across process restart.
2. Fees are atomic with successful legs and zero for failed legs.
3. Partial executions expose retry and unwind actions with per-leg results.
4. Outbox events are deduplicated and execution history is queryable by execution ID.

### Phase 4: Portfolio and position actions
**Goal:** Users can inspect and manage positions from wallet balances without custody or hidden server actions.
**Requirements:** PORT-01, PORT-02, PORT-03
**Success Criteria**:
1. Portfolio balances reconcile to devnet token accounts and external transfers mark a position modified.
2. Close and withdraw actions require user signatures and remain available during the kill switch.
3. Rebalance previews show every sell/buy leg, fee, impact, slippage, and target-version difference.

### Phase 5: Governance and Solana registry
**Goal:** Curators can publish immutable, verified versions with controlled administration and an auditable safety switch.
**Requirements:** OPS-01, OPS-02, SOL-01
**Success Criteria**:
1. Publishing requires approvals from two distinct authorized users.
2. Registry hash matches the immutable version composition shown by the UI.
3. Kill-switch changes and privileged actions have append-only audit evidence.

### Phase 6: UX hardening and devnet acceptance
**Goal:** The complete product flow meets PRD accessibility, recovery, and devnet release criteria.
**Requirements:** UI-01, UI-02, REL-01
**Success Criteria**:
1. Catalog, invest, status, portfolio, settings, and admin flows work at 360px and by keyboard.
2. Closing and reopening the app restores execution status using its execution ID.
3. Fresh devnet setup and all required acceptance scenarios pass with captured evidence.

## Status

- Phase 1: in progress
- Phase 5: in progress (registry transaction flow implemented; deployment and acceptance evidence pending)
- Phases 2 and 3: in progress (atomic submission/settlement and local failure-injection tests; live acceptance pending)
- Phases 4 and 6: pending
