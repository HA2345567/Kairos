# Kairos PRD v4.0 — Coverage Audit at HEAD

**Audit date:** 2026-10-18
**Audited revision:** `033c1f5 docs: record allowlist and reconciliation coverage` (branch `master`)
**Normative source:** [docs/PRD_V4.md](PRD_V4.md) — PRD v4.0, committed 2026-10-18,
covering the same text that was previously supplied only in the working session.
**Scope decision:** **Devnet only.** No mainnet acceptance is claimed or in scope.
**Supersedes:** `docs/PRD_V4_GAP_PLAN.md` (audited at `afb5454`, one commit behind HEAD).

## Verification baseline (run in this audit)

| Check | Command | Result |
| --- | --- | --- |
| Backend suite | `bun run test:backend` | **118 pass, 3 skip, 0 fail** (121 tests / 17 files, ~37 s) |
| Frontend suite | `bun --cwd frontend test` | **21 pass, 1 skip** (9 files) |
| Frontend build (typecheck + `vite build`) | `bun --cwd frontend build` | **Pass** — exercises the FE-04 CSP transform |
| NFR probe | `bun run --cwd backend nfr` | **NFR-02 pass**: read p95 **199.8 ms** ≤ 250 ms over 60 reads, networked Postgres. NFR-01 + NFR-09 **blocked** (`503 DEVNET_NOT_INITIALIZED` — reported as blocked, never as pass). `/v1/admin/metrics` surface pass |
| Devnet acceptance runner | `bun run --cwd backend acceptance` | **2 pass, 4 blocked, 0 fail**; each blocker names the operator action (fund relayer, deploy router, `bun run setup`, `SWAP_BUILDER=program`) |
| Live devnet acceptance | — | **0 runs.** Blocked on relayer SOL + deployable program (unchanged) |

The 3 backend skips are the devnet E2E cases that auto-skip until faucet SOL
arrives; the 1 frontend skip is the live-simulation case.

## Verdict

The repository **is** the Kairos product described by PRD v4.0 and is behaviourally
close on the backend/core contract. It is **not** yet the complete PRD acceptance
build for two distinct reasons, and they must not be conflated:

1. **Live devnet proof is absent (0 acceptance runs).** This blocks §14.5 / §18
   entirely and is an infrastructure problem (relayer 0 SOL, router not
   executable, no signing wallet), not a code problem.
2. **A set of real code gaps remain**, listed in "New findings" below. Most are
   frontend/hardening or Should/Could scope; one is a Must-level behavioural gap
   (kill switch does not gate rebalance buys).

### Local implementation coverage

- Functional requirements audited: **27** (`FR-01`…`FR-27`).
- Complete-local: **13** (`FR-01,02,05,07,08,09,10,11,12,14,17,19,20`).
  Partial: **13** (`FR-03,04,06,13,15,16,18,21,22,23,24,25,26`).
  Missing: **1** (`FR-27` annotation layer).
- Weighted: `(13 + 0.5 × 13) / 27 = **72.2%**` local functional coverage.
- Must-only (`FR-01`…`FR-20`): **13 complete-local / 7 partial / 0 missing
  → 82.5%** weighted. No Must requirement is absent; seven are behaviourally
  incomplete (`FR-03,04,06,13,15,16,18` — see the matrix).
- Frontend `FE-01`…`FE-09`: 0 complete-local, 8 partial, 1 missing (`FE-09`),
  1 unverified (`FE-01` LCP — never measured). `FE-04` moved missing → partial
  on 2026-10-18 (build-injected CSP with pinned origins, preview/HSTS headers);
  API CORS is still `*`.
- NFR `NFR-01`…`NFR-12`: 1 strong-local (`NFR-06`), 1 measured-pass
  (`NFR-02`, probe p95 199.8 ms), 1 measured-blocked (`NFR-01`, needs devnet
  init), 4 partial (`NFR-03,05,11,12`), 1 partial-with-surface (`NFR-09` —
  `/v1/admin/metrics` samples, no otel), 4 unmeasured/unverified
  (`NFR-04,07,08,10`). The harness is checked in: `bun run --cwd backend nfr`.
- **Live devnet acceptance: 0 / 12 checklist items in §14.5.**

Score is for prioritization only. A partial requirement scores 0.5 even where the
code is substantial, because its acceptance proof or production boundary is
missing.

