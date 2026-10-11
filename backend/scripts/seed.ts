/**
 * Kairos DB seeder (plan.md §4, PRD §11).
 *
 * Run from backend/:  npx tsx scripts/seed.ts   (after scripts/devnet-setup.ts)
 *
 * Seeds backend/data/kairos.db from the REAL devnet state:
 *   - token registry (real deterministic mints, prices, leg types, market-hours flag)
 *   - 6 baskets + their v1 compositions (weights sum EXACTLY 10000 bps)
 *   - 3 years of hourly price_snapshots per asset: deterministic random walk
 *     seeded by symbol, starting at 40% of the current price and engineered to
 *     end exactly at the current price
 *   - global_kill_switch=false setting
 *
 * Idempotent: tokens/baskets upsert; snapshot history is seeded once per mint
 * (skipped when the mint already has any snapshot).
 */
import { createHash } from "node:crypto";
import { repository } from "../src/db/repository";
import { loadDevnetState } from "../src/chain/devnetState";
import type { Basket, BasketLeg, BasketVersion, Token } from "../src/db/schema";

// ---------- deterministic PRNG (seeded by symbol) ----------

function seedFromSymbol(symbol: string): number {
  return createHash("sha256").update(symbol).digest().readUInt32BE(0);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- baskets (weights MUST sum to exactly 10000) ----------

type LegSpec = [symbol: string, weightBps: number];

interface BasketSpec {
  slug: string;
  name: string;
  thesis: string;
  category: string;
  legs: LegSpec[];
}

const ALL_SYMBOLS = [
  "tNVDA",
  "tGOLD",
  "tTSLA",
  "tJUP",
  "tJTO",
  "tBONK",
  "tRENDER",
  "tHNT",
  "tPYTH",
  "tKMNO",
];

const BASKETS: BasketSpec[] = [
  {
    slug: "solana-infra-governance",
    name: "Solana Infra & Governance",
    thesis:
      "Exposure to Solana's core trading infrastructure and protocol governance: Jupiter's liquidity routing and Jito's staking/mev layer.",
    category: "governance",
    legs: [
      ["tJUP", 5000],
      ["tJTO", 5000],
    ],
  },
  {
    slug: "solana-sigma",
    name: "Solana Sigma",
    thesis:
      "Systematic Solana beta: oracle/ data infrastructure, governance, restaking and compute across four high-beta legs.",
    category: "defi",
    legs: [
      ["tPYTH", 3500],
      ["tJUP", 2500],
      ["tKMNO", 2000],
      ["tRENDER", 2000],
    ],
  },
  {
    slug: "digital-gold",
    name: "Digital Gold",
    thesis:
      "Single-leg exposure to tokenized gold as an inflation hedge and portfolio diversifier.",
    category: "commodities",
    legs: [["tGOLD", 10000]],
  },
  {
    slug: "magnificent-seven-devnet",
    name: "Magnificent Seven (Devnet)",
    thesis:
      "Equal-weight basket spanning every asset listed on Kairos devnet — tokenized equities, commodities and Solana ecosystem DePIN/DeFi.",
    category: "diversified",
    legs: ALL_SYMBOLS.map((s): LegSpec => [s, 1000]),
  },
  {
    slug: "tokenized-equities",
    name: "Tokenized Equities",
    thesis:
      "Concentrated exposure to tokenized US mega-cap equities with NVDA tilt; TSLA leg is market-hours restricted.",
    category: "equities",
    legs: [
      ["tNVDA", 6000],
      ["tTSLA", 4000],
    ],
  },
  {
    slug: "depin-index",
    name: "DePIN Index",
    thesis:
      "Decentralized physical infrastructure networks: wireless (Helium) and decentralized GPU/render compute.",
    category: "depin",
    legs: [
      ["tHNT", 5000],
      ["tRENDER", 5000],
    ],
  },
];

/** Placeholder performance figures (deterministic, cosmetic until pricing lane computes real ones). */
function performanceFor(slug: string): Basket["performance"] {
  const h = seedFromSymbol(slug);
  const r = (base: number) => Number(((h % 100) / 100 + base).toFixed(2));
  return { "1W": r(0.4), "1M": r(2.1), "6M": r(7.3), "1Y": r(15.8) };
}

// ---------- snapshot walk ----------

const HISTORY_HOURS = 3 * 365 * 24; // 26,280 hourly points
const WALK_VOLATILITY = 0.004; // ±0.4% per-hour noise bound

function generateWalk(symbol: string, currentPrice: number): number[] {
  const rand = mulberry32(seedFromSymbol(symbol));
  const startPrice = 0.4 * currentPrice;
  const n = HISTORY_HOURS;
  const totalLogDrift = Math.log(currentPrice / startPrice);

  // log-space walk with noise, then a linear correction in log space so the
  // series starts at exactly startPrice and ends at exactly currentPrice.
  const logWalk = new Array<number>(n + 1);
  logWalk[0] = Math.log(startPrice);
  for (let i = 1; i <= n; i++) {
    const noise = (rand() * 2 - 1) * WALK_VOLATILITY;
    logWalk[i] = logWalk[i - 1] + (totalLogDrift / n) + noise;
  }
  const endError = Math.log(currentPrice) - logWalk[n];
  const out = new Array<number>(n + 1);
  for (let i = 0; i <= n; i++) {
    const corrected = logWalk[i] + (endError * i) / n;
    out[i] = Number(Math.exp(corrected).toPrecision(10));
  }
  return out;
}

function seedSnapshots(symbol: string, mint: string, currentPrice: number): number {
  if (repository.latestPrice(mint) !== null) {
    console.log(`[seed] snapshots for ${symbol}: already present, skipping`);
    return 0;
  }
  const series = generateWalk(symbol, currentPrice);
  const endMs = Date.now();
  const startMs = endMs - HISTORY_HOURS * 3_600_000;
  const t0 = Date.now();
  for (let i = 0; i <= HISTORY_HOURS; i++) {
    const ts = new Date(startMs + i * 3_600_000).toISOString();
    repository.addSnapshot(mint, ts, series[i], "seed-walk");
  }
  console.log(
    `[seed] snapshots for ${symbol}: ${series.length} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`
  );
  return series.length;
}

// ---------- main ----------

function main(): void {
  const state = loadDevnetState();
  if (!state) {
    console.error(
      `[seed] ${"devnet-state.json"} not found at expected path — run "npx tsx scripts/devnet-setup.ts" first`
    );
    process.exitCode = 1;
    return;
  }

  const bySymbol = new Map(state.assets.map((a) => [a.symbol, a]));

  // ---- tokens (real devnet mints) ----
  const tokens: Token[] = [
    {
      mint: state.usdc.mint,
      symbol: "USDC",
      name: "USD Coin (Kairos Devnet)",
      decimals: state.usdc.decimals,
      type: "stablecoin",
      tradingStatus: "active",
      denylisted: false,
      priceUsd: 1,
    },
    ...state.assets.map<Token>((a) => ({
      mint: a.mint,
      symbol: a.symbol,
      name: `Kairos Devnet ${a.symbol}`,
      decimals: a.decimals,
      type: a.legType,
      tradingStatus: "active",
      isMarketHoursRestricted: a.marketClosed === true ? true : undefined,
      denylisted: false,
      priceUsd: a.priceUsd,
    })),
  ];
  for (const t of tokens) repository.saveToken(t);
  console.log(`[seed] tokens: ${tokens.length} upserted (incl. USDC)`);

  // ---- baskets + v1 versions ----
  const nowIso = new Date().toISOString();
  let legCount = 0;
  for (const spec of BASKETS) {
    const weightSum = spec.legs.reduce((s, [, w]) => s + w, 0);
    if (weightSum !== 10000) {
      throw new Error(`[seed] basket "${spec.slug}" weights sum to ${weightSum}, expected 10000`);
    }
    const unknown = spec.legs.map(([s]) => s).filter((s) => !bySymbol.has(s));
    if (unknown.length > 0) {
      throw new Error(`[seed] basket "${spec.slug}" references unknown assets: ${unknown.join(", ")}`);
    }

    const basketId = `bkt-${spec.slug}`;
    const versionId = `bv-${spec.slug}-1`;
    const legs: BasketLeg[] = spec.legs.map(([symbol, weightBps]) => {
      const asset = bySymbol.get(symbol)!;
      return {
        id: `leg-${versionId}-${symbol}`,
        versionId,
        mint: asset.mint,
        weightBps,
        legType: asset.legType,
        venueHint: "Kairos Router",
        slippageBps: 50,
      };
    });
    legCount += legs.length;

    const version: BasketVersion = {
      id: versionId,
      basketId,
      version: 1,
      changelog: "Initial composition",
      publishedBy: "kairos-ops",
      publishedAt: nowIso,
      legs,
    };
    repository.saveBasketVersion(version);

    const basket: Basket = {
      id: basketId,
      slug: spec.slug,
      name: spec.name,
      thesis: spec.thesis,
      category: spec.category,
      status: "active",
      activeVersionId: versionId,
      minUsdc: 25,
      performance: performanceFor(spec.slug),
      protocols: ["Kairos Router"],
    };
    repository.saveBasket(basket);
    console.log(
      `[seed] basket ${spec.slug.padEnd(28)} legs ${spec.legs.length}  weights ${spec.legs
        .map(([s, w]) => `${s}:${w}`)
        .join(" ")}`
    );
  }
  console.log(`[seed] baskets: ${BASKETS.length} versions + ${legCount} legs saved`);

  // ---- 3y hourly price history ----
  let snapshotCount = 0;
  for (const asset of state.assets) {
    snapshotCount += seedSnapshots(asset.symbol, asset.mint, asset.priceUsd);
  }
  console.log(`[seed] snapshots: ${snapshotCount} rows added (3y hourly per asset)`);

  // ---- settings ----
  repository.setSetting("global_kill_switch", "false");
  console.log(`[seed] settings: global_kill_switch=false`);

  console.log("[seed] done.");
}

main();
