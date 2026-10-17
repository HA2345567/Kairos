# Kairos PRD v4.0 Coverage and Implementation Plan

**Audit date:** 2026-10-17
**Source of truth:** PRD v4.0 supplied in the working session.
**Repository state audited:** `ce0cc40 feat: persist execution evidence and rebalance state`

## Executive result

This repository is building the same Kairos product described by the PRD:
non-custodial Solana basket investing with immutable versions, user-signed
multi-leg execution, recovery, portfolio reconciliation, publishing controls,
and a devnet-first web app. It is not a separate product.

It is also not yet the complete PRD acceptance build. The current implementation
is strongest in backend transaction safety, persistence, recovery, catalog
integrity, and local Anchor transaction construction. The main missing proof is
live devnet execution; the main missing product capabilities are finalized
reconciliation, durable notification delivery, program/mint allowlist data,
real-time streams, production admin identity, and several frontend hardening
requirements.

### Coverage score

The score below is deliberately a **local implementation coverage** score, not a
claim of production or devnet readiness:

- Functional requirements audited: **25** (`FR-01` through `FR-25`).
- Locally complete: **14**.
- Partial or architecture-deviated: **11**.
- Completely absent from the functional list: **0**. `FR-16` is present as a
  direct-wallet UI flow but is not yet an authoritative backend/config-driven
  path, so it is counted as partial rather than fully complete.
- Weighted score: `(14 + 0.5 × 11) / 25 = 78%` local functional coverage.
- Must-only weighted score (`FR-01`–`FR-20`): approximately **82.5%** locally.
- Live devnet acceptance: **0 complete end-to-end acceptance runs**. The
  relayer has no SOL, the router is not executable on devnet, and no user
  transaction was attempted.

The score is useful for prioritization only. A partial requirement receives 0.5
even when its local code is substantial but its acceptance proof or required
production boundary is incomplete.

### Post-audit implementation checkpoint

Since the initial matrix was written, the following backend/core items were
implemented and committed in `61e0551` and `ce0cc40`:

- `/v1/quotes` now applies the region gate before quote work.
- Money mutations require the canonical `Idempotency-Key` header; clients send
  it and legacy body keys must match rather than silently substitute it.
- Execution request hashes persist with support records.
- Execution outbox identity is `(execution_id,event_type)`, with attempts,
  lease tokens, and acknowledgement only after transport acceptance.
- Receipt provenance records finalized versus confirmed commitment.
- Completed rebalances advance the position to the target version; mixed
  outcomes preserve the old version and set `REBALANCE_PARTIAL`.

This moves the local score from the initial 76% audit estimate to the 78%
estimate above. It does not change the live-devnet score: no live acceptance
run has been completed.

## Architecture alignment

| PRD area | Current repository | Assessment |
| --- | --- | --- |
| Product behavior | Kairos non-custodial basket router | Aligned |
| Frontend | React 18 + Vite | Behavior-aligned; differs from illustrative Next.js choice |
| Backend | Bun + TypeScript custom HTTP server | Behavior-aligned; differs from Fastify choice |
| Persistence | PostgreSQL repository with PGlite-backed tests | Behavior-aligned; no Drizzle/Redis/BullMQ |
| On-chain | One `kairos-router` Anchor program with version registry instructions | Functionally covers the optional registry role; no separate `kairos_registry` program |
| Swap venue | Program path targets Raydium CPMM accounts; mock/treasury path remains for offline/local execution | Needs one explicit devnet venue decision and live account setup |
| Data | Provider snapshots when configured; devnet registry rates are labeled and not used as historical truth | Aligned with honesty requirement |
| Security | SIWS, wallet binding, byte verification, signer checks, append-only versions, two-credential publish flow | Strong local foundation; admin identity/CSP/allowlist gaps remain |

The existing stack should be retained unless the user explicitly changes the
technology decision. The PRD's behavioral and security requirements are the
contract; replacing the working stack with Next/Fastify/Drizzle/Redis would be
an unnecessary rewrite at this stage.

## Functional requirement matrix