## Stack alignment

| PRD area | Repository | Assessment |
| --- | --- | --- |
| Frontend | React 18 + Vite + Tailwind, Solana Wallet Standard adapters | Behaviour-aligned; deviates from illustrative Next.js 13 choice |
| Backend | Bun + TypeScript custom HTTP server, route/middleware/server split | Behaviour-aligned; deviates from Fastify |
| Persistence | PostgreSQL (`pg`) + SQL migrations, PGlite in tests | Aligned; no Drizzle, no Redis, no BullMQ (jobs table + workers instead) |
| On-chain | One Anchor `kairos-router` program, 8 instructions incl. `publish_version`, `set_global_pause` | Functionally covers the optional `kairos_registry` role; not a second named program |
| Swap venue | `SWAP_BUILDER=program` (Raydium CPMM accounts) + treasury/mock offline path behind `QuoteProvider`/`SwapBuilder` spirit | Aligned in shape; live pool accounts unverified |
| Money | Integer USDC base units end to end (`services/money.ts`, `*BaseUnits` columns) | Aligned (FE-05 backend side) |

Stack deviations are deliberate and were already recorded; they are **not**
counted as gaps because the PRD's behavioural and security requirements are the
contract. See "Do not rewrite" below.

## Functional requirement matrix

Status legend: **C** complete-local · **P** partial · **M** missing.

