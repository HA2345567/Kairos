# Kairos

## Normative contract

The versioned specification for this milestone is **[docs/PRD_V4.md](../docs/PRD_V4.md)**
(Kairos PRD v4.0). It is the source of truth for requirements; when code and this
planning directory disagree with it, the PRD wins and the difference is a gap to
record in **[docs/PRD_V4_COVERAGE_AUDIT.md](../docs/PRD_V4_COVERAGE_AUDIT.md)**.
Requirement IDs below (CAT/EXE/PORT/OPS/UI/DATA/SOL/REL) trace to its sections.

## Objective

Deliver the v4.0 product as a non-custodial Solana devnet application. User assets remain in user-controlled wallets; the backend may prepare and relay transactions but must not custody keys or move funds without the required user or explicitly scoped delegated signature.

## Product constraints

- Devnet is the release target. Mainnet deployment is out of scope for this milestone.
- No pooled vaults, leverage, or custody.
- Performance must be labeled hypothetical and its source/methodology disclosed.
- Monetary values and transaction amounts must use integer base units at execution boundaries.
- Preserve the existing TypeScript web/backend and Anchor program unless a measured migration is required.
- The PRD's illustrative stack (Next.js/Fastify/Drizzle/Redis/BullMQ) is not a requirement; recorded deviations are accepted as long as its behavioural and security sections hold. See the "Stack deviations recorded by the implementation" note in docs/PRD_V4.md §3.3.

## Current milestone

v1.0 — Devnet product aligned to PRD v4.0.
