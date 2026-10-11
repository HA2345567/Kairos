<div align="center">

# 🏛️ KAIROS — Non-Custodial Thematic Investment Router on Solana

[![Solana](https://img.shields.io/badge/Solana-Mainnet_%26_Devnet-9945FF?style=for-the-badge&logo=solana&logoColor=white)](https://solana.com)
[![Jupiter](https://img.shields.io/badge/Powered_by-Jupiter_CPI-00D182?style=for-the-badge)](https://jup.ag)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

<br />

<p align="center">
  <img src="docs/assets/kairos-hero.png" alt="Kairos Platform Hero" width="100%" style="border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />
</p>

### *"Your Taste. Your Investment."*

**Curated high-conviction token baskets executed via Jupiter CPI.**  
**Constituent tokens land directly in your own wallet — zero vaults, zero custody, zero lockups.**

---

</div>

## 📖 Executive Summary

Navigating decentralized finance and crypto markets requires managing dozens of volatile assets across isolated protocols. Traditional index products force users into synthetic vault contracts, introducing liquidation risk, manager lockups, and smart contract counterparty exposure.

**Kairos** pioneers non-custodial thematic investing on Solana:
- **Zero Custody**: You never deposit assets into an opaque custodial pool. In a single atomic transaction, SOL or USDC is routed through Jupiter CPI and split according to target basket allocations.
- **Direct Wallet Ownership**: Every underlying token lands straight into your self-custodial wallet (Phantom, Solflare, Backpack).
- **Instant Liquidity**: Exit or rebalance any token anytime on any DEX without redemption queues or platform dependencies.
- **Institutional-Grade Analytics**: Real-time NAV computation, candlestick charting with technical indicators (SMA/EMA), alpha tracking against BTC and SOL benchmarks, and downloadable audit ledgers.

---

## ⚡ Key Architectural Features

```
                      ┌───────────────────────────────────────┐
                      │             KAIROS CLIENT             │
                      │   (React + Solana Wallet Adapter)     │
                      └──────────────────┬────────────────────┘
                                         │ 1. Select Basket & Allocation
                                         ▼
                      ┌───────────────────────────────────────┐
                      │          FASTIFY BACKEND API          │
                      │    (Real-Time Feeds & Quoting Engine) │
                      └───────┬───────────────────────┬───────┘
                              │                       │
           2. DexScreener Live│                       │ 3. Optimal Multi-Route
              Pricing & NAV   │                       │    Quote Construction
                              ▼                       ▼
                      ┌──────────────┐        ┌───────────────┐
                      │  DexScreener │        │  Jupiter API  │
                      └──────────────┘        └───────┬───────┘
                                                      │
                               4. Atomic Transaction Payload
                                                      ▼
                      ┌───────────────────────────────────────┐
                      │         SOLANA ANCHOR PROGRAM         │
                      │      (kairos-router / Jupiter CPI)    │
                      └──────────────────┬────────────────────┘
                                         │ 5. Atomic Execution & Token Distribution
                                         ▼
                      ┌───────────────────────────────────────┐
                      │          USER SOLANA WALLET           │
                      │  Tokens Received Directly & Instantly │
                      └───────────────────────────────────────┘
```

### 1. 🛡️ 100% Non-Custodial Architecture
Unlike legacy fund managers or synthetic index tokens that mint wrapped derivatives (e.g. Set Protocol), Kairos uses atomic swap splitting. If a basket contains `40% JUP`, `30% JTO`, and `30% PYTH`, your investment is atomically routed and deposited as native SPL tokens into your personal token accounts.

### 2. ⚡ Jupiter CPI Engine
Kairos integrates directly with Jupiter Aggregator via Cross-Program Invocation (CPI) and the Jupiter v6 Swap API to guarantee best-execution routing, sub-second execution speeds, and minimal slippage across all Solana automated market makers (Raydium, Orca, Whirlpools, Meteora).

### 3. 📊 Real-Time Technical Analysis Suite
Every curated basket features a comprehensive market analysis interface:
- **Interactive Candlestick & Area Charts**: Powered by TradingView Lightweight Charts with dynamic timeframe resolution (24H, 7D, 30D, 1Y, ALL).
- **Technical Indicators**: Toggleable Simple Moving Average (SMA 20) and Exponential Moving Average (EMA 50) overlays.
- **Benchmark Alpha Comparison**: Relative performance tracking against Solana ($SOL) and Bitcoin ($BTC).
- **Historical Ledger & CSV Export**: Complete historical Net Asset Value (NAV) ledgers with direct CSV export for accounting and tax reporting.

### 4. 🧪 Kairos Labs: Permissionless Basket Creation
Create, configure, and curate custom thematic indices in minutes. Define custom asset weights, target rebalance thresholds, theme metadata, and publish them to the community explorer.

---

## 🎯 Curated Thematic Baskets

| # | Basket Name | Focus Theme | Key Constituents | Target Strategy |
|---|-------------|-------------|------------------|-----------------|
| 1 | **Solana Culture & Memes** | Premier cultural liquidity | $BONK (40%), $WIF (35%), $POPCAT (25%) | High-beta consumer culture & community momentum |
| 2 | **Solana AI & Compute** | Decentralized compute & ML | $IO (35%), $RENDER (35%), $NOS (30%) | GPU clustering, distributed rendering & agentic AI |
| 3 | **Solana DePIN Infrastructure** | Physical decentralized networks | $HNT (40%), $MOBILE (30%), $HONEY (30%) | Decentralized telecoms, mapping & sensor grids |
| 4 | **Solana Infra Governance** | Core ecosystem protocols | $JUP (40%), $JTO (35%), $PYTH (25%) | Top-tier DeFi governance, MEV staking & oracles |
| 5 | **Solana Liquid Staking** | Yield-bearing staked SOL | $JitoSOL (40%), $mSOL (35%), $bSOL (25%) | MEV rewards + consensus staking compounding |
| 6 | **Solana DeFi Bluechips** | High-volume financial primitives | $RAY (40%), $ORCA (30%), $DRIFT (30%) | Concentrated liquidity, perpetuals & AMM trading |
| 7 | **Next-Gen Solana Layer 1s** | High-velocity interoperability | $PYTH (40%), $W (35%), $TNSR (25%) | Cross-chain messaging, data feeds & NFT tooling |
| 8 | **Solana Gaming & Metaverse** | Web3 gaming ecosystems | $ATLAS (40%), $AURY (35%), $SHDW (25%) | Decentralized storage & immersive virtual economies |
| 9 | **Stable Yield & RWA** | Low-volatility real world yields | $USDC (40%), $USDY (35%), $PYUSD (25%) | Tokenized treasuries and yield-generating stables |
| 10| **Solana Founders Conviction** | Anchor ecosystem leaders | $SOL (40%), $JUP (25%), $JTO (20%), $BONK (15%) | Core layer-1 momentum and proven liquidity anchors |

---

## 💻 Tech Stack

### Frontend Client
- **Framework**: [React 18](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + Custom Glassmorphism Theme
- **Solana Web3**: `@solana/web3.js`, `@solana/wallet-adapter-react`, `@solana/wallet-adapter-react-ui`
- **Charting**: [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/)
- **Icons & Motion**: Lucide React, Framer Motion

### Backend Engine
- **Framework**: [Fastify](https://fastify.dev/) (High-throughput Node.js / Bun server)
- **Language**: TypeScript
- **Database / Cache**: Prisma ORM, SQLite / PostgreSQL
- **Oracles & Price Aggregation**: DexScreener API, CoinGecko Pro, Pyth Network
- **Trading Aggregation**: Jupiter v6 Swap & Price APIs

### On-Chain Programs
- **Framework**: [Anchor Framework 0.30+](https://www.anchor-lang.com/)
- **Language**: Rust
- **Target**: Solana Sealevel Virtual Machine (SVM)

---

## 🚀 Quickstart & Local Development

### Prerequisites
- [Bun](https://bun.sh/) (v1.1+ recommended) or [Node.js](https://nodejs.org/) (v20+)
- [Rust & Cargo](https://rustup.rs/) (v1.75+)
- [Solana CLI](https://docs.solanalabs.com/cli/install) (v1.18+)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) (v0.30.0+)

---

### 1. Repository Setup

```bash
# Clone the repository
git clone https://github.com/HA2345567/Kairos.git
cd Kairos

# Install root dependencies
bun install
```

---

### 2. Frontend Development

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
bun install

# Configure environment variables
cp .env.example .env

# Start the Vite development server
bun dev
```

The frontend will be live at `http://localhost:8080`.

---

### 3. Backend Development Server

```bash
# Navigate to backend directory
cd backend

# Install dependencies
bun install

# Configure environment variables
cp .env.example .env

# Run database migrations
bun prisma migrate dev

# Start backend server
bun dev
```

The backend API will start at `http://localhost:3000`.

---

### 4. Solana Smart Program (Optional / Local Validator)

```bash
# Build the Anchor program
anchor build

# Run local program tests
anchor test
```

---

## 📂 Repository Structure

```
kairos/
├── backend/                  # Fastify REST API, price indexing & quoting engine
│   ├── src/
│   │   ├── routes/           # Baskets, prices, swaps, and analytics endpoints
│   │   ├── services/         # Jupiter quoting, DexScreener caching & ledger
│   │   └── config.ts         # Server configuration & environment validation
│   └── tests/                # Backend unit and integration test suite
│
├── frontend/                 # React 18 / Vite Web3 application
│   ├── public/               # Static brand assets, fonts, icons, banners
│   ├── src/
│   │   ├── components/       # UI components (Header, Footer, TechnicalChart)
│   │   │   ├── arc/          # Glassmorphic card and button foundations
│   │   │   ├── basket/       # InvestModal, HistoricalTabContent, Marquee
│   │   │   └── ui/           # Interactive 3D cylinder & carousel components
│   │   ├── hooks/            # useBasketNavHistory, useWalletPortfolio
│   │   ├── lib/              # baskets-data.ts, real-historical-nav.json
│   │   └── pages/            # Index, Markets, MarketDetailpage, Labs, Portfolio
│   └── tailwind.config.ts    # Design tokens, palette & typography
│
├── programs/                 # Solana Anchor programs
│   └── kairos-router/        # On-chain router for multi-token CPI distribution
│       ├── src/              # Rust instruction logic & account validation
│       └── Cargo.toml
│
├── docs/                     # Technical documentation & brand assets
│   ├── assets/               # Screenshots, banners, hero previews
│   ├── BACKEND_DELIVERY.md   # Backend architecture & schema reference
│   └── KEY_ROTATION.md       # Production key management & operational security
│
├── scripts/                  # Deployment, seeding, and maintenance utilities
├── Anchor.toml               # Anchor workspace configuration
└── README.md                 # Project documentation
```

---

## 🔐 Security & Non-Custodial Guarantee

1. **No Intermediary Custody**: Kairos smart contracts never hold custody of investor capital. Every swap instruction routes funds through Jupiter and sends output tokens directly to your wallet within the exact same atomic transaction slot.
2. **Deterministic Slippage**: All transactions specify strict slippage bounds across each constituent asset. If any sub-swap fails slippage checks, the entire transaction reverts safely.
3. **No Private Key Retention**: Kairos operates completely client-side for signing. Transactions are constructed deterministically and handed over to standard Solana wallet adapters.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">
  <sub>Built with conviction for the Solana global community.</sub>
</div>