| ID | Pri | Status | Evidence | Remaining gap |
| --- | --- | --- | --- | --- |
| FR-01 Immutable versions | Must | C | `db/migrate.ts:109,114` append-only triggers on `basket_versions`/`basket_legs`; edits create new versions | — |
| FR-02 Weight sum 10 000 | Must | C | service check `quote.service.ts` + deferred DB trigger | — |
| FR-03 Token registry validation | Must | P | denylisted/inactive/halted mint rejection (`quote.service.ts` TOKEN_HALTED) | No liquidity evidence or `backtestable` field, so the illiquidity threshold cannot be enforced |
| FR-04 Eligibility/region before quoting | Must | P | `geoCheck` now composes into the money guard, so it covers `/v1/quotes` plus every money path (prepare, submit, retry, unwind, rebalance/close prepare, auto-rebalance) via `middleware.ts` + `trade.routes.ts` | Still no eligibility/age state beyond `users.region`; `ELIGIBILITY_REQUIRED` is defined but never emitted |
| FR-05 Prepare builds unsigned txs | Must | C | `execution.service.ts` `prepareWithLegs` stores serialized txs, message hashes, blockhash + `lastValidBlockHeight`, fee, expiry, `executionId` | — |
| FR-06 Simulate before returning | Must | P | `execution.service.ts:275-285` real RPC `simulate()`; static signer/compile checks in `simulateLanding` mode | Live simulation never proven; offline mode is a deliberate test path |
| FR-07 Verify on submit (byte equality) | Must | C | `execution.service.ts` submit compares message hash/bytes → `MESSAGE_TAMPERED`; signature/signer failures → `INVALID_SIGNATURE` (canonical §10 codes) | — |
| FR-08 Program & mint allow-list | Must | C | `chain/allowlist.ts`; persisted `program_allowlist` table; enforced at `execution.service.ts:269` before simulation/signing | — |
| FR-09 Idempotency | Must | C | wallet-scoped keys, persisted `request_hash` (`services/request-hash.ts`), canonical `Idempotency-Key` header (`middleware.ts`), body-conflict checks, `IDEMPOTENCY_CONFLICT` | — |
| FR-10 Landing with rebroadcast | Must | C | `workers/landing.ts` send → history search → rebroadcast identical bytes → block-height expiry decision; resumes after restart | No live chain receipt |
| FR-11 Partial completion state | Must | C | per-leg states → `PARTIALLY_COMPLETED`; retry + unwind implemented with recovery ancestry (locked reservations) | — |
| FR-12 Per-leg fee atomic with leg | Must | C | fee allocated per leg, charged only on confirmed legs; `fee_ledger` unique on `(execution_id, leg_id)` `migrate.ts:357` | — |
| FR-13 Reconciliation | Must | P | `workers/reconciler.ts` finalized balances, drift class, provenance, `DEFAULT_RECONCILE_INTERVAL_MS = 30_000` | Polling only — no account subscription/event indexer; 30 s p95 never measured |
| FR-14 External modification | Must | C | `MODIFIED` status, auto-rebalance disabled, audit row, outbox event | — |
| FR-15 Close to USDC | Must | P | `rebalance.service.prepareCloseExecution` + program reverse legs | Live pool accounts and a live close receipt unverified |
| FR-16 Withdraw | Must | P | wallet-signed direct USDC transfer, recipient ATA creation, bypasses queue + kill switch (`portfolio/WithdrawUsdc.tsx`) | Uses a hardcoded `DEVNET_USDC_MINT` (`lib/usdc.ts:1`) instead of authoritative devnet state; no backend read/receipt contract |
| FR-17 Kill switch | Must | C | single decision point `services/controls.ts` (`tradingPauseError`/`assertTradingOpen`): blocks open prepare, buy-side rebalance prepare, retry-with-buy and auto-rebalance fan-out on publish; close, unwind, sell-only rebalance and direct withdraw stay open (X11). Covered by `tests/controls.test.ts` | The ≤60 s activation window is unmeasured against a live system |
| FR-18 Notification outbox | Must | P | `outbox` table unique on `(execution_id, event_type)` `migrate.ts:342`; leases + attempts; ack only after transport acceptance (`workers/outbox.ts`); read surface `GET /v1/notifications` surfaced in `pages/Settings.tsx` | Delivery transport is a devnet-local console transport; no notification-preference write, email or push transport |
| FR-19 Audit log | Must | C | append-only `audit_log` with before/after for publish, pause, trading-status, execution, recovery, faucet actions | — |
| FR-20 Support reproducibility | Must | C | `GET /v1/executions/:id` + admin list expose legs, amounts, hashes, signatures, errors, timestamps, recovery ancestry | — |
| FR-21 Manual rebalance | Should | P | sell-then-buy plan, version diff, per-leg fee, funding gate on settled sells (`rebalance-plan.ts`, `rebalance-funding.ts`) | `priceImpactPct` stays `null`; no live pool quote/impact |
| FR-22 Auto-rebalance (opt-in, policy) | Should | P | embedded + delegated signing + policy gates read at run time (revocation honoured), caps, slippage cap, publish fan-out (`rebalance.service.ts:236-330`) | No real embedded-wallet provider/policy signer, so the delegated path cannot be accepted |
| FR-23 Backtests / hypothetical | Should | P | verified snapshots only, excluded legs with reasons, hypothetical labels + disclaimer (`backtest.service.ts`) | Benchmark (S&P 500 / SOL) unavailable; no verified SOL benchmark configured |
| FR-24 On-chain version registry | Should | P | `publish_version` requires basket admin + second distinct signer from a 3-key approval PDA; SHA-256 legs hash verified server-side before activation | Program not deployed to devnet; no live registry proof |
| FR-25 Labs / UGC + voting | Could | P | Labs idea/allocations/voting UI, devnet-asset token picker | Browser-local only — no server persistence, moderation, registry validation, or promotion |
| FR-26 Simulation API `/agent/simulate-graph` | Should | **P** | `routes/agent.routes.ts` + `services/simulation.service.ts`: validates a ≤10-leg allocation summing to 10 000 bps, rejects unknown/denylisted mints, rebases the hypothetical series to 1000, excludes legs without verified history with a reason, and reports the benchmark as unavailable unless `SIMULATION_BENCHMARK_MINT` has real history (`tests/slice-b.test.ts`) | No verified benchmark feed is configured, so the S&P 500 / SOL comparison the PRD asks for is structurally unavailable; not yet surfaced in the UI |
| FR-27 Price annotation layer | Could | **M** | No `annotations` table or route; no checkpoints/incentives/liquidation-info either | Entire layer missing (glossary §19 terms) |

## Frontend matrix (PRD §4)

