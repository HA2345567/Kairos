# Kairos Devnet Demo (1 Basket, 2 Tokens, Phantom) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a flawless Solana Devnet demo where a user connects Phantom, invests devnet USDC into the "Solana Governance & Infra" basket (50% tJUP, 50% tJTO), and receives both tokens into their wallet via a single atomic on-chain transaction with 100% real on-chain quotes, reserves, and balances.

**Architecture:** Anchor router executes an atomic v0 transaction with idempotent ATA creation and CPI into Raydium CPMM (`CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW`). Fastify backend calculates exact live quotes and verifies on-chain transaction proofs. Vite frontend displays live market data, simulates transactions pre-flight, and interfaces directly with Phantom.

**Tech Stack:** Rust / Anchor 0.30.1, Raydium CPMM devnet, `@solana/web3.js` v1.x, `@solana/spl-token`, Fastify, Prisma, Vite, React 18, `@tanstack/react-query`, Tailwind CSS, Phantom Wallet Adapter.

**Spec:** `docs/superpowers/specs/2026-09-28-devnet-demo-design.md`

## Global Constraints
- Target Network: Solana Devnet (`https://api.devnet.solana.com` or custom Helius/QuickNode devnet RPC).
- AMM Devnet Program ID: `CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW` (Raydium CPMM).
- Scope: Exactly ONE investable basket ("Solana Governance & Infra"), TWO tokens (50/50 `tJUP`/`tJTO`). Other baskets disabled with "Coming soon".
- Strict rule: No mock swaps, no hardcoded balances, no fake history. Honest empty states on 404/empty.
- Configuration: Single source of truth in `shared/devnet-config.json` and environment variables.

## Review Focus
1. User ATA missing before swap: Prepend `createAssociatedTokenAccountIdempotentInstruction` so tx never fails on uninitialized ATA.
2. Pool slippage / Price impact: Ensure test pools are seeded with sufficient liquidity ($500+ USDC equivalent) so $1–$100 swaps experience <0.5% impact.
3. Simulation failure handling: `connection.simulateTransaction` must intercept failures and surface the decoded error log in the UI before prompt.
4. Blockhash expiry: Provide one-click idempotent retry with refreshed quote and new blockhash.
5. Faucet insufficiency: Detect low devnet SOL (<0.05 SOL) or low USDC (<$1) with friendly action banners and faucet links.

---

### Task 1: Devnet Assets, Raydium CPMM Pools & Shared Config

**Files:**
- Create: `scripts/setup-devnet-pools.ts`
- Create: `shared/devnet-config.json`
- Test: `scripts/test-pool-swap.ts`

**Interfaces:**
- Consumes: Solana devnet CLI / RPC connection, deployer keypair.
- Produces: `shared/devnet-config.json` containing `cluster`, `programId`, `mints: { usdc, tJUP, tJTO }`, and `pools: { tJUP, tJTO }`.

- [ ] **Step 1: Write pool swap verification test script `scripts/test-pool-swap.ts`**
  Asserts that a swap of 1 USDC against the Raydium CPMM pool returns > 0 output tokens and logs the transaction signature.
- [ ] **Step 2: Run `test-pool-swap.ts` to verify it fails**
  Expected: FAIL (missing mints and pool addresses in `shared/devnet-config.json`).
- [ ] **Step 3: Implement `scripts/setup-devnet-pools.ts`**
  Creates test mints for `tJUP` (6 decimals) and `tJTO` (9 decimals) if not already created, mints initial supply, initializes Raydium CPMM pools with Devnet USDC, seeds deep liquidity (~$0.85/tJUP, ~$2.30/tJTO), and writes `shared/devnet-config.json`.
- [ ] **Step 4: Execute pool setup on devnet & run `test-pool-swap.ts`**
  Expected: PASS with verified transaction signatures on Solana Devnet Explorer.
- [ ] **Step 5: Commit**
  ```bash
  git add shared/ scripts/
  git commit -m "feat: setup devnet mints, raydium cpmm pools, and verify standalone swap"
  ```

---

### Task 2: Anchor Router Program & On-Chain Devnet Deployment

**Files:**
- Modify: `programs/kairos-router/src/lib.rs`
- Modify: `programs/kairos-router/src/instructions/initialize_basket.rs`
- Modify: `programs/kairos-router/src/instructions/swap_leg.rs`
- Modify: `programs/kairos-router/src/state.rs`
- Modify: `programs/kairos-router/src/errors.rs`
- Create: `tests/kairos-router.ts`

**Interfaces:**
- Consumes: `shared/devnet-config.json`, Raydium CPMM Devnet Program ID `CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW`.
- Produces: Deployed program ID on devnet, exported IDL in `shared/idl/kairos_router.json`, initialized `BasketConfig` PDA.

