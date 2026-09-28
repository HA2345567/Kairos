# Architecture Specification: Kairos Devnet Demo (1 Basket, 2 Tokens, Phantom)

- **Date:** 2026-09-28
- **Status:** Approved
- **Network:** Solana Devnet
- **Wallet Support:** Phantom (Devnet)

---

## 1. Executive Summary & Scope Lock

The goal is to deliver a rock-solid, production-grade Solana Devnet demo for Kairos where a judge or user connects Phantom, invests devnet USDC into a single curated narrative basket (50/50 `tJUP` and `tJTO`), and receives the constituent tokens directly into their own wallet in one atomic on-chain transaction.

### Scope Constraints
- **One Investable Basket:** "Solana Governance & Infra" (50% tJUP, 50% tJTO). All other catalog baskets are displayed with a disabled "Coming soon" button.
- **Zero Mock Swaps / Zero Hardcoded Data:** All quotes, reserves, pool states, balances, and NAV history are real on-chain reads or verified backend queries.
- **AMM Protocol on Devnet:** Raydium CPMM (`CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW`).
- **Wallet Path:** Phantom (Devnet).

---

## 2. On-Chain Architecture (`kairos_router`)

### 2.1 Program ID and Accounts
- **Program ID:** `KairosRouter...` (Anchor 0.30.x)
- **BasketConfig PDA:** `seeds = [b"basket", basket_id.as_bytes()]`
  ```rust
  #[account]
  pub struct BasketConfig {
      pub basket_id: String,       // max 32 chars
      pub name: String,            // max 64 chars
      pub manager: Pubkey,
      pub is_active: bool,
      pub items: [BasketItem; 2],  // fixed 2 constituents for demo
      pub bump: u8,
  }

  #[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
  pub struct BasketItem {
      pub mint: Pubkey,
      pub weight_bps: u16,        // e.g. 5000 = 50.00% (sum == 10000)
  }
  ```

### 2.2 Instructions
1. `initialize_basket`:
   - Validates that `items[0].weight_bps + items[1].weight_bps == 10000`.
   - Initializes `BasketConfig` account.
2. `swap_and_distribute_leg`:
   - **Account Validation:**
     - `user`: Signer.
     - `user_usdc_ata`: Owner == `user.key()`, Mint == Devnet USDC.
     - `user_dest_ata`: Owner == `user.key()`, Mint == `target_mint`.
     - Validates `target_mint` matches one of `basket_config.items`.
     - `basket_config`: Active, valid PDA.
   - **Raydium CPMM Fixed CPI:**
     - Target Program: `CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW`.
     - Snapshot `user_dest_ata.amount`.
     - Invoke Raydium CPMM instruction `swap_base_input(amount_in, min_amount_out)` with fixed account list:
       1. `payer` (user, signer, writable)
       2. `authority` (Raydium CPMM pool authority PDA)
       3. `amm_config`
       4. `pool_state` (writable)
       5. `input_token_account` (user_usdc_ata, writable)
       6. `output_token_account` (user_dest_ata, writable)
       7. `input_vault` (pool USDC vault, writable)
       8. `output_vault` (pool destination token vault, writable)
       9. `input_token_program` (SPL Token)
       10. `output_token_program` (SPL Token)
       11. `observation_state` (writable)
   - **Slippage Assertion:**
     - Reload `user_dest_ata`.
     - Require `amount_after - amount_before >= min_amount_out`.
   - **Event Emission:**
     - Emits `InvestLegExecuted { user, basket_id, target_mint, amount_in_usdc, amount_out }`.

---

## 3. Devnet Assets & Pools Setup

1. **Tokens:**
   - Devnet USDC: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Circle Devnet) or fallback test USDC mint if faucet dry.
   - Test Token A (`tJUP`): 6 decimals.
   - Test Token B (`tJTO`): 9 decimals.
2. **Raydium CPMM Pools:**
   - Pool 1: `USDC / tJUP` initialized with price ~ $0.85 per tJUP.
   - Pool 2: `USDC / tJTO` initialized with price ~ $2.30 per tJTO.
   - Sufficient depth seeded so $1–$100 trades have <0.5% impact.