| PRD page / requirement | Status | Evidence | Gap |
| --- | --- | --- | --- |
| Home / catalog | C | `pages/Index.tsx`, `pages/Markets.tsx` fed by `/v1/baskets`; skeleton + filters | — |
| Basket detail (thesis, composition, version history, risk) | P | `pages/MarketDetailpage.tsx`, `/v1/baskets/:slug`, `/rebalances`, `/performance` | No annotations, liquidation info, checkpoints, or incentives sections |
| Invest panel | C | `components/basket/InvestModal.tsx` — fee, per-leg preview, min-out, expiry from backend quote | Impact shown as unavailable (correct, but incomplete) |
| Signing & status page | P | per-leg status inside `InvestModal.tsx:193-222` + `portfolio/PositionActions.tsx` | No dedicated `/executions/:id` route; no WebSocket stream; recovery depends on the modal/rooted UI, not a durable page |
| Portfolio | P | `pages/Portfolio.tsx` (activity from `GET /v1/executions`, positions from `GET /v1/positions`), `portfolio/PositionActions.tsx` with drift/`MODIFIED` badge | Remaining `localStorage` use is only the Labs pages (`FR-25`, browser-local by design); no dedicated position-detail route |
| Position detail | P | detail rendered inside Portfolio/PositionActions | No dedicated route or full leg/history surface |
| Rebalance preview | P | sell/buy legs, fee, slippage, version diff from backend | Impact `null`, no live state |
| **Settings** | **P** | `/settings` route (`App.tsx:57`) + `pages/Settings.tsx`: wallet, one-click session revoke (`POST /v1/auth/logout` → `revokeSession`), auto-rebalance policy (`PUT /v1/positions/:id/auto-rebalance`), delivered notifications (`GET /v1/notifications`), cluster/config (`GET /v1/config`) | Notification *preferences* are read-only (delivered list, no write endpoint); embedded-key revoke N/A until §4.2 embedded wallet exists |
| Admin console | P | `pages/Admin.tsx` — publish, two-wallet signing, kill switch, relayer, executions, fees; publish approval requires a second distinct `ADMIN_APPROVER_TOKEN` + actor (`503 DUAL_PUBLISH_APPROVAL_NOT_CONFIGURED` when unset, `admin.routes.ts`) | Same Vite app, bearer `x-admin-token` credentials; no SSO/2FA/IP restriction |
| Embedded wallet (§4.2) | M | `@privy-io/react-auth` is declared in `frontend/package.json` but **never imported anywhere in `frontend/src`**; `components/wallet/SolanaProvider.tsx` registers only Phantom + Solflare | No embedded wallet, so no delegated-signing key, no revoke control, and FR-22 cannot be accepted. `Backpack` (named in §4.2 and §16) has no adapter registered either |
| Network-mismatch prompt (§4.2) | C | `components/system/ClusterBanner.tsx` + `hooks/useAppConfig.ts` compare the connected wallet's cluster/endpoint against `/v1/config`'s authoritative cluster, render a blocking banner with fix instructions and state that trading is disabled until they match | — |
| FE-01 LCP ≤ 2.5 s | Unverified | Route-level lazy loading reduced the entry chunk 1.55 MB → 973 kB | Never measured on 4G/mid-range |
| FE-02 360 px / WCAG AA / keyboard | P | responsive CSS, ARIA labels, focus work | No systematic 360 px or keyboard acceptance run |
| FE-03 no keys in localStorage | P | JWTs in `sessionStorage`; no keys | httpOnly-cookie session not implemented |
| FE-04 CSP + pinned origins | **P** | CSP meta injected on build (`frontend/vite.config.ts` `kairos-csp` plugin: `script-src 'self'` + pinned RPC/API/Jupiter/Dexscreener/CoinGecko/wss origins); preview serves CSP, nosniff, referrer-policy, X-Frame; HSTS + Permissions-Policy server-side (`server.ts:53,57`) | API still answers `Access-Control-Allow-Origin: *` (`server.ts:51`); the dev server runs without CSP (React-refresh inline preamble) |
| FE-05 integer money display | P | backend all-integer base units | Several frontend display/legacy activity paths still numeric/local |
| FE-06 refresh recovery | P | backend execution lookup durable | No resync-on-refresh execution page contract |
| FE-07 ARIA-live errors | P | accessible error text present | No `aria-live` region contract verified |
| FE-08 dark-mode toggle | P | system-preference handling exists | Explicit toggle parity not acceptance-tested |
| FE-09 anonymized analytics | M | No analytics integration at all | Nothing emits page-view events |

## NFR matrix (PRD §11)

