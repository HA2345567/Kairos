# Tasks: Kairos End-to-End Solana Narrative Basket Platform

**Feature**: `001-kairos-basket-platform`
**Spec**: [specs/001-kairos-basket-platform/spec.md](file:///c:/Users/Harsh/Desktop/kairos/my-project/specs/001-kairos-basket-platform/spec.md)
**Plan**: [specs/001-kairos-basket-platform/plan.md](file:///c:/Users/Harsh/Desktop/kairos/my-project/specs/001-kairos-basket-platform/plan.md)

## Phase 1: Setup & Foundational Prerequisites

- [x] T001: Configure `.gitignore` to prevent secret leaks (`target/`, `.env`, `*-keypair.json`).
- [x] T002: Set up Helius/QuickNode RPC provider configuration with automatic devnet fallback.
- [x] T003: Define curated basket catalog in `frontend/src/lib/baskets-data.ts` (Tech & AI, DeFi, Political Alpha, Memes).
- [x] T004: Configure exact dark matte design system tokens in `frontend/src/index.css` and `foundation.css` (`#141414`, `#242424`, `#1A1A1A`, `#292929`, `#F5F5F5`).

## Phase 2: User Story 1 (P1) — Browse Curated Baskets & Details

- [x] T005: Implement `BasketCard` in `frontend/src/components/basket/BasketCard.tsx` using `@uiarc/card` with hover zoom, points pill, and return metric.
- [x] T006: Style `BasketCard` with exact colors (`#1A1A1A` surface, `#242424` hover, `#292929` border) and increased 425px height in `basket-card.css`.
- [x] T007: Build Markets catalog page (`/markets`) with category filtering pills and Grid/Table toggle views in `frontend/src/pages/Markets.tsx`.
- [x] T008: Implement Market Detail page (`/markets/:id`) with interactive allocation donut chart using `@uiarc/donut-chart` in `frontend/src/pages/MarketDetailpage.tsx`.
- [x] T009: Add constituent token breakdown cards with symbol, name, allocation %, and real-time USD price.

## Phase 3: User Story 2 (P1) — One-Click Non-Custodial Investment via Jupiter CPI

- [x] T010: Implement on-chain Anchor router program in `programs/kairos-router/src/lib.rs` with `initialize_basket` and `swap_leg` instructions.
- [x] T011: Build client-side Jupiter Quote resolver in `frontend/src/hooks/useJupiterQuote.ts` calculating deposit weight distribution per leg.
- [x] T012: Build atomic transaction assembler in `frontend/src/lib/solana-tx-builder.ts` creating idempotent recipient ATAs and Versioned Transactions (v0).
- [x] T013: Implement Address Lookup Table (ALT) manager in `scripts/alt-manager.ts` compressing account packet size under 1232 bytes limit.
- [x] T014: Implement preflight transaction simulation via `@solana/web3.js` in `InvestModal.tsx` before wallet signature.
- [x] T015: Connect Phantom and Solflare wallet adapter hooks in `frontend/src/components/wallet/SolanaProvider.tsx`.

## Phase 4: User Story 3 (P2) — Real-Time Portfolio & Positions Tracker

- [x] T016: Implement on-chain ATA token balance scanner in `frontend/src/hooks/useWalletTokenBalances.ts`.
- [x] T017: Build portfolio positions dashboard in `frontend/src/pages/Portfolio.tsx` displaying aggregated balance, individual token holdings, and PnL.
- [x] T018: Implement dark empty state with compass icon and "Explore baskets" navigation when wallet has no open positions.
- [x] T019: Add Transaction History drawer/modal displaying past swaps with links to Solana Explorer.

## Phase 5: User Story 4 (P3) — Community Labs & Ideation

- [x] T020: Build Labs page in `frontend/src/pages/Labs.tsx` with search bar and filter tabs (Trending, Top, New).
- [x] T021: Implement community idea creation modal with local persistence in `localStorage`.
- [x] T022: Implement upvote/downvote buttons with instant vote tally reflection.

## Phase 6: Verification & Quality Assurance

- [x] T023: Execute automated Vitest simulation test suite (`baskets_catalog.test.ts`, `jupiter_route.test.ts`, `swap_leg_unit.test.ts`).
- [x] T024: Validate production build with `bun run build` ensuring 0 compilation errors.
- [x] T025: Synchronize all code and Spec Kit artifacts with GitHub remote `master`.