| ID | Status | Evidence and remaining gap |
| --- | --- | --- |
| FR-01 | Complete-local | `basket_versions` and legs are append-only; edits create new versions; DB triggers reject mutation. |
| FR-02 | Complete-local | Service validation plus PostgreSQL deferred weight trigger enforce positive unique legs totaling 10,000 bps. |
| FR-03 | Partial | Unknown/denylisted/inactive mints are rejected, but the PRD's liquidity evidence and backtestability fields are not authoritative. |
| FR-04 | Complete-local | `geoCheck` now runs before `/v1/quotes` validation and provider work. |
| FR-05 | Complete-local | Prepare builds per-leg transactions, stores serialized bytes/hashes, fee, expiry, blockhash, and execution ID. |
| FR-06 | Partial | Real RPC simulation is used outside simulation mode; offline mode intentionally substitutes static signer/compile checks, and live simulation has not been proven. |
| FR-07 | Complete-local | Submit compares message hashes/bytes and verifies every required Ed25519 signature before queueing. |
| FR-08 | Partial | Basket mint membership and a pinned CPMM program are checked, but there is no persisted `program_allowlist` table or general instruction allowlist inspection. |
| FR-09 | Complete-local | Wallet-scoped idempotency and body conflict checks are persisted and covered by tests; the API uses body keys rather than the PRD's `Idempotency-Key` header convention. |
| FR-10 | Complete-local | Landing persists signed bytes, rebroadcasts, checks history, handles expiry, and resumes after restart; live chain evidence is still blocked. |
| FR-11 | Complete-local | Per-leg state produces `PARTIALLY_COMPLETED`; retry and unwind recovery paths are implemented and tested locally. |
| FR-12 | Complete-local | Fees are allocated per leg, charged only after confirmation, and protected by an execution/leg ledger uniqueness key. |
| FR-13 | Partial | Reconciler reads real balances and classifies drift, but its default interval is five minutes rather than the PRD's 30-second p95 target and it is polling rather than event-driven. |
| FR-14 | Complete-local | External balance changes mark a position `MODIFIED`, disable auto-rebalance, write audit evidence, and enqueue an event. |
| FR-15 | Partial | Close planning and program-backed reverse legs exist; real Raydium pool accounts and a live close receipt are not verified. |
| FR-16 | Partial | `WithdrawUsdc` signs a direct wallet transfer, but the frontend uses a fixed `DEVNET_USDC_MINT` instead of authoritative devnet state and there is no backend read/receipt contract. |
| FR-17 | Complete-local | Backend kill switch blocks new prepare; on-chain global pause blocks buys while reverse exits and direct withdrawal remain available. |
| FR-18 | Partial | Outbox rows are durable, leased, and deduplicated, but dedupe is event+payload rather than `(execution_id,event_type)`, and the worker marks console logging as delivered. |
| FR-19 | Complete-local | Privileged publish, pause, trading-status, and execution actions write audit rows with before/after data. |
| FR-20 | Complete-local | Execution lookup exposes legs, amounts, hashes, signatures, errors, timestamps, and recovery ancestry. |
| FR-21 | Partial | Manual rebalance preview and sell-before-buy planning exist; pool impact is `null`, finalized version transition requires verification, and live execution is blocked. |
| FR-22 | Partial | Policy checks, embedded-wallet gating, caps, revocation re-read, and publish fan-out exist; no real embedded provider/policy signer is connected, so the delegated path cannot be accepted as complete. |
| FR-23 | Complete-local | Backtests use verified snapshots only, exclude insufficient-history legs with reasons, and return hypothetical labels/disclaimers; benchmark remains unavailable. |
| FR-24 | Partial | `kairos-router` stores and verifies a version hash with two signers; this is a functional substitute for the optional registry, but not the PRD's separately named program and has no live proof. |
| FR-25 | Partial | Labs supports browser-local ideas, allocations, and voting; server persistence, moderation, registry validation, and promotion are not connected. |

## Frontend and NFR matrix

| Area | Status | Evidence and remaining gap |
| --- | --- | --- |
| Catalog/detail/version history | Complete-local | Backend-fed catalog, version history, devnet labels, and honest unavailable performance states are wired. |
| Invest/sign/status | Partial | Quote and protected prepare/submit flows exist; a dedicated refresh-resilient execution status experience and live per-leg stream are incomplete. |
| Portfolio/close/recovery | Partial | Backend queries, recovery actions, close UI, and withdrawal UI exist; some position/activity display still reads browser `localStorage`. |
| Rebalance UI | Partial | Manual and auto-rebalance controls exist, but impact/real-time state and live program acceptance are incomplete. |
| Admin UI | Partial | Publish, two-wallet signing, kill switch, relayer, executions, and fee views exist; admin authentication is bearer credentials, not separate SSO/2FA/IP-restricted identity. |
| FE-01 performance | Unverified | Bundle splitting was improved, but the PRD's mobile LCP target has not been measured. |
| FE-02 mobile/accessibility | Partial | Responsive CSS and accessibility labels/focus work exist; 360px and keyboard acceptance has not been systematically run. |
| FE-03 session storage | Partial | Access and refresh JWTs are in `sessionStorage`, not `localStorage`; the PRD's preferred httpOnly-cookie path is not implemented. |
| FE-04 CSP/origin pinning | Missing | Security headers exist, but no Content-Security-Policy or pinned wallet/RPC origin policy is emitted. |
| FE-05 money display | Partial | Backend arithmetic is integer base-unit based; several frontend display and legacy activity paths still use browser-local numeric records. |
| FE-06 refresh recovery | Partial | Backend execution lookup is durable; the frontend has no complete WebSocket/REST resync execution page contract. |
| NFR-01/02 latency | Unmeasured | No p95 prepare/read measurement harness is checked in. |
| NFR-03 reconciliation | Not met locally | Five-minute polling cannot satisfy a 30-second p95 target. |
| NFR-04/07/08/09/10 | Unverified | No availability/landing SLO evidence, restore drill, OpenTelemetry trace, or retention policy evidence is present. |
| NFR-05 degrade-closed | Partial | Kill switch, stale prices, relayer checks, and simulation gates exist; provider/program allowlist and health semantics need consolidation. |
| NFR-06 correctness | Strong-local | Tamper, signature, idempotency, fee conservation, recovery, and append-only tests exist; live-chain proof is pending. |