| ID | Status | Note |
| --- | --- | --- |
| NFR-01 prepare p95 ≤ 3 s | **Blocked (honest)** | `bun run --cwd backend nfr` drives 60 prepares; every one currently answers `503 DEVNET_NOT_INITIALIZED`, so the gate reports *blocked* — never pass |
| NFR-02 read p95 ≤ 250 ms | **Measured pass** | Probe p95 **199.8 ms** over 60 reads (baskets 206.9 / tokens 102.1 / config 2.0) vs networked Postgres. Catalog composition batched to 2 round trips (`catalog.routes.ts` Promise.all + joined `getBasketVersions`), down from ~1.9 s p95 |
| NFR-03 reconciliation ≤ 30 s p95 | P | bounded 30 s poll; no event path and no measurement |
| NFR-04 availability 99.9 % | Unverified | Nothing deployed to probe |
| NFR-05 degrade closed | P | kill switch plus a fail-closed prepare gate: buy-side prepare is refused with `RELAYER_LOW` / `ALL_AGGREGATORS_DOWN` (503) when relayer or RPC health is unknown, while reads, sells, close, unwind and withdraw stay up (`services/controls.ts`, tested) | Aggregator/venue health is still not consolidated with the relayer probe, and the gate is unverified against a live devnet RPC |
| NFR-06 correctness | **Strong local** | tamper, signature, idempotency, fee-conservation, recovery, append-only tests all pass (76 backend tests) |
| NFR-07 landing terminal ≤ 120 s ≥ 99 % | Unmeasured | Local queue tests only |
| NFR-08 RPO/RTO drill | Unverified | No restore drill evidence |
| NFR-09 OpenTelemetry tracing | P | No otel/sentry/pino dependency yet, but `/v1/admin/metrics` now exposes per-route latency samples keyed by route pattern (7 series), and the probe asserts `execution_id` traceability whenever an execution can be created (blocked pre-devnet) |
| NFR-10 retention 7 y / PII ≤ 30 d | Unverified | No retention job or CI policy check |
| NFR-11 security headers | P | 4 of 6 present; CSP + HSTS missing |
| NFR-12 no PII in logs; IP anonymized 24 h | P | credential redaction added; no anonymization job |

## Data model (PRD §9) deltas

Present and matching intent: `users`, `wallets`, `tokens`, `program_allowlist`,
`baskets`, `basket_versions`, `basket_legs`, `quotes`, `executions`,
`execution_legs`, `positions`, `position_legs`, `price_snapshots`,
`rebalance_events`, `fee_ledger`, `notifications_outbox` (as `outbox`),
`audit_log`, plus repo-only `basket_publish_proposals`, `execution_recoveries`,
`nonces`, `refresh_tokens`, `settings`, `jobs`.

Missing or thinner than the PRD: `annotations`, checkpoints, incentives,
liquidity-info fields on versions, `tokens.backtestable`, notification
preferences, and explicit region/eligibility records beyond `users.region`.

Constraints present: weight-sum trigger, append-only triggers, unique
`(wallet_id, idempotency_key)`, unique `(execution_id, leg_index)`, unique
`(execution_id, event_type)` outbox, unique `(execution_id, leg_id)` fee ledger,
integer base-unit money columns. **Concurrency:** row-locked execution and
recovery reservations.

## API surface (PRD §10) deltas

Implemented (shape differs from the PRD table but is functionally equivalent):
`/v1/auth/{nonce,verify,refresh}`, `/v1/baskets`, `/v1/baskets/:slug`,
`/v1/baskets/:slug/performance`, `/v1/baskets/:slug/rebalances`, `/v1/quotes`,
`/v1/positions/prepare`, `/v1/positions/submit`, `/v1/executions/:id`,
`/v1/executions`, `/v1/positions`, `/v1/positions/:id`,
`/v1/positions/:id/{rebalance,close}/prepare`, `/v1/positions/:id/auto-rebalance`,
`/v1/tokens`, `/v1/faucet/airdrop` (PRD names it `/devnet/faucet`),
`/health` + `/healthz`, `/v1/admin/*`.

Deviations and gaps:

- **No WebSocket transport.** The §10 stream *contract* now exists over HTTP
  polling (`/v1/stream/*`: `execution.{id}`, `position.{id}`, `price.{mint}`,
  `schema_version`, monotonic `seq`, gap-forces-resync — `services/event-stream.ts`,
  tested in `tests/slice-c.test.ts`); the WebSocket transport deviation is
  documented in the route header.
