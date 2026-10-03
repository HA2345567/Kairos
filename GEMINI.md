# Kairos v1 — Solana Narrative Basket Platform

@./.agents/plugins/superpowers/GEMINI.md

## Project Vision & Scope
Non-custodial platform where users invest in curated crypto "narrative baskets" on Solana with 1-click directly into their own wallet — modeled after Cesto (https://cesto.co/).
- **Architecture Model:** Swap-and-distribute router model (NOT a vault).
- **Flow:** User deposits USDC -> swaps via Jupiter CPI into constituent tokens -> sent directly to user's Associated Token Accounts (ATAs).

## Tech Stack
- **On-chain:** Rust + Anchor (0.30.x+), SPL Token, Jupiter Aggregator CPI, Pyth Network SDK (price display only)
- **Backend:** Node.js v20 LTS + Fastify, PostgreSQL + Prisma ORM, `@solana/web3.js` + `@coral-xyz/anchor`
- **Frontend:** Next.js 14 / Vite React, Tailwind CSS, `@solana/wallet-adapter-react`, `@tanstack/react-query`, Recharts / Lightweight Charts
- **RPC:** Helius or QuickNode (never public Solana RPC)

## Strict Rules
- Scope: 4–5 curated baskets, basket detail, one-click invest, positions dashboard, internal admin config.
- Strictly OUT of scope: AI agents, auto-rebalancing, vaults/custody, multi-chain, leverage/lending.
- No mock data in final code paths (`// TODO: replace with real basket config` when pending).
