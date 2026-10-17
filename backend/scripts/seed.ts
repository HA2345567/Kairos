/**
 * Kairos DB seeder (plan.md §4, PRD §11).
 *
 * Run from backend/:  bun scripts/seed.ts   (after bun scripts/devnet-setup.ts)
 *
 * Seeds backend/data/kairos.db from the devnet setup state:
 *   - token registry (devnet mints, configured test rates, leg types, market-hours flag)
 *   - 6 baskets + their v1 compositions (weights sum EXACTLY 10000 bps)
 *   - global_kill_switch=false setting
 *
 * Idempotent: tokens and baskets are upserted; market history is never seeded.
 */
import { repository } from "../src/db/repository";
import { loadDevnetState } from "../src/chain/devnetState";
import type { Basket, BasketLeg, BasketVersion, Token } from "../src/db/schema";

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

// ---------- main ----------

async function main(): Promise<void> {
  const state = loadDevnetState();
  if (!state) {
    console.error(
      `[seed] devnet-state.json not found at expected path — run "bun scripts/devnet-setup.ts" first`
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
  for (const t of tokens) (await repository.saveToken(t));
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
    (await repository.saveBasketVersion(version));

    const basket: Basket = {
      id: basketId,
      slug: spec.slug,
      name: spec.name,
      thesis: spec.thesis,
      category: spec.category,
      status: "active",
      activeVersionId: versionId,
      minUsdc: 25,
      protocols: ["Kairos Router"],
    };
    (await repository.saveBasket(basket));
    console.log(
      `[seed] basket ${spec.slug.padEnd(28)} legs ${spec.legs.length}  weights ${spec.legs
        .map(([s, w]) => `${s}:${w}`)
        .join(" ")}`
    );
  }
  console.log(`[seed] baskets: ${BASKETS.length} versions + ${legCount} legs saved`);

  // ---- settings ----
  (await repository.setSetting("global_kill_switch", "false"));
  console.log(`[seed] settings: global_kill_switch=false`);

  console.log("[seed] done.");
}

(await main());