- No `/v1/positions/:id/rebalance/submit`, `/close/submit`, `/positions/:id/unwind`
  — folded into `/v1/positions/submit` + `/v1/executions/:id/unwind` (equivalent
  behaviour, different shape).
- ~~No `/agent/simulate-graph`~~ **RESOLVED 2026-10-18** — `/v1/agent/simulate-graph`
  now returns a hypothetical series rebased to 1000 with an explicit unavailable
  state instead of fabricated data. Still missing: no `/v1/baskets/:slug/annotations`.
  The notification read endpoint landed as `GET /v1/notifications`.
- ~~`/v1/tokens` has no type/denylist filters; `/v1/baskets` has no cursor
  pagination~~ **RESOLVED 2026-10-18** — `/v1/tokens` filters by `type` and
  `denylisted` (`true|false|all`, default hides denylisted rows), `/v1/baskets`
  filters by `status`/`category`, and both page by `limit` + `after` with a
  `nextCursor`. Absent `limit` keeps the historical "return everything" shape.
- ~~Rate limits keyed on client IP only~~ **RESOLVED 2026-10-18** — money paths
  now use a per-wallet budget (`walletRateLimit`, 20 prepares / wallet / 10 min)
  on top of the coarse per-IP guard, and read guards were aligned to the §10
  example of 600 reads / IP / min.
- **Error taxonomy realigned to §10** on 2026-10-18: `MESSAGE_TAMPERED`,
  `INVALID_SIGNATURE`, `PRICE_STALE`, `DUST_LEG`, `RELAYER_LOW`,
  `ALL_AGGREGATORS_DOWN`, `ELIGIBILITY_REQUIRED` and `ALREADY_TERMINAL` are now
  first-class codes, with the legacy names retained as aliases. Still absent as
  typed codes: `INVALID_BASKET` (returned as a bare `{ error }` string in places)
  and `MISSING_IDEMPOTENCY_KEY` outside the money middleware.
- `/v1/auth/*` limits remain 20/min per IP; §10 gives 5 auth attempts / IP / min
  as an example. Left as-is deliberately to avoid locking out the demo flow.

## Security & threat model (PRD §12) coverage

| Threat | Control present? |
| --- | --- |
| T1 tampered signed tx | Yes — byte equality + required-signature verification + allow-lists |
| T2 fee double-charge | Yes — fee in leg tx, unique ledger, Σ assertions |
| T3 idempotency collision | Yes — unique key + request hash |
| T4 unlisted route/program | Yes — persisted allow-list, denylist, simulation, user `min_out` |
| T5 price-feed manipulation | Partial — Pyth ingestion + staleness rejection; no Chainlink fallback, no verified SOL benchmark, no measured impact cap |
| T6 relayer drain | Partial — SOL balance/`isFunded` health + admin view, and prepare now refuses buys below the relayer floor (NFR-05), but there are still no per-wallet spend limits or min-basket-in-SOL enforcement |
| T7 treasury compromise | Partial — multisig key derived from devnet labels; no live multisig |
| T8 delegated-signing abuse | Partial — run-time policy re-read, revoke honoured, audits; no real provider |
| T9 backend/DB compromise | Yes by design — no keys stored, stored bytes can't forge signatures |
| T10 frontend compromise | **Weak — no CSP/SRI, CORS `*`** |
| T11 sandwiching | Partial — slippage + dust cap; impact cap not enforced because impact is `null` |
| T12 indexer inconsistency | Partial — finalized accounting, but replayable indexer not implemented |

## Devnet acceptance checklist (PRD §14.5 / §18)

Run these with `bun run --cwd backend acceptance` (checked in): it currently reports **2 pass,
4 blocked, 0 fail** and names the operator action per blocker. All 12 items
remain unproven end to end:

- [ ] Fresh environment from scripts in ≤ 30 min — scripted (`backend/scripts/devnet-setup.ts`) but blocked: no SOL for relayer
- [ ] 5-leg invest visible in the user's wallet on explorer — **not attempted**
- [ ] Preview fee/receive accuracy within slippage — local only
- [ ] Tampered submit rejected, nothing lands — **local test passes**, no live proof
- [ ] Duplicate idempotent submit never double-spends — **local test passes**
- [ ] Partial state with retry/unwind, fee only on confirmed legs — **local test passes**
- [ ] Browser close → recovery via `executionId` — local queue tests only
- [ ] Close & withdraw to any address — unverified live
- [ ] Publish moves zero user funds; version immutable — local tests + triggers, no live registry proof
- [ ] Kill switch ≤ 60 s, blocks prepares, allows close/withdraw/unwind — local only (**and rebalance prepare is not gated**, see FR-17)
- [ ] Reconciler flags external transfers → `MODIFIED` — local test passes
- [ ] Optional `kairos_registry` hash matches displayed composition — program not deployed

