<div align="center">

# 🏛️ KAIROS — Non-Custodial Thematic Investment Router on Solana

[![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF?style=for-the-badge&logo=solana&logoColor=white)](https://solana.com)
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

## Current delivery contract

Kairos is a **devnet-first, non-custodial** Solana application. The local test and
build paths are reproducible without RPC access, a database account, or private
keys. Live devnet execution, router deployment, and oracle history require the
operator credentials described in `backend/.env.example` and are intentionally
not claimed by the offline checks.

- Runtime: Bun `1.4.2` (pinned by `.bun-version`, `package.json`, and `Dockerfile`).
- Persistence: PostgreSQL in deployment; PGlite-backed in-memory tests.
- Network: Solana devnet by default; mainnet is not a supported delivery target.
- Test command: `make test` (equivalent to `bun run test`).
- Secrets: never commit `.env`; use the tracked example templates.

## 📖 Executive Summary

Navigating decentralized finance and crypto markets requires managing dozens of volatile assets across isolated protocols. Traditional index products force users into synthetic vault contracts, introducing liquidation risk, manager lockups, and smart contract counterparty exposure.

**Kairos** pioneers non-custodial thematic investing on Solana:
- **Zero Custody**: The quote/prepare/submit flow targets the user's wallet. Program-backed atomic routing is enabled only after the configured devnet router is deployed and initialized.
- **Direct Wallet Ownership**: Every underlying token lands straight into your self-custodial wallet (Phantom, Solflare, Backpack).
- **Recovery-aware execution**: Landing, receipt checks, retries, close, and recovery state are persisted in PostgreSQL.
- **Explicit data status**: Provider snapshots and registry fallback data are labelled; unavailable history is not fabricated.

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
                       │          KAIROS BACKEND API           │
                       │  (Quotes, signed payloads & workers)  │
                      └───────┬───────────────────────┬───────┘
                              │                       │
            2. Provider snapshots│                       │ 3. Quote construction
               / registry data  │                       │    and signed payloads
                              ▼                       ▼
                      ┌──────────────┐        ┌───────────────┐
                       │  Price feeds │        │  Tx builders  │
                      └──────────────┘        └───────┬───────┘
                                                      │
                               4. Atomic Transaction Payload
                                                      ▼
                      ┌───────────────────────────────────────┐
                       │         SOLANA ANCHOR PROGRAM         │
                       │     (kairos-router / devnet only)     │
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

### 2. ⚡ Signed execution builders
Kairos builds quote-bound, wallet-signed Solana transactions and records their
hashes before submission. The optional on-chain router path is guarded by the
configured devnet program and pool state; local tests do not claim live routing.

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
- **Framework**: TypeScript HTTP service running on Bun
- **Language**: TypeScript
- **Database**: PostgreSQL with PGlite-backed offline tests
- **Price snapshots**: Pyth Hermes when configured; registry rates remain explicitly labelled test/devnet data
- **Execution**: signed Solana transaction builders and the Kairos Anchor router where the devnet program is deployed

### On-Chain Programs
- **Framework**: [Anchor Framework 0.31.1](https://www.anchor-lang.com/)
- **Language**: Rust
- **Target**: Solana Sealevel Virtual Machine (SVM)

---

## 🚀 Quickstart & Local Development

### Prerequisites

- [Bun](https://bun.sh/) `1.4.2` (the version in `.bun-version`)
- [Rust & Cargo](https://rustup.rs/) for program checks
- [Solana CLI](https://docs.solanalabs.com/cli/install) and [Anchor CLI](https://www.anchor-lang.com/docs/installation) for on-chain work
- Docker is optional; it is not needed for `make test`

### 1. Repository setup

```bash
bun --version                 # must print 1.4.2
bun install --frozen-lockfile
```

The root `bun.lock` covers both workspaces. Dependencies are installed locally;
do not install project packages globally.

### 2. Configure local environment files

```bash
# POSIX shells
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Windows PowerShell equivalents:
# Copy-Item backend/.env.example backend/.env
# Copy-Item frontend/.env.example frontend/.env
```

For a real backend run, set `DATABASE_URL`, `RELAYER_KEYPAIR`, and a fresh
`JWT_SECRET` in `backend/.env`. Keep these values local. The frontend template
only contains public `VITE_*` settings.

### 3. Local development

```bash
# Terminal 1: backend on http://localhost:3001
bun run start:backend

# Terminal 2: frontend on http://localhost:3000
bun run start:frontend
```

Vite proxies `/api`, `/v1`, `/health`, and `/ws` to the backend during local
development. `make run-backend` and `make run-frontend` are equivalent aliases.

For a demo rehearsal, run the two services together and then use the browser
smoke checker:

```bash
bun run demo
# In a second terminal:
bun run check:demo
```

The demo command seeds a planned devnet catalog when needed, builds the frontend, then serves it at `http://127.0.0.1:8080`; the API is at
`http://127.0.0.1:3001`. The preview proxies the API routes. The checker captures screenshots under
`target/demo/` and verifies `/`, `/markets`, `/portfolio`, `/labs`, and `/admin`.

For a pitch walkthrough, use the production frontend build and the configured
PostgreSQL backend together:

```bash
bun run build
bun run demo
```

Open `http://localhost:3000`. This uses the existing backend configuration; it
does not simulate successful transactions. `bun run check:devnet` reports the
signer balance, program deployment state, and estimated deployment rent without
printing secrets. Live investing requires initialized devnet tokens and pools.

### 4. Offline checks

```bash
# Required single test command; no RPC, Postgres account, or secrets needed.
make test

# Other local checks
make build
bun run --cwd backend typecheck
bun run check:contracts
```

The backend tests use an in-memory PGlite database. Tests that require a live
validator remain visible as documented skips; a skipped devnet test is not a
claim that the network flow works.

### 5. Docker build and run

The Dockerfile uses the pinned Bun image, installs the system certificates and
HTTP server needed by the image, installs from the frozen lockfile, and builds
both workspaces. Docker is not required for `make test`.

```bash
# Build the image. Optionally bake a different API URL into the SPA.
docker build --tag kairos:dev .

# Run the backend API; backend/.env is local and must not be committed.
docker run --rm --env-file backend/.env -p 3001:3001 kairos:dev

# Run the already-built frontend instead.
docker run --rm -e KAIROS_SERVICE=frontend -p 8080:8080 kairos:dev
```

### 6. Devnet setup and deployment

These commands require a funded operator wallet, RPC access, and a PostgreSQL
database. They are not part of the offline test contract.

```bash
# Prepare devnet registry/mint state after configuring backend/.env.
bun run --cwd backend setup
bun run --cwd backend seed

# Build and deploy the Anchor program only when the deployment wallet is ready.
anchor build
anchor deploy --provider.cluster devnet
```

For an OCI deployment, build and push `kairos:dev` (or a versioned tag), then
provide the same environment variables through the platform's secret manager.
Never put RPC keys, database credentials, relayer keypairs, admin tokens, or
JWT secrets in the image, README, or repository.

### 7. Solana smart program checks (optional)

```bash
anchor build
anchor test
```

---

## 📂 Repository Structure

```
kairos/
├── backend/                  # TypeScript API, PostgreSQL repository & workers
│   ├── src/
│   │   ├── routes/           # Baskets, prices, swaps, and analytics endpoints
│   │   ├── services/         # Quoting, execution, recovery & fee ledger
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
