# Kairos — Backend & Core System: Delivery Notes (Oct 7, 2026)

**Deliverable:** non-custodial narrative-basket investing backend, devnet-first, per `Kairos — Backend & Core System PRD.md` (v2). Speckit feature: `specs/backend-core-system/` (spec / plan / contracts / tasks). **No frontend files touched.**

## Status: ✅ Built, compiling, tested; E2E accepted 11/11

| Layer | What ships |
|---|---|
| Store | `node:sqlite` durable DB (`backend/data/kairos.db`, WAL) — all PRD §5 tables + nonces/refresh/settings/jobs/outbox/fee_ledger/price_snapshots/rebalance_events; unique `(wallet_id, idempotency_key)`; weight CHECKs |
| Auth | SIWS nonce (single-use, persisted) → Ed25519 verify → HMAC JWT (15 min) + rotating refresh (7 d); rate limits; `REGION_BLOCKED` geo gate |
| Chain | RPC failover, deterministic devnet identities (mints/treasury/relayer re-derive identically every run), idempotent mint/ATA provisioning, **authority-controlled treasury mock swap** (PRD §11.1) with relayer fee-payer + treasury partial-sign + user-signs-last, real blockhashes |
| Execution | prepare (fee ix in leg 1 only, sha256 message hashes, 60 s expiry, idempotency, simulation gate) → submit (**byte-for-byte tamper rejection**, signature check, job enqueue) → async landing workers (confirm, per-leg statuses, `PARTIALLY_COMPLETED`, retry + unwind, fee ledger, outbox) |
| Portfolio | derived positions (on-chain balances × price), drift, 5-min reconciler → `MODIFIED` on external tampering; manual rebalance + close via the same pipeline; policy-gated auto-rebalance on version publish |
| Pricing | minute snapshot worker, quote guards (`QUOTE_STALE`, `PRICE_IMPACT_EXCEEDED`, `MARKET_CLOSED`), backtests 1W/1M/6M/1Y/3Y vs 8%/yr benchmark from 262,810 seeded snapshots |
| Ops | persisted global kill switch (<1 request to halt), admin publish (weight validation + 2-person approval record), token market-hours toggle, relayer/fund endpoints, typed error codes everywhere |
| On-chain program | `programs/kairos-router` (Anchor 0.30): `initialize_basket`, `swap_and_distribute_leg` (Raydium CPMM CPI + slippage check + event), `toggle_basket_status` (on-chain kill switch) — **compiles clean** (fixed an anchor-codegen path bug); `.so` build via `cargo-build-sbf` |
| Tests | `npm test` — 12 pass / 1 devnet-gated; `scripts/e2e-invest.ts` full acceptance driver |

## Verified live (evidence)
- Server `:3001`: health/auth/quotes/catalog/kill-switch/backtests all smoke-tested over HTTP.
- Quote math exact: $50 → 0.10 fee (20 bps) → 49.90 net → correct per-leg expected-out and min-out.
- **E2E acceptance: 11/11 PASS** (faucet → quote → prepare → idempotent replay → submit → duplicate-submit safe → landing `COMPLETED` → position derived $49.90 → close prepare → close submit → close landing).
- Chaos switches: forced leg failure, slow confirm, stale prices, market close — all wired.

## Environment constraint & the honest caveat
This machine's CPU (Pentium 4415U) **lacks AVX**, so no official validator build runs on it, and the devnet faucet was IP-limited (2 drips / 8 h) for the entire session; the faucet also asks AI agents not to automate it. Therefore the final send/confirm leg ran in **clearly-labelled simulation mode** (`KAIROS_SIMULATE_LANDING=1`, shown in `/health` and faucet responses, PRD §11.2 "test data" rule): transactions are *built, signed, and byte-verified for real*; only the RPC send/confirm is stubbed. Everything else — state machine, byte verification, idempotency, positions, fees, outbox, kill switch, reconciler — is the production code path.

**Flip to real devnet (one env var, no code changes):** fund the relayer `9rkNQS82BJefFGBX2FhM3zgv4AKQd7KmKEnfDaakwtKM` with ~2 devnet SOL (faucet.solana.com in a browser, or any wallet), then:
```bash
cd backend
npm run setup && npm run seed          # provisions the deterministic mints + treasury on devnet
KAIROS_E2E_WALLET=data/e2e-wallet.json npx tsx scripts/e2e-invest.ts
```
Deterministic identities mean the same addresses already registered in the DB and `devnet-state.json`.

## Runbook
```bash
cd backend
npm install
npm run setup     # devnet provisioning (idempotent, needs relayer SOL)
npm run seed      # registry + 6 baskets + 3y snapshots
npm start         # API on :3001
npm test          # unit + gated devnet E2E
npx tsx scripts/e2e-invest.ts   # full acceptance driver
```

## Known gaps (explicit)
1. Real-chain landing unproven until the relayer is funded (above) — everything up to the RPC send is verified.
2. Labs/UGC (PRD Phase 2) not built (schema stub only).
3. `programs/kairos-router` compiles; deployment + integration into the swap path is a next step (the devnet deliverable uses the treasury pattern per PRD §11.1).
4. Notification transport is the outbox + console (pluggable).
