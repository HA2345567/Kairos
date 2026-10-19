/**
 * Kairos DB seeder (plan.md §4, PRD §11).
 *
 * Run from backend/:  bun scripts/seed.ts   (after bun scripts/devnet-setup.ts)
 *
 * Seeds the configured PostgreSQL database from the devnet setup state:
 *   - token registry (devnet mints, configured test rates, leg types, market-hours flag)
 *   - 6 baskets + their v1 compositions (weights sum EXACTLY 10000 bps)
 *   - global_kill_switch=false setting
 *
 * Idempotent: tokens and baskets are upserted; market history is never seeded.
 */
import { repository } from "../src/db/repository";
import { loadDevnetState } from "../src/chain/devnetState";
import type { Basket, BasketLeg, BasketVersion, Token } from "../src/db/schema";
import { config } from "../src/config";
import { plannedDevnetCatalog } from "../src/chain/devnet-assets";

// ---------- baskets (weights MUST sum to exactly 10000) ----------

type LegSpec = [symbol: string, weightBps: number];

interface BasketSpec {
  slug: string;
  name: string;
  thesis: string;
  category: string;
  legs: LegSpec[];
}

const BASKETS: BasketSpec[] = [
  {
    slug: "solana-infrastructure",
    name: "Solana Infrastructure",
    thesis: "Core Solana trading and network infrastructure across liquidity routing, staking and oracle services.",
    category: "infrastructure",
    legs: [
      ["tCLOUD", 1060], ["tBP", 1000], ["tJUP", 900], ["tJitoSOL", 800],
      ["tSOL", 800], ["tMSOL", 800], ["tKMNO", 800], ["tRAY", 800],
      ["tORCA", 800], ["tMET", 800], ["tARX", 800], ["tJTO", 640],
    ],
  },
  {
    slug: "solana-sigma-basket",
    name: "Solana Sigma Basket",
    thesis: "A diversified Solana ecosystem allocation spanning oracles, liquidity, lending and decentralized compute.",
    category: "defi",
    legs: [["tPYTH", 3500], ["tJUP", 2500], ["tKMNO", 2000], ["tRENDER", 2000]],
  },
  {
    slug: "solana-culture-memes",
    name: "Solana Culture & Memes",
    thesis: "A high-volatility basket spanning Solana-native meme communities, internet culture, and social tokens.",
    category: "culture",
    legs: [["tBONK", 3600], ["tTRUMP", 2700], ["tPENGU", 2700], ["tWIF", 500], ["tFARTCOIN", 500]],
  },
  {
    slug: "solana-ai-compute",
    name: "Solana AI & Compute",
    thesis: "Solana-based GPU and confidential compute networks powering AI workloads, rendering, and encrypted applications.",
    category: "ai-compute",
    legs: [["tRENDER", 2500], ["tNOS", 2500], ["tIO", 2500], ["tARX", 2500]],
  },
  {
    slug: "solana-depin-infrastructure",
    name: "Solana DePIN Infrastructure",
    thesis: "A cross-section of Solana DePIN networks spanning wireless coverage, mobile connectivity, map data, and decentralized GPU compute.",
    category: "depin",
    legs: [["tHNT", 2000], ["tMOBILE", 2000], ["tIOT", 2000], ["tHONEY", 2000], ["tRENDER", 2000]],
  },
  {
    slug: "solana-real-world-assets",
    name: "Solana Real World Assets",
    thesis: "A diversified Solana RWA preview spanning tokenized Treasuries, institutional liquidity funds, public-market ETFs, and gold.",
    category: "real-world-assets",
    legs: [["tUSDY", 2000], ["tOUSG", 2000], ["tBUIDL", 2000], ["tSPYX", 2000], ["tXAUM", 2000]],
  },
];

// ---------- main ----------

async function main(): Promise<void> {
  if (!config.isDevnet()) throw new Error("This seeder only supports devnet");
  const catalogOnly = process.argv.includes("--catalog-only");
  const deployedState = catalogOnly ? null : loadDevnetState();
  const preview = catalogOnly;
  const state = deployedState ?? (catalogOnly ? plannedDevnetCatalog() : null);
  if (!state) {
    console.error(
      `[seed] devnet-state.json not found at expected path — run "bun scripts/devnet-setup.ts" first`
    );
    process.exitCode = 1;
    return;
  }

  const bySymbol = new Map(state.assets.map((a) => [a.symbol, a]));

  // Preserve registry restrictions. Catalog-only previews may refresh their
  // illustrative fallback prices from this source list.
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
  for (const t of tokens) {
    const existing = await repository.getToken(t.mint);
    if (!existing) await repository.saveToken(t);
    else if (preview && existing.priceUsd !== t.priceUsd) {
      await repository.saveToken({ ...existing, priceUsd: t.priceUsd });
    }
  }
  console.log(`[seed] tokens: ${tokens.length} checked (incl. USDC)`);

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

    const existingBasket = await repository.getBasketBySlug(spec.slug);
    const currentVersion = existingBasket
      ? await repository.getBasketVersion(existingBasket.activeVersionId)
      : undefined;
    const existingMatches = currentVersion?.legs.length === spec.legs.length && spec.legs.every(([symbol, weightBps], index) => {
      const asset = bySymbol.get(symbol)!;
      const currentLeg = currentVersion.legs[index];
      return currentLeg?.mint === asset.mint && currentLeg.weightBps === weightBps;
    });

    // Preserve operator-managed versions. A catalog preview is the exception:
    // once real devnet state is available, promote its deterministic preview
    // version to the funded devnet catalog (even when the weights are equal).
    if (existingBasket && (currentVersion?.publishedBy !== "devnet-preview" || (preview && existingMatches))) {
      continue;
    }

    const basketId = existingBasket?.id ?? `bkt-${spec.slug}`;
    const versionNumber = currentVersion ? currentVersion.version + 1 : 1;
    const versionId = `bv-${spec.slug}-${versionNumber}`;
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
      version: versionNumber,
      changelog: preview
        ? currentVersion ? "Updated planned devnet composition; on-chain publication pending" : "Planned devnet composition; on-chain publication pending"
        : "Initial composition",
      publishedBy: preview ? "devnet-preview" : "kairos-ops",
      publishedAt: nowIso,
      legs,
    };
    (await repository.saveBasketVersion(version));

    const basket: Basket = existingBasket
      ? {
          ...existingBasket,
          name: spec.name,
          thesis: spec.thesis,
          category: spec.category,
          activeVersionId: versionId,
          ...(preview ? {} : { status: "active" as const }),
        }
      : {
          id: basketId,
          slug: spec.slug,
          name: spec.name,
          thesis: spec.thesis,
          category: spec.category,
          status: preview ? "paused" : "active",
          activeVersionId: versionId,
          minUsdc: 25,
          protocols: ["Kairos Router"],
        };
    (await repository.saveBasket(basket));
    console.log(
      `[seed] basket ${spec.slug.padEnd(28)} v${versionNumber} legs ${spec.legs.length}  weights ${spec.legs
        .map(([s, w]) => `${s}:${w}`)
        .join(" ")}`
    );
  }
  console.log(`[seed] baskets: ${BASKETS.length} versions + ${legCount} legs saved`);

  // ---- settings ----
  if (await repository.getSetting("global_kill_switch") === undefined) {
    await repository.setSetting("global_kill_switch", "false");
  }
  if (preview) console.log("[seed] Catalog preview only: baskets paused; no chain state or performance history created.");

  console.log("[seed] done.");
}

(await main());