Known infrastructure blockers (unchanged since the last audit): relayer
`76ERXGuZsC2V8jzxGyuohW75UYfDLvPKyXGYSUEsn6UJ` has 0 SOL; router
`3jWJZPdDou1h8UrT871Qi573yqQkFYYW8Jqiug9Pne5w` is not executable on devnet;
the available Phantom address is public-only; faucet calls returned HTTP 500/429.

## New findings in this audit (not in the previous gap plan)

Resolution status is recorded inline; resolved items stay listed so the finding
history is not lost.

1. ~~**FR-17 / X11 violation — kill switch does not gate rebalance.**~~ **RESOLVED 2026-10-18** — one decision point (`backend/src/services/controls.ts`) now gates open prepare, buy-side rebalance prepare, retry-with-buy and the auto-rebalance fan-out, while close, unwind, sell-only rebalance and direct withdraw stay open; regression-tested in `backend/tests/controls.test.ts`. Original finding: `prepare`
   (open) and retry-with-buy check `killSwitchActive()`, but
   `rebalanceService.prepareRebalance` has no such check, so an admin pause does
   not stop new buy-side rebalance preparation. This is the only Must-level
   behavioural gap found.
2. ~~**FE-04 — no CSP, no HSTS**~~ **PARTIALLY RESOLVED 2026-10-18** — CSP is
   injected at build with pinned origins, preview serves the security headers,
   and `server.ts` sets HSTS. **Still open:** `Access-Control-Allow-Origin: *`
   on every API response.
3. ~~**NFR-09 — no observability stack**~~ **PARTIALLY RESOLVED 2026-10-18** —
   `/v1/admin/metrics` exposes per-route latency samples and the NFR probe
   asserts `execution_id` traceability when an execution can be created; no
   OpenTelemetry/Sentry/structured logging yet.
4. **No WebSocket layer and no notification read surface**, so §10 streams and
   FR-18's user-visible delivery target are both absent.
5. ~~**Error-code taxonomy divergence from §10**~~ **RESOLVED 2026-10-18** — the canonical codes (`MESSAGE_TAMPERED`, `INVALID_SIGNATURE`, `PRICE_STALE`, `DUST_LEG`, `RELAYER_LOW`, `ALL_AGGREGATORS_DOWN`, `ELIGIBILITY_REQUIRED`, `ALREADY_TERMINAL`) are now in the taxonomy and emitted from the verification, price and health paths, with the legacy names retained as read-compatible aliases and mirrored in the frontend enum. Original finding: clients
   written against the PRD code list would not match.
6. ~~`isFunded()` exists but is never consulted during prepare~~ **RESOLVED 2026-10-18** — buy-side prepare now calls `assertPrepareHealth` and fails closed with `RELAYER_LOW` / `ALL_AGGREGATORS_DOWN`. Original finding: NFR-05
   degrade-closed is weaker than documented; `ALL_AGGREGATORS_DOWN`/`RELAYER_LOW`
   are not in the error taxonomy.
7. `FR-04` region gate is applied to `/quotes` and auth only, not to the three
   `prepare` money endpoints.
8. **Rate-limit keying deviates from §10:** limits are keyed on `routeId + client
   IP` (`middleware.ts`), not per wallet, and the PRD's specific budgets (20
   prepares / wallet / 10 min, 600 reads / IP / min, 5 auth attempts / IP / min)
   are not the configured values.
9. **§14.3 chaos tooling is mostly present, not absent:** `KAIROS_CHAOS_*`
   supports forced leg failure, slow confirmation, forced quote expiry, stale
   price, and forced simulation failure, plus the admin market-closed toggle.
   Only "stop the indexer for 5 min" has no flag; "revoke embedded signing key"
   is blocked by there being no embedded signing key at all.
