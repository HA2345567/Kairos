# Implementation Plan: Kairos End-to-End Solana Narrative Basket Platform

**Branch**: `001-kairos-basket-platform` | **Date**: 2026-10-04 | **Spec**: [specs/001-kairos-basket-platform/spec.md](file:///c:/Users/Harsh/Desktop/kairos/my-project/specs/001-kairos-basket-platform/spec.md)

**Input**: Feature specification from `specs/001-kairos-basket-platform/spec.md`

## Summary

Build and verify the full-stack Kairos platform: an atomic swap-and-distribute thematic router on Solana. Users deposit USDC, which routes via Jupiter Aggregator CPI into constituent tokens delivered directly to their Associated Token Accounts (ATAs). Frontend delivers an editorial dark matte experience using `@uiarc` motion components.

## Technical Context

- **Language/Version**: Rust 1.79+ (Anchor 0.30.2), TypeScript 5.8+, Node.js v20 LTS
- **Primary Dependencies**:
  - On-chain: `anchor-lang`, `anchor-spl`, `jupiter-cpi` (v6), `solana-program`
  - Backend: `fastify`, `@prisma/client`, `@solana/web3.js`, `@coral-xyz/anchor`
  - Frontend: `vite`, `react 18`, `@solana/wallet-adapter-react`, `@uiarc/card`, `@uiarc/button`, `@uiarc/donut-chart`, `motion`, `tailwind-merge`
- **Storage**: PostgreSQL + Prisma ORM (baskets, pricing history, transaction logs); on-chain stateless router PDAs
- **Testing**: `cargo test`, `anchor test`, `vitest` (frontend & unit tests)
- **Target Platform**: Solana Devnet & Mainnet-Beta; Web browsers (Chrome, Brave, Safari)
- **Project Type**: Full-stack Solana dApp (On-chain Anchor Router + Fastify Backend + Vite Frontend)
- **Performance Goals**: Quote resolution < 800ms; sub-second atomic transaction block execution
- **Constraints**: Stateless router model (zero vault custody); Versioned Tx v0 within 1232 bytes packet limit; Max 0.5% - 1.0% slippage per leg

## Constitution Check

- **I. 100% Non-Custodial Delivery**: PASS. The Anchor router does not hold user balances. Tokens route directly to user ATAs.
- **II. Test-First Rigor & Simulation**: PASS. Transaction simulation before wallet sign; automated unit and integration tests.
- **III. Curated Narrative Simplicity**: PASS. Focused strictly on 4–5 curated narrative baskets, basket detail, one-click invest, and positions dashboard.
- **IV. Production-Grade RPC & Network Resilience**: PASS. Helius/QuickNode RPC; Versioned Transactions v0 with Address Lookup Tables (ALTs).
- **V. Editorial Design Excellence**: PASS. Dark matte palette (`#141414`, `#242424`, `#1A1A1A`, `#292929`, `#F5F5F5`) with `@uiarc` components.

## Project Structure

### Documentation (this feature)

```text
my-project/specs/001-kairos-basket-platform/
├── spec.md              # Feature specification
├── plan.md              # Implementation plan (this file)
├── research.md          # Phase 0: Technical research & Jupiter CPI decisions
├── data-model.md        # Phase 1: On-chain accounts, Prisma models, frontend types
├── quickstart.md        # Phase 1: Devnet deployment & test instructions
└── tasks.md             # Phase 2: Actionable step-by-step task breakdown
```

### Source Code Architecture

```text
programs/kairos-router/     # Anchor on-chain router program
├── src/
│   ├── instructions/       # initialize_basket, swap_leg, invest_basket
│   ├── errors.rs           # Program error codes
│   ├── state.rs            # Basket and routing state
│   └── lib.rs              # Program entrypoint

backend/                    # Fastify API & indexing service
├── prisma/schema.prisma    # Basket, Token, NAV history schema
├── src/                    # Routes, Jupiter quote proxies, sync workers

frontend/                   # Vite + React web application
├── src/
│   ├── components/         # Arc components (card, button, donut-chart), layout
│   ├── lib/                # solana-tx-builder, baskets-data, api
│   ├── pages/              # Index, Markets, MarketDetailpage, Portfolio, Labs
│   └── test/               # Vitest simulation & unit tests
```
