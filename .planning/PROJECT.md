# Kairos

## Objective

Deliver the v4.0 product as a non-custodial Solana devnet application. User assets remain in user-controlled wallets; the backend may prepare and relay transactions but must not custody keys or move funds without the required user or explicitly scoped delegated signature.

## Product constraints

- Devnet is the release target. Mainnet deployment is out of scope for this milestone.
- No pooled vaults, leverage, or custody.
- Performance must be labeled hypothetical and its source/methodology disclosed.
- Monetary values and transaction amounts must use integer base units at execution boundaries.
- Preserve the existing TypeScript web/backend and Anchor program unless a measured migration is required.

## Current milestone

v1.0 — Devnet product aligned to PRD v4.0.
