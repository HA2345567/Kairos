---
phase: 01-catalog-truth-and-foundation
plan: 01
status: verified
requirements: [CAT-01, CAT-02, CAT-03, DATA-01]
---

# Phase 1 Plan: Catalog Integrity Guardrails

## Goal

Make published basket versions database-protected append-only records with exact weight totals and unique mints, while keeping seed/replay behavior idempotent and adding regression coverage.

## Task 1: Enforce published catalog invariants in PostgreSQL

**Files:**

- `backend/src/db/migrate.ts`
- `backend/src/db/repository.ts`

**Action:**

- Require positive leg weights and unique `(version_id, mint)` values.
- Add deferred database validation that each version has at least one leg and totals exactly 10,000 bps.
- Add append-only triggers for `basket_versions` and `basket_legs`.
- Change seed/replay version persistence so an existing version is not rewritten; immutable publication rejects duplicate version IDs.

**Verify:**

```xml
<automated>bun test tests/catalog-integrity.test.ts --timeout 30000</automated>
<fails_when>non-zero exit, any failed test, or the summary does not report 4 passing tests</fails_when>
```

```xml
<automated>bun backend/scripts/check-database.ts</automated>
<fails_when>non-zero exit or the migration check does not report a successful database connection</fails_when>
```

## Task 2: Preserve catalog behavior and release checks

**Files:**

- `backend/tests/catalog-integrity.test.ts`

**Action:**

- Cover invalid weight sums, duplicate mints, immutable replay, and direct SQL mutation attempts.
- Run the complete backend/frontend test and build commands to ensure the PostgreSQL migration guardrails do not regress execution or catalog behavior.

**Verify:**

```xml
<automated>bun run test</automated>
<fails_when>non-zero exit, any failed backend/frontend test, or a skipped test count changes unexpectedly without an explicit devnet-only explanation</fails_when>
```

```xml
<automated>bun run build</automated>
<fails_when>non-zero exit or either backend bundling or frontend production build fails</fails_when>
```

## Execution result

- Implemented and verified on 2026-10-17.
- Targeted catalog suite: 4 passed, 0 failed.
- Backend suite: 55 passed, 3 devnet-only skipped, 0 failed.
- Frontend suite: 20 passed, 1 live-simulation skipped, 0 failed.
- Backend typecheck, PostgreSQL migration check, and full production build passed.
- The backend suite intentionally prints injected outbox/receipt retry errors while proving recovery; the final result was still 0 failures.
- Live devnet acceptance remains outside this local plan because relayer funding and program deployment are still unavailable.