10. **§13.1 compliance surface is missing:** no age gate, and the footer's
    "Privacy Policy" link has no Terms of Service or Privacy Policy draft behind
    it.

## What should NOT change

Do not migrate to Next.js/Fastify/Drizzle/Redis/BullMQ to "match" the PRD's
illustrative stack. The PRD's contract is behavioural; the current
Bun/React/Postgres/Anchor stack passes 97 local tests and owns the invariants.
Record deviations, don't rewrite.

## Recommended next slices (devnet-only, dependency-ordered)

**Slice A — Must-level correctness + closed gate (no chain access needed).**
Gate `prepareRebalance` (and its auto-rebalance path) on the kill switch while
keeping close/unwind/withdraw open; consult relayer health in prepare and return
`RELAYER_LOW`/`ALL_AGGREGATORS_DOWN`; add the missing §10 error codes
(`MESSAGE_TAMPERED`, `PRICE_STALE`, `ALREADY_TERMINAL`, `ELIGIBILITY_REQUIRED`)
as aliases so clients can match; apply `geoCheck` to prepare endpoints. Add
regression tests for each.

**Slice B — Frontend truth + hardening.** Add CSP/HSTS and pinned origins; add a
dedicated `/executions/:id` status route with REST resync and `aria-live`; add
the Settings page (session, auto-rebalance policy, revoke, notification prefs);
remove browser-`localStorage` position/activity records; wire the authoritative
configured USDC mint into withdraw/portfolio.

**Slice C — devnet live gate (operator-gated).** Fund the relayer, deploy and
initialize the router with the synchronized ID, create test mints + real Raydium
CPMM state, then run the §14.5 matrix with captured signatures/slots/fees. Until
this exists, all UI and README language must keep saying "not verified".

**Slice D — Should/Could after the gate.** `/agent/simulate-graph` + a verified
SOL/S&P benchmark (unblocks FR-23/FR-26); annotation/checkpoint/incentive layer
(FR-27); WebSocket streams with `schema_version`/sequence; durable Labs
persistence + moderation (FR-25); embedded-wallet provider (FR-22); structured
logging + OpenTelemetry (NFR-09); token liquidity evidence (FR-03).

Slice A is the highest-value work that requires nothing from the operator.

## Delivery update — Slices B–E (2026-10-18, after this audit)

- **Slice B — backend coverage.** `tests/slice-b.test.ts`: per-wallet prepare
  budget (20 / wallet / 10 min), cursor pagination + registry filters, FR-26
  simulation endpoint. Dual-person publish approval enforced server-side
  (`ADMIN_APPROVER_TOKEN` + distinct actor ids, 503 when unconfigured).
  Backend suite: 76 → **118 pass, 0 fail**.
- **Slice C — frontend truth + config/stream surface.** `/settings` page
  (wallet, session revoke, auto-rebalance, notifications, cluster),
  wrong-cluster `ClusterBanner`, FE-04 CSP injected at build, positions and
  activity served from `/v1/positions` + `/v1/executions` instead of
  `localStorage`; backend side adds `/v1/config`, `/v1/notifications` and the
  `/v1/stream/*` contract (sequence + `schema_version` + resync) covered by
  `tests/slice-c.test.ts`.
- **Slice D — NFR harness.** `bun run --cwd backend nfr` (`scripts/nfr-probe.ts`) measures
  read/prepare p95 and checks execution traceability with explicit
  pass / fail / blocked verdicts (exit 1 on fail, 2 when blocked). **NFR-02
  measures pass (199.8 ms p95)** after catalog reads were batched to 2 round
  trips; NFR-01 stays honestly blocked until devnet init. Scripts typecheck
  under an explicit `tsc` invocation (they sit outside the tsconfig include).
- **Slice E — devnet acceptance runner.** `bun run --cwd backend acceptance`
  (`scripts/acceptance-devnet.ts`) reports 2 pass / 4 blocked / 0 fail and
  names the operator action per blocker (fund relayer, deploy router,
  `bun run setup`, `SWAP_BUILDER=program`), exiting non-zero while anything is
  blocked or failed — still 0 / 12 live §14.5 items claimed.

Verification for this update: backend 118 pass / 3 skip / 0 fail, frontend
21 pass / 1 skip, `bun --cwd frontend build` green (typecheck + CSP transform),
dev-server smoke `GET /` → 200.
