# Kairos Protocol Constitution

## Core Principles

### I. 100% Non-Custodial Delivery (Stateless Router Architecture)
Kairos NEVER acts as a custodian, bank, or pooled fund. All investments execute via an atomic swap-and-distribute router model on Solana.
- Funds in: User deposits USDC in a single transaction.
- Jupiter CPI: Swaps are split and executed atomically across constituent tokens using Jupiter Aggregator CPI.
- Direct Delivery: Constituent SPL tokens are routed directly into the user's Associated Token Accounts (ATAs) within the same transaction block.
- Zero Vault Risk: No pooled vault PDAs, no withdrawal locks, no exchange counterparty credit risk.

### II. Test-First Rigor & Transaction Simulation (NON-NEGOTIABLE)
Because smart contract interactions and DEX aggregations involve irreversible on-chain value:
- Unit and integration tests must precede on-chain execution.
- All swaps and basket allocations must support preflight simulation via `@solana/web3.js` simulateTransaction before prompting user signature.
- Slippage limits (maximum 0.5% - 1.0%) must be enforced per swap leg to protect users from MEV sandwich attacks.

### III. Curated Narrative Simplicity (YAGNI & Scope Discipline)
Kairos focuses on curated, high-conviction thematic baskets on Solana (e.g. AI Compute, Solana DeFi, Political Stocks, Memes).
- Explicitly IN scope: 4–5 curated baskets, basket detail view with token allocation breakdowns, one-click invest, user positions tracker, internal admin config.
- Strictly OUT of scope: Autonomous AI trading agents, perpetual futures, lending/leverage, multi-chain bridges, automated portfolio rebalancing.

### IV. Production-Grade RPC & Network Resilience
- Public Solana RPC endpoints (`api.devnet.solana.com` or `api.mainnet-beta.solana.com`) are strictly forbidden in production and automated testing due to rate limits.
- Dedicated RPC providers (Helius or QuickNode) must be utilized with fallback failover.
- Versioned Transactions (v0) with Address Lookup Tables (ALTs) are required to accommodate multi-leg atomic swaps within Solana's 1232-byte transaction packet limit.

### V. Editorial Design Excellence & Transparent Observability
- Frontend follows modern dark matte aesthetics (`#141414` background, `#242424` / `#1A1A1A` surfaces, `#292929` borders, `#F5F5F5` typography) powered by `@uiarc` components with physical calm motion.
- Full transparency: Real-time on-chain transaction hashes, Jupiter routing hops, and price feeds displayed clearly to users with zero hidden spreads or fees.

## Technology Stack & Architecture Constraints

- **On-chain Program:** Rust, Anchor Framework (0.30.x+), SPL Token, Jupiter CPI (v6), Pyth Network SDK (price validation).
- **Backend Service:** Node.js v20 LTS, Fastify, PostgreSQL with Prisma ORM, `@solana/web3.js`, `@coral-xyz/anchor`.
- **Frontend Application:** Vite + React + TypeScript, Tailwind CSS, `@solana/wallet-adapter-react`, `@tanstack/react-query`, `@uiarc` foundation and components.
- **Data Integrity:** No mock data in final production code paths. Real Solana ATAs and Jupiter quotes only.

## Development Workflow & Quality Gates

1. **Pre-flight Checks:** Every PR or release must pass typechecks, linter checks, and automated Vitest suites.
2. **On-chain Verification:** Router instructions must be verified against Solana Devnet/Localnet using Anchor test suites before deploying to Mainnet-Beta.
3. **Secret Security:** Keypair JSONs, private keys, and RPC secret keys must never be committed to Git. Enforced by `.gitignore`.

## Governance

- The Kairos Protocol Constitution is the foundational governing document of the engineering and product team.
- Any change to the non-custodial router model or inclusion of custody mechanisms requires unanimous consensus and a major version increment.
- All implementation plans, specifications, and code tasks created under Spec Kit must conform to these principles.

**Version**: 1.0.0 | **Ratified**: 2026-10-04 | **Last Amended**: 2026-10-04