- [ ] **Step 1: Write Anchor integration test `tests/kairos-router.ts`**
  Tests:
  1. `initialize_basket` success (weights sum to 10000).
  2. `initialize_basket` rejection when weights do not sum to 10000.
  3. `swap_and_distribute_leg` success with balance increase delta >= min_amount_out.
  4. `swap_and_distribute_leg` rejection when min_amount_out is impossibly high (slippage exceeded).
  5. `swap_and_distribute_leg` rejection if ATA owner != user signer.
- [ ] **Step 2: Run anchor test in WSL to verify it fails**
  Expected: FAIL on outdated Jupiter references.
- [ ] **Step 3: Implement Raydium CPMM CPI in `swap_leg.rs`**
  - Implement fixed 11 accounts validation: `payer`, `authority`, `amm_config`, `pool_state`, `input_token_account`, `output_token_account`, `input_vault`, `output_vault`, `input_token_program`, `output_token_program`, `observation_state`.
  - Validate ATA ownership: `user_usdc_ata.owner == user.key()`, `user_dest_ata.owner == user.key()`.
  - Check `target_mint` belongs to basket constituents.
  - Snapshot `user_dest_ata.amount`.
  - Invoke Raydium CPMM `swap_base_input`.
  - Reload `user_dest_ata` and require `amount_after - amount_before >= min_amount_out`.
  - Emit `InvestLegExecuted`.
- [ ] **Step 4: Build and test in WSL**
  Run: `anchor test` or `anchor build`.
  Expected: PASS.
- [ ] **Step 5: Deploy to Devnet & Initialize Demo Basket**
  Deploy using devnet keypair, initialize `solana-infra-governance` PDA with `tJUP` (5000 bps) and `tJTO` (5000 bps), export IDL to `shared/idl/kairos_router.json`, and update `shared/devnet-config.json`.
- [ ] **Step 6: Commit**
  ```bash
  git add programs/ tests/ shared/
  git commit -m "feat: implement raydium cpmm cpi in anchor program and deploy to devnet"
  ```

---

