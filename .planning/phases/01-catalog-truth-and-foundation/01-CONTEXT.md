---
phase: 01-catalog-truth-and-foundation
status: discussed
date: 2026-10-17
---

# Phase 1 Context

## Domain

Catalog truth and foundation: visitors must see the backend's published basket identity, immutable composition, version history, and honest performance-data availability. This phase does not add new trading capabilities or community publishing.

## Locked decisions

### Catalog source of truth

- The backend PostgreSQL catalog, published basket version, token registry, and devnet configuration are authoritative.
- The frontend must not use a second static basket definition for identity, composition, weights, mints, or performance claims.
- A basket detail response must expose the active version and its exact legs; version history remains read-only after publication.

### Publication and validation

- A published version is append-only. Any change creates the next sequential version; existing version rows and legs are not updated in place.
- Publication validation remains service-level and database-enforced: 1–10 unique active registry mints, positive integer weights, and an exact 10,000 bps sum.
- Denylisted, unknown, halted, and otherwise ineligible tokens cannot appear in a published version or quote.
- Liquidity evidence is a release prerequisite for production publication. Until that evidence exists, the catalog must fail closed or explicitly mark the token as not publishable rather than silently treating a registry price as liquidity proof.

### Performance and historical data

- Only verified provider snapshots (Pyth or Chainlink) may feed historical performance.
- Missing or insufficient history renders an explicit unavailable state with the exclusion reason; no random walk, copied basket history, fixed benchmark, or fabricated return is allowed.
- Every available series is labeled hypothetical and includes its methodology and limitations.
- A benchmark is shown only after verified benchmark snapshots are configured. A missing SOL/S&P 500 benchmark stays unavailable.

### Devnet presentation

- The devnet/test-data banner remains visible throughout the user-facing app.
- Devnet registry rates are clearly labeled indicative/test data and are not presented as live market prices.
- Labs/UGC ideas remain browser-local and explicitly labeled as not connected to community publishing; UGC moderation/voting is outside this phase.

## Acceptance focus

- Catalog and detail screens render only backend basket/version data.
- Published-version history is immutable and verifiable by its stored registry hash/transaction when present.
- Invalid weight sums, duplicate/unknown/denylisted mints, and unavailable history are rejected or rendered honestly.
- The catalog has no hidden fallback to the removed static/random performance data.

## Codebase context

- Catalog routes: `backend/src/routes/catalog.routes.ts`
- Catalog persistence and version rows: `backend/src/db/repository.ts`, `backend/src/db/migrate.ts`
- Token/version publication checks: `backend/src/services/admin.service.ts`
- Historical data policy: `backend/src/services/backtest.service.ts`, `backend/src/services/pricing.service.ts`
- Frontend catalog mapping: `frontend/src/lib/baskets-data.ts`
- Basket detail and performance UI: `frontend/src/pages/MarketDetailpage.tsx`
- Devnet banner and wallet navigation: `frontend/src/components/layout/Header.tsx`
- Existing release constraints and known data gaps: `.planning/STATE.md`, `.planning/REQUIREMENTS.md`

## Canonical references

- `README.md`
- `docs/BACKEND_DELIVERY.md`
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `backend/src/db/migrate.ts`
- `backend/src/services/backtest.service.ts`
- `backend/src/services/admin.service.ts`

## Deferred ideas

- Labs server persistence, moderation, voting, comments, and promotion remain outside Phase 1.
- Simulation API, annotations, incentives, and benchmark ingestion are later roadmap work unless needed to prove the unavailable-state contract.