## Acceptance status

### Verified locally

- Catalog/version integrity and honest performance data.
- SIWS nonce verification, wallet-bound protected routes, refresh-token rotation.
- Integer USDC arithmetic, fee allocation, and per-leg fee ledger idempotency.
- Prepare/submit byte equality and required-signature verification.
- Landing queue, rebroadcast/recovery state machine, partial execution, retry, and unwind.
- Portfolio balance refresh/reconciler logic and modified-position behavior.
- Manual rebalance/close transaction construction and Anchor interface matching.
- Router pause/version/hash/fee guards at Rust unit/interface level.
- Demo build and five-route browser smoke path.

### Blocked by real environment, not by a user-token action

- Relayer `76ERXGuZsC2V8jzxGyuohW75UYfDLvPKyXGYSUEsn6UJ` has 0 SOL.
- Router `3jWJZPdDou1h8UrT871Qi573yqQkFYYW8Jqiug9Pne5w` is not executable on devnet.
- The available Phantom address is public-only and cannot sign deployment or investment transactions.
- Faucet/bootstrap attempts returned Helius HTTP 500 and public-faucet HTTP 429; no test-mint/pool state was created.
- Anchor IDL generation still needs a reproducible local toolchain path; the local target IDL was manually aligned for interface checking.

No devnet investment, rebalance, close, withdraw, publish, or explorer receipt
has been claimed or attempted from this audit.

## Backend/core-first implementation plan

The next implementation work should proceed in dependency waves. The frontend
should not be used to hide an incomplete backend or smart-contract boundary.

### Wave 0 — freeze the contract and remove ambiguity

1. Treat the user-supplied PRD v4.0 as normative; keep the repository's v3
   document as historical context only.
2. Keep the existing Bun/React/PostgreSQL/Anchor stack. Record deliberate stack
   deviations rather than starting a framework migration.
3. Declare one devnet execution path:
   - `program` is the only path that can be described as on-chain execution.
   - `mockSwap` is offline/test infrastructure only and must remain visibly
     labeled as simulation.
   - The selected Raydium CPMM pool/account set must be real and initialized
     before program mode is called live.
4. Make every money endpoint accept and persist a canonical request hash and
   require the PRD `Idempotency-Key` header, while retaining a compatibility
   migration for existing callers.

**Exit:** one written contract for venue, allowlists, idempotency, money units,
pause behavior, and local-vs-live status.

### Wave 1 — Anchor and transaction boundary

1. Make IDL generation reproducible without manually editing `target/idl`.
   Pin/verify the installed Anchor/Solana toolchain or add a checked-in
   generation check that fails loudly when the generated IDL diverges.
2. Add explicit on-chain validation for the chosen devnet venue and every
   account role used by both buy and sell instructions. Do not substitute a
   fake pool or user assets to satisfy this check.
3. Keep the current invariants and add contract coverage for:
   - fee cap boundaries and rebalance/close fee values;
   - version PDA/hash mismatch;
   - unlisted input/output mints;
   - invalid program/pool accounts;
   - global pause blocking buys but allowing exits;
   - memo and event contents;
   - user signer plus relayer fee-payer separation.
4. Decide whether the single router's `publish_version` is the accepted
   replacement for `kairos_registry`; document that decision in the API and
   acceptance evidence rather than leaving two registry concepts ambiguous.

**Exit:** generated IDL, Rust source, JS builders, and interface tests agree;
all program-side security invariants pass locally; no live claim yet.

### Wave 2 — backend Must requirements

Implement these before adding frontend polish or new Labs features:

1. **Authoritative registries and eligibility**
   - Add a persisted `program_allowlist` and explicit token liquidity/evidence
     fields, or document the minimum devnet substitute.
   - Apply region/eligibility gates before `/v1/quotes` performs provider work.
   - Consolidate stale-price, relayer-health, venue-health, and kill-switch
     failures into the PRD error taxonomy.