### Task 3: Backend Services & API Endpoints

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/server.ts`
- Create: `backend/src/services/quoteService.ts`
- Create: `backend/src/services/investmentService.ts`
- Create: `backend/src/test/api.test.ts`

**Interfaces:**
- Consumes: `shared/devnet-config.json`, Solana Devnet RPC.
- Produces:
  - `GET /api/baskets`
  - `GET /api/baskets/:id`
  - `GET /api/baskets/:id/nav-history` (returns 404 when empty)
  - `POST /api/quotes`
  - `POST /api/investments/record`
  - `GET /api/positions/:wallet`

- [ ] **Step 1: Write backend API tests in `backend/src/test/api.test.ts`**
  Tests `/api/baskets`, `/api/quotes` (verifies live math and expiresAt), `/api/investments/record` (verifies tx on-chain check), and 404 response for non-existent NAV history.
- [ ] **Step 2: Run test to verify it fails**
  Expected: FAIL (endpoints missing or returning mock data).
- [ ] **Step 3: Implement `backend/src/services/quoteService.ts`**
  Queries on-chain reserves of both Raydium pools; computes constant-product swap output $dy = \frac{y \cdot dx}{x + dx}$ adjusted for fees; calculates `minAmountOut` with 0.5% slippage; returns quote with 30s TTL.
- [ ] **Step 4: Implement `backend/src/services/investmentService.ts` and endpoints in `server.ts`**
  - Seed DB with the demo basket marked `isInvestable: true`, and others marked `comingSoon: true`.
  - In `POST /api/investments/record`: fetch transaction from RPC with `getParsedTransaction`, assert success, assert wallet signed, assert `kairos_router` program ID invoked, store investment record.
  - In `GET /api/positions/:wallet`: return investment records + live token balances.
- [ ] **Step 5: Run tests and verify all pass**
  Run: `bun test backend/src/test/api.test.ts`
  Expected: PASS.
- [ ] **Step 6: Commit**
  ```bash
  git add backend/
  git commit -m "feat: implement live quotes, on-chain investment verification, and positions API"
  ```

---

### Task 4: Frontend Client Wiring & Phantom Wallet Integration

**Files:**
- Modify: `frontend/src/components/basket/InvestModal.tsx`
- Modify: `frontend/src/pages/Markets.tsx`
- Modify: `frontend/src/pages/MarketDetailpage.tsx`
- Modify: `frontend/src/pages/Portfolio.tsx`
- Create: `frontend/src/lib/solana-tx-builder.ts`
- Modify: `frontend/src/lib/baskets-data.ts`

**Interfaces:**
- Consumes: Backend `/api/baskets`, `/api/quotes`, `/api/investments/record`, `/api/positions/:wallet`, `@solana/wallet-adapter-react`.
- Produces: Interactive Invest modal with v0 tx simulation, Phantom signing, live confirmation, and Portfolio reflection.

- [ ] **Step 1: Write unit test for `solana-tx-builder.ts`**
  Verifies construction of `VersionedTransaction` (v0) with ATA instructions and 2 `swap_and_distribute_leg` instructions.
- [ ] **Step 2: Run test to verify it fails**
  Expected: FAIL (`solana-tx-builder.ts` not implemented).
- [ ] **Step 3: Implement `frontend/src/lib/solana-tx-builder.ts`**
  Builds v0 message with latest blockhash, checks for user ATAs (adds createIdempotent instructions if missing), and compiles the two swap instructions using Anchor IDL and Raydium account metas.
- [ ] **Step 4: Wire `InvestModal.tsx`**
  - Remove all mock signatures and mock timers.
  - Query live quote from backend.
  - Run `connection.simulateTransaction(v0Tx)`. If simulation fails, display clear alert banner with the error log and abort before prompting wallet.
  - Call `sendTransaction(v0Tx, connection)`.
  - Await confirmation with `confirmTransaction`.
  - Post to `/api/investments/record`.
  - Display success dialog with Solana Explorer link (`cluster=devnet`).
- [ ] **Step 5: Wire `Markets.tsx`, `MarketDetailpage.tsx`, and `Portfolio.tsx`**
  - Display "Coming soon" on disabled invest buttons for all baskets except the demo basket.
  - Handle NAV 404 honestly: display "No data yet".
  - Add visible "Devnet, test tokens" header badge.
  - In `Portfolio.tsx`, show real devnet SOL balance, real USDC, `tJUP`, and `tJTO` token balances, and real activity from `/api/positions/:wallet`.
- [ ] **Step 6: Run frontend tests & build check**
  Run: `bun run build` in `frontend/`
  Expected: Build succeeds with 0 errors.
- [ ] **Step 7: Commit**
  ```bash
  git add frontend/
  git commit -m "feat: wire live devnet investment flow, v0 tx builder, and phantom portfolio"
  ```

---

### Task 5: Demo Hardening & Preflight Diagnostic Tool

**Files:**
- Create: `scripts/preflight.ts`
- Modify: `frontend/src/components/basket/InvestModal.tsx` (retry logic & RPC failover)
- Modify: `backend/.env` / `frontend/.env`

**Interfaces:**
- Consumes: Environment configuration, RPC endpoints, deployed contracts and pools.
- Produces: Preflight CLI report with PASS/FAIL for all critical criteria; resilient retry in UI.

- [ ] **Step 1: Implement `scripts/preflight.ts`**
  Runs assertions and prints colorized PASS/FAIL table for:
  1. Primary RPC reachable and cluster is Devnet.
  2. Secondary RPC fallback reachable.
  3. Kairos router program deployed.
  4. Demo basket PDA initialized & active.
  5. Raydium CPMM pools holding positive liquidity reserves.
  6. Backend server `/health` returns 200.
  7. Database has demo basket and NAV history.
  8. Demo test wallet has >= 0.1 SOL and >= $10 USDC.
- [ ] **Step 2: Run `preflight.ts` and verify outputs**
  Run: `bun run scripts/preflight.ts`
  Expected: PASS across all checks.
- [ ] **Step 3: Implement RPC failover & idempotent blockhash retry in frontend**
  If primary RPC fails to return a blockhash or drops, fallback to secondary RPC; if transaction expires before confirmation, provide 1-click "Retry Investment" with fresh quote.
- [ ] **Step 4: Verify production build and preview**
  Run: `cd frontend && bun run build && bun run preview --port 4173 &`
  Expected: Production bundle loads without console errors.
- [ ] **Step 5: Commit**
  ```bash
  git add scripts/ frontend/
  git commit -m "feat: add preflight diagnostics, rpc failover, and production build verification"
  ```

---

### Task 6: End-to-End Devnet Verification & Final Evidence Report

**Files:**
- Create: `scripts/e2e-invest-runner.ts`
- Create: `docs/superpowers/reports/devnet-demo-verification.md`

**Interfaces:**
- Consumes: Deployed system on devnet, test wallet, Phantom wallet.
- Produces: 5 verified on-chain investment transaction signatures, CU usage metrics, and final demo sign-off checklist.

- [ ] **Step 1: Implement `scripts/e2e-invest-runner.ts`**
  Executes 5 sequential real investments ($2, $5, $10, $20, $50 USDC) directly against devnet RPC using the exact transaction builder logic used by the frontend.
- [ ] **Step 2: Run E2E investments and gather signatures**
  Execute all 5 transactions, record signatures, confirmed slots, and CU consumed per tx.
- [ ] **Step 3: Verify token balances and portfolio consistency**
  Assert that user destination ATAs received `tJUP` and `tJTO` matching the quotes within slippage.
- [ ] **Step 4: Generate Verification Report `docs/superpowers/reports/devnet-demo-verification.md`**
  Documents:
  - Preflight output log.
  - The 5 transaction signatures with Explorer links.
  - Compute units consumed per transaction.
  - Demo Moments checklist: Markets catalog -> Phantom connect -> InvestModal simulation & sign -> Solana Explorer atomic verification -> Portfolio real balances.
- [ ] **Step 5: Commit**
  ```bash
  git add scripts/ docs/
  git commit -m "docs: generate end-to-end devnet demo verification report with on-chain signatures"
  ```
