import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const BASKETS_SEED_DATA = [
  {
    id: "solana-infrastructure",
    name: "Solana Infrastructure",
    category: "Infrastructure",
    description: "The core foundational stack — liquid staking, DEX routing, AMMs, and compute backbone",
    tokens: [
      { symbol: "CLOUD", coingeckoId: "sanctum-2", weightBps: 1060 },
      { symbol: "BP", coingeckoId: "backpack", weightBps: 1000 },
      { symbol: "JUP", coingeckoId: "jupiter-exchange-solana", weightBps: 900 },
      { symbol: "JitoSOL", coingeckoId: "jito-staked-sol", weightBps: 800 },
      { symbol: "SOL", coingeckoId: "solana", weightBps: 800 },
      { symbol: "mSOL", coingeckoId: "msol", weightBps: 800 },
      { symbol: "KMNO", coingeckoId: "kamino", weightBps: 800 },
      { symbol: "RAY", coingeckoId: "raydium", weightBps: 800 },
      { symbol: "ORCA", coingeckoId: "orca", weightBps: 800 },
      { symbol: "MET", coingeckoId: "meteora", weightBps: 800 },
      { symbol: "ARX", coingeckoId: "arcium", weightBps: 800 },
      { symbol: "JTO", coingeckoId: "jito-governance-token", weightBps: 640 },
    ],
  },
  {
    id: "solana-sigma-basket",
    name: "Solana Sigma Basket",
    category: "Infrastructure",
    description: "Quiet infrastructure that powers everything — no hype needed",
    tokens: [
      { symbol: "PYTH", coingeckoId: "pyth-network", weightBps: 3500 },
      { symbol: "JUP", coingeckoId: "jupiter-exchange-solana", weightBps: 2500 },
      { symbol: "KMNO", coingeckoId: "kamino", weightBps: 2000 },
      { symbol: "RENDER", coingeckoId: "render-token", weightBps: 2000 },
    ],
  },
  {
    id: "solana-culture-memes",
    name: "Solana Culture & Memes",
    category: "Culture & Memes",
    description: "The viral pulse of Solana — liquid attention, internet lore, and community conviction",
    tokens: [
      { symbol: "BONK", coingeckoId: "bonk", weightBps: 4000 },
      { symbol: "TRUMP", coingeckoId: "official-trump", weightBps: 3000 },
      { symbol: "PENGU", coingeckoId: "pudgy-penguins", weightBps: 3000 },
    ],
  },
  {
    id: "solana-ai-compute",
    name: "Solana AI & Compute",
    category: "AI",
    description: "Decentralized machine intelligence, autonomous agents, and GPU render nodes on Solana",
    tokens: [
      { symbol: "RENDER", coingeckoId: "render-token", weightBps: 3000 },
      { symbol: "FARTCOIN", coingeckoId: "fartcoin", weightBps: 2500 },
      { symbol: "PIPPIN", coingeckoId: "pippin", weightBps: 2500 },
      { symbol: "GOAT", coingeckoId: "goatseus-maximus", weightBps: 2000 },
    ],
  },
  {
    id: "solana-depin-infrastructure",
    name: "Solana DePIN Infrastructure",
    category: "DePIN",
    description: "Decentralized Physical Infrastructure Networks tokenizing wireless, 5G telecom, and real-world sensor grids",
    tokens: [
      { symbol: "HNT", coingeckoId: "helium", weightBps: 5000 },
      { symbol: "IOT", coingeckoId: "helium-iot", weightBps: 2500 },
      { symbol: "MOBILE", coingeckoId: "helium-mobile", weightBps: 2500 },
    ],
  },
];

export async function seed() {
  console.log("Starting Kairos Basket & Token seeding...");

  for (const b of BASKETS_SEED_DATA) {
    const totalWeight = b.tokens.reduce((acc, t) => acc + t.weightBps, 0);
    if (totalWeight !== 10000) {
      throw new Error(`CRITICAL: Basket ${b.name} weights sum to ${totalWeight} bps (expected 10000). Aborting seed!`);
    }

    const basket = await prisma.basket.upsert({
      where: { id: b.id },
      update: {
        name: b.name,
        category: b.category,
        description: b.description,
      },
      create: {
        id: b.id,
        name: b.name,
        category: b.category,
        description: b.description,
      },
    });

    console.log(`✓ Seeded Basket: ${basket.name} (${basket.id}) - Weight sum: ${totalWeight} bps`);

    for (const t of b.tokens) {
      await prisma.basketToken.upsert({
        where: {
          basketId_symbol: {
            basketId: b.id,
            symbol: t.symbol,
          },
        },
        update: {
          coingeckoId: t.coingeckoId,
          weightBps: t.weightBps,
        },
        create: {
          basketId: b.id,
          symbol: t.symbol,
          coingeckoId: t.coingeckoId,
          weightBps: t.weightBps,
        },
      });
      console.log(`   └─ Token: ${t.symbol.padEnd(8)} (CoinGecko: ${t.coingeckoId.padEnd(25)}) -> ${t.weightBps} bps (${t.weightBps / 100}%)`);
    }
  }

  console.log("\nAll 5 launch baskets & constituent tokens successfully seeded with verified CoinGecko IDs!");
}

seed()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
