import { existsSync } from "node:fs";
import { config } from "../config";
import { repository } from "./repository";
import { Token } from "./schema";

// Minimal fallback token registry used ONLY when scripts/devnet-setup.ts has
// not yet produced backend/data/devnet-state.json (the authoritative seeder is
// scripts/seed.ts, owned by the CHAIN lane). Keeps /v1/tokens reads from 404ing
// on a cold, never-setup machine.
const FALLBACK_TOKENS: Token[] = [
  {
    mint: "An9DFuHeSDYgVBiybraa7Svn1RHjrDb7Ed8YJZCZ4D1Y", // Devnet test USDC
    symbol: "USDC",
    name: "USD Coin (Devnet)",
    decimals: 6,
    type: "stablecoin",
    tradingStatus: "active",
    denylisted: false,
    priceUsd: 1.0,
  },
  {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // Mainnet USDC
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    type: "stablecoin",
    tradingStatus: "active",
    denylisted: false,
    priceUsd: 1.0,
  },
  {
    mint: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    name: "Wrapped SOL",
    decimals: 9,
    type: "spl",
    tradingStatus: "active",
    denylisted: false,
    priceUsd: 155.0,
  },
];

export function seedDatabase(): void {
  // Real devnet state exists -> the CHAIN lane's scripts/seed.ts owns seeding.
  if (existsSync(config.devnetStatePath)) {
    return;
  }
  for (const token of FALLBACK_TOKENS) {
    repository.saveToken(token);
  }
}