3. **Shared Config (`shared/devnet-config.json`):**
   - Single source of truth consumed by backend, frontend, and scripts:
     - `cluster`: `"devnet"`
     - `programId`: Anchor router program ID
     - `basketId`: `"solana-infra-governance"`
     - `mints`: `{ usdc, tJUP, tJTO }`
     - `pools`: `{ tJUP: { poolId, ammConfig, authority, vaults, observation }, tJTO: { ... } }`

---

## 4. Backend Service Specifications

- **Server:** Fastify on port 3001.
- **Endpoints:**
  1. `GET /api/baskets`: Returns list of curated baskets; marks demo basket as `isInvestable: true`, others as disabled/`comingSoon: true`.
  2. `GET /api/baskets/:id`: Returns full metadata, constituents, weights, pool configs.
  3. `GET /api/baskets/:id/nav-history`: Returns historical NAV array `[{ timestamp, navValue }]`. If empty, returns HTTP 404 with standard error body.
  4. `POST /api/quotes`:
     - Input: `{ basketId: string, usdcAmount: number, slippageBps?: number }` (default 50 bps).
     - Query live reserves of both Raydium pools on-chain.
     - Calculate constant-product swap curves:
       - $dx_i = \text{usdcAmount} \times \text{weightBps}_i / 10000$
       - $dy_i = \text{calculate\_swap\_out}(dx_i, \text{reserves})$
       - $\text{min\_amount\_out}_i = dy_i \times (1 - \text{slippage})$
     - Returns quote with expiration timestamp (30s).
  5. `POST /api/investments/record`:
     - Input: `{ basketId: string, wallet: string, txSignature: string, usdcAmount: number }`.
     - Validates transaction on-chain via `@solana/web3.js`:
       - Confirmed/finalized status without errors.
       - Signed by `wallet`.
       - Invoked `kairos_router`.
     - Saves record to Prisma database.
  6. `GET /api/positions/:wallet`:
     - Returns recorded positions and live on-chain balances for `tJUP`, `tJTO`, and `USDC`.

---

## 5. Frontend Client Specifications

- **Vite + React 18 + TypeScript + Tailwind CSS**
- **Catalog & Detail (`Markets.tsx`, `MarketDetailpage.tsx`):**
  - Read directly from `/api/baskets` and `/api/baskets/:id`.
  - Sparklines and returns rendered from `/api/baskets/:id/nav-history` (honest "No data yet" when 404).
  - Only the demo basket has active "Invest" button.
- **Invest Modal (`InvestModal.tsx`):**
  - Live quote fetching via `/api/quotes` with 30s timer and auto-refresh.
  - Constructs `VersionedTransaction` (`v0`):
    - Instruction 0: Idempotent ATA creation for `tJUP` (if needed).
    - Instruction 1: Idempotent ATA creation for `tJTO` (if needed).
    - Instruction 2: `swap_and_distribute_leg` (tJUP).
    - Instruction 3: `swap_and_distribute_leg` (tJTO).
  - Preflight simulation via `connection.simulateTransaction`: surfaces any on-chain error before prompting wallet.
  - Submits to Phantom -> Confirms -> Records via backend -> Shows Success Modal with Solana Explorer link.
  - One-click retry on blockhash expiry with fresh quote.
- **Portfolio (`Portfolio.tsx`):**
  - Real SOL and SPL token balances query.
  - Real activity list populated from backend investment history.
  - Devnet badge and faucet links for test SOL and test USDC.

---

## 6. Demo Hardening & Verification Protocol

1. **Preflight Health Script (`scripts/preflight.ts`):**
   - Automatically checks and outputs `[PASS/FAIL]` for:
     - Primary RPC connectivity & Devnet cluster check.
     - Secondary RPC connectivity fallback.
     - Anchor Router Program deployed.
     - Demo Basket PDA initialized and active.
     - Raydium CPMM pools holding positive liquidity reserves.
     - Backend server alive (`GET /health`) and DB reachable.
     - Demo wallet SOL (> 0.1 SOL) and USDC (> 5 USDC).
2. **Production Build:**
   - Validated via `bun run build` / `vite build`.
3. **End-to-End Test Execution (Step 6):**
   - 5 independent investments executed through Phantom devnet with varying USDC amounts ($2, $5, $10, $20, $50).
   - Signatures, CU consumption, and token deltas recorded.