2. **Simulation and quote integrity**
   - Make prepare fail closed unless real simulation succeeds in live mode.
   - Keep offline simulation deterministic and clearly named as a test mode.
   - Return route/impact data when a real pool quote exists; otherwise return an
     explicit unavailable state rather than `null` that looks like success.
3. **Execution durability**
   - Add finalized commitment and receipt provenance to landing records.
   - Persist `request_hash`, leg indexes, min-out, message bytes, commitment,
     and precise error codes required for support replay.
   - Preserve the already-working row-lock, rebroadcast, retry, unwind, and
     fee-conservation behavior.
4. **Position correctness**
   - Make rebalance settlement atomically move the position from source to
     target version only when the intended terminal condition is met.
   - Preserve the old version and set `REBALANCE_PARTIAL` on mixed outcomes.
   - Make close/withdraw use the authoritative configured USDC mint rather than
     a frontend constant.
5. **Reconciliation**
   - Replace the five-minute-only loop with a chain-event/indexer path plus a
     bounded polling fallback.
   - Record commitment, slot, last-known timestamp, drift class, and source of
     the observation.
   - Add a measurable test for the 30-second target; do not claim the NFR until
     the measurement exists.
6. **Notifications**
   - Change outbox identity to `(execution_id, event_type)` for execution
     notifications.
   - Keep attempts and leases; mark delivered only after a real transport
     acknowledgement.
   - Choose the devnet transport explicitly (in-app/API is sufficient for the
     demo); console logging may remain diagnostics but cannot be delivery proof.
7. **Admin and audit boundary**
   - Keep two-person publish and append-only audit records.
   - Replace shared bearer credentials with identity-bound admin/approver
     sessions, or explicitly mark SSO/2FA/IP restrictions as post-demo blocked.

**Exit:** all Must backend requirements have local tests, explicit error/state
semantics, and no known false-success path.

### Wave 3 — live devnet gate

This wave requires user/operator-provided infrastructure, not access to the
user's valuable wallet from chat:

1. Fund a dedicated relayer/operator signer, or provide a faucet/RPC path.
2. Deploy and initialize the router with the exact synchronized program ID.
3. Create only planned devnet test USDC/assets and real pool/treasury state.
4. Run the PRD acceptance matrix with a separate funded test wallet and
   captured evidence:
   - five-leg invest;
   - tampered submit;
   - duplicate idempotent submit;
   - forced partial failure, retry, and unwind;
   - blockhash expiry;
   - browser close and landing recovery;
   - close and direct withdraw;
   - version publish and manual rebalance;
   - external balance modification;
   - kill switch with exits still available.
5. Record actual signatures, slots, leg deltas, fees, and router/version PDAs.

**Exit:** live evidence exists for the core devnet path. Until then, all UI and
README language must continue to say “not verified.”

### Wave 4 — frontend wiring after backend proof

1. Replace browser-local position/activity records with backend execution and
   position records wherever the screen represents actual holdings.
2. Add a dedicated execution-status route keyed by `executionId`, with REST
   resync on refresh and a WebSocket/event stream only after its server contract
   is defined.
3. Wire the authoritative configured USDC mint and backend quote fields into
   withdraw, fee, receive, impact, expiry, and version-diff summaries.
4. Add the required `schema_version` and sequence handling if WebSockets ship;
   sequence gaps must force REST resync.
5. Add CSP/origin pinning, wrong-network detection, 360px/keyboard acceptance,
   and a measured mobile performance check.
6. Keep admin UI separate in behavior even if it remains in the same Vite app
   for the demo; do not represent bearer tokens as production SSO.

**Exit:** frontend is a thin, honest client of backend state and live evidence;
no local demo state can masquerade as a real position or execution.

### Wave 5 — Should/Could scope after the core gate

- Connect a real embedded-wallet/delegated-signing provider and prove revoke-
  during-landing behavior before enabling auto-rebalance.
- Configure Pyth/Chainlink feeds, liquidity evidence, and a verified SOL
  benchmark; then add performance/annotation methodology.
- Add durable Labs persistence, moderation, registry-valid promotion, and
  richer voting.
- Add multi-aggregator routing, operational metrics, OpenTelemetry, restore
  drills, and load/game-day tests.

## Recommended next coding slice

Do not start another frontend feature yet. The next focused implementation
slice should be **backend/core contract completion**:

1. Add `program_allowlist`/instruction validation and apply `geoCheck` to quote.
2. Normalize `Idempotency-Key` and request-hash persistence.
3. Fix the outbox event identity/delivery contract.
4. Make rebalance version transition and finalized receipt provenance explicit.
5. Add regression tests for those four changes, then rerun the backend suite,
   interface check, Rust tests, and production build.

That slice closes the highest-risk Must gaps without touching user assets or
requiring live devnet access. The live-devnet wave should remain a separate
operator-gated step after those local guarantees are complete.
