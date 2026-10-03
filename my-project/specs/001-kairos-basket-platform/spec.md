# Feature Specification: Kairos End-to-End Solana Narrative Basket Platform

**Feature Branch**: `001-kairos-basket-platform`
**Created**: 2026-10-04
**Status**: Specified
**Input**: "Build the non-custodial narrative basket investment platform on Solana end-to-end"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse Curated Baskets & Basket Details (Priority: P1)
As an investor, I want to explore curated thematic crypto baskets on Solana (e.g. AI Compute, Solana DeFi, Political Alpha, Memes) and view their historical performance, strategy thesis, and constituent token breakdowns.

**Why this priority**: Discoverability is the foundation of the platform. Users cannot invest without clear visibility into what tokens comprise each basket and their target allocation percentages.

**Independent Test**: Can browse `/markets`, filter by category, open `/markets/:id`, view the interactive allocation chart, constituent token cards, and real-time NAV without connecting a wallet.

**Acceptance Scenarios**:
1. **Given** the user lands on `/markets`, **When** the page loads, **Then** all 4–5 curated baskets render with their points multiplier badge, 1-year/all-time return, token avatar stack, and artwork.
2. **Given** a user clicks a basket card, **When** navigated to `/markets/:id`, **Then** the page displays the strategy thesis, live NAV chart, token allocation donut chart with percentage weights, and constituent token prices.

---

### User Story 2 - One-Click Non-Custodial Investment via Jupiter CPI (Priority: P1)
As a wallet holder, I want to invest a chosen amount of USDC into a curated basket with 1 click, having the transaction atomically swap into constituent tokens via Jupiter CPI and deliver them directly into my own Associated Token Accounts (ATAs).

**Why this priority**: This is the core protocol value proposition. Unlike pooled vaults, Kairos provides zero-custody, zero-drain risk, and native SPL ownership in a single transaction.

**Independent Test**: Connect Phantom or Solflare wallet, input 50 USDC on a basket, simulate transaction, sign, and verify constituent tokens land in the wallet's ATAs on Solana Explorer.

**Acceptance Scenarios**:
1. **Given** a connected wallet with USDC balance, **When** user enters deposit amount and clicks "Invest", **Then** the app requests quotes from Jupiter for each token leg according to weight percentages, computes required ATAs, and simulates the transaction block.
2. **Given** valid preflight simulation, **When** user signs the transaction, **Then** the transaction executes on-chain via the Kairos Router program using Jupiter CPI, creates any missing recipient ATAs, and distributes constituent tokens directly to the user's wallet.
3. **Given** a price swing during execution exceeding max slippage (e.g. 0.5%), **When** Jupiter swap fails, **Then** the entire transaction reverts atomically with zero fund loss.

---

### User Story 3 - Real-Time Portfolio & Positions Tracker (Priority: P2)
As an active investor, I want to monitor my open basket positions, tracking my total portfolio value, unrealized PnL, token balances, and investment history on Solana.

**Why this priority**: Investors need confirmation and ongoing monitoring of their assets after execution.

**Independent Test**: Navigate to `/positions` with a connected wallet; view aggregated portfolio balance, breakdown of held constituent tokens, and link to Solscan/Solana Explorer for transaction verification.

**Acceptance Scenarios**:
1. **Given** a wallet with held basket tokens, **When** user opens `/positions`, **Then** the dashboard displays total portfolio value in USD, individual token balances, and 24h PnL.
2. **Given** a wallet with 0 open positions, **When** user opens `/positions`, **Then** a sleek dark empty state displays with "Explore baskets" CTA.

---

### User Story 4 - Community Labs & Basket Ideation (Priority: P3)
As a community member, I want to pitch basket ideas, share market thesis, and vote on community baskets to surface new narratives for curation.

**Why this priority**: Community engagement drives viral narrative discovery and expands future basket listings.

**Independent Test**: Navigate to `/labs`, browse community ideas, submit a new basket thesis, and upvote existing ideas with local persistence and UI feedback.

---

## Edge Cases

- **Missing Recipient ATAs**: If the user's wallet does not already possess an ATA for a constituent token, the router transaction must prepend `createAssociatedTokenAccountIdempotent` instructions within the same atomic transaction packet.
- **Transaction Packet Size Limit**: Multi-leg swaps can exceed Solana's 1232-byte transaction packet limit. The system must utilize Versioned Transactions (v0) with Address Lookup Tables (ALTs) to fit up to 6 swap legs in a single block.
- **Slippage Excursion**: If volatility causes quote degradation beyond the user's configured slippage tolerance (default 0.5%), the swap leg must abort and revert the transaction to prevent bad fills.
- **Low Liquidity Route**: If Jupiter cannot find a route for a low-cap token, preflight validation must notify the user before transaction signature.

## Functional Requirements

- **FR-001**: System MUST provide 4–5 curated narrative baskets with immutable basket IDs and defined target percentage allocations.
- **FR-002**: System MUST integrate `@solana/wallet-adapter-react` supporting Phantom, Solflare, and Backpack wallets.
- **FR-003**: System MUST fetch real-time token prices and DEX routes via Jupiter Aggregator API (v6).
- **FR-004**: System MUST compile Versioned Transactions (v0) with Address Lookup Tables (ALTs) to support multi-leg atomic swaps.
- **FR-005**: System MUST execute swaps on-chain via the Kairos Router Anchor program using Jupiter CPI.
- **FR-006**: System MUST deliver swapped constituent tokens directly to the user's Associated Token Accounts (ATAs). Zero vault custody.
- **FR-007**: System MUST provide preflight transaction simulation via `@solana/web3.js` simulateTransaction before prompting wallet signature.
- **FR-008**: System MUST display token allocation donut chart and NAV performance history on the basket detail view.
- **FR-009**: System MUST read on-chain user SPL token balances to calculate live portfolio valuation and position breakdowns on `/positions`.
- **FR-010**: System MUST enforce dark matte design tokens (`#141414` background, `#242424` / `#1A1A1A` surfaces, `#292929` borders, `#F5F5F5` typography) across all routes.
- **FR-011**: System MUST include a Community Labs section (`/labs`) for community basket thesis pitching, search, and upvoting.
- **FR-012**: System MUST provide an internal Admin configuration interface (`/admin`) for updating basket weights and constituent token registries.

## Non-Functional Requirements

- **NFR-001 (Performance)**: Preflight quote generation across all basket legs must complete in < 800ms.
- **NFR-002 (Security)**: Program must have zero custody accounts; no admin withdrawal authority over user funds.
- **NFR-003 (RPC Reliability)**: System must use dedicated RPC endpoints (Helius or QuickNode) with automatic retry on 429 rate limit.
- **NFR-004 (Build Integrity)**: Frontend production bundle must build cleanly with 0 TypeScript or bundler errors.
