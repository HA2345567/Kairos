# Quickstart Guide: Kairos Platform

## Prerequisites
- Node.js v20 LTS
- Bun (`bun --version`)
- Rust + Anchor CLI 0.30.x+
- Solana CLI (`solana --version`) configured to Devnet

## 1. Frontend Development
```bash
cd frontend
bun install
bun dev
# Local dev server runs at http://localhost:8083 (or next free port)
```

## 2. On-Chain Program Build & Devnet Test
```bash
# Build Anchor router program
anchor build

# Run unit and simulation test suite
anchor test
```

## 3. Running Preflight Simulation Tests
```bash
cd frontend
bun run test
# Runs Vitest suites for Jupiter quote resolution, ALT lifecycle, and swap leg assembly
```
