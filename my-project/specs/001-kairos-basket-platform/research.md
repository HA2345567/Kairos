# Technical Research: Kairos Architecture & Integration Decisions

## 1. Swap-and-Distribute Router vs Vault Architecture

- **Vault Model (Rejected)**: Pooled user tokens inside Program Derived Addresses (PDAs) with vault share mints. Vulnerable to oracle exploits, liquidation cascades, and security drain risks. Creates regulatory custodial burden.
- **Router Model (Selected)**: Stateless CPI router. The user initiates a transaction containing deposit USDC. The program verifies allocations, executes Jupiter swaps per constituent leg, and deposits SPL tokens directly into the user's ATAs within the same transaction block. Zero pooled balance at rest.

## 2. Multi-Leg Transaction Size & Address Lookup Tables (ALTs)

- **Problem**: Solana legacy transactions are capped at 1232 bytes. Swapping across 4 constituent tokens involves user wallet, USDC ATA, 4 target ATAs, 4 token mints, DEX pool accounts, and Jupiter program IDs (>30 accounts), exceeding legacy transaction limits.
- **Solution**: Versioned Transactions (v0) combined with Address Lookup Tables (ALTs). An ALT stores frequently referenced accounts (USDC mint, Jupiter program, token mints, Sysvars), compressing account references from 32 bytes to 1 byte per key.

## 3. Jupiter CPI v6 Integration

- The router invokes Jupiter v6 swap via Cross-Program Invocation (CPI).
- Quotes are requested client-side via Jupiter Quote API (`https://quote-api.jup.ag/v6/quote`).
- The transaction builder parses the quote response into Jupiter swap instructions and packages them into the atomic transaction bundle.

## 4. Preflight Transaction Simulation

- Before prompting the user's wallet for signature, `@solana/web3.js` executes `connection.simulateTransaction(versionedTx)`.
- If any leg fails (due to slippage, insufficient liquidity, or rent-exemption bounds), the simulation error is displayed with a user-friendly explanation and signature is aborted.
