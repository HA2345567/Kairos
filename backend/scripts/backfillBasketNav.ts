import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface CoinGeckoMarketChartResponse {
  prices: [number, number][]; // [timestampMs, priceUsd]
  market_caps?: [number, number][];
  total_volumes?: [number, number][];
}

import * as fs from "fs";
import * as path from "path";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchTokenMarketChart(coingeckoId: string, days = 180, retries = 5): Promise<[number, number][]> {
  const cacheDir = path.resolve(process.cwd(), ".cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const cacheFile = path.join(cacheDir, `prices_${coingeckoId}_${days}.json`);
  if (fs.existsSync(cacheFile)) {
    try {
      const stats = fs.statSync(cacheFile);
      // Cache valid for 4 hours
      if (Date.now() - stats.mtimeMs < 4 * 60 * 60 * 1000) {
        const cached = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
        if (Array.isArray(cached) && cached.length > 0) {
          console.log(`   (loaded ${cached.length} points from disk cache for ${coingeckoId})`);
          return cached;
        }
      }
    } catch {
      // Fall through to network fetch
    }
  }

  const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Kairos-NAV-Service/1.0",
        },
      });

      if (res.status === 429) {
        const waitTime = 20000 + attempt * 10000; // 30s, 40s, 50s...
        console.warn(`[Rate Limit 429] CoinGecko rate limit hit for ${coingeckoId}. Waiting ${waitTime / 1000}s before retry (attempt ${attempt}/${retries})...`);
        await sleep(waitTime);
        continue;
      }

      if (!res.ok) {
        throw new Error(`CoinGecko HTTP ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as CoinGeckoMarketChartResponse;
      if (!data.prices || !Array.isArray(data.prices)) {
        throw new Error(`Malformed price data returned for ${coingeckoId}`);
      }

      // Save to cache
      fs.writeFileSync(cacheFile, JSON.stringify(data.prices), "utf-8");

      return data.prices;
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.warn(`[Retry] Failed to fetch market chart for ${coingeckoId}: ${err.message}. Retrying in 5s...`);
      await sleep(5000);
    }
  }

  throw new Error(`Failed to fetch ${coingeckoId} after ${retries} retries`);
}

export async function backfillBaskets(targetBasketIds?: string[]) {
  console.log("=== Starting Historical Basket NAV Backfill (180 days, real data) ===");

  const baskets = await prisma.basket.findMany({
    where: targetBasketIds && targetBasketIds.length > 0 ? { id: { in: targetBasketIds } } : undefined,
    include: {
      tokens: true,
    },
  });

  if (baskets.length === 0) {
    console.log("No baskets found matching criteria.");
    return;
  }

  const resultsSummary: Array<{
    id: string;
    name: string;
    pointsInserted: number;
    startNav: number;
    endNav: number;
    allTimeReturnPct: number;
  }> = [];

  for (const basket of baskets) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Processing Basket: ${basket.name} (${basket.id})`);
    
    // Strict validation: Weights must sum to 10000
    const totalWeight = basket.tokens.reduce((sum, t) => sum + t.weightBps, 0);
    if (totalWeight !== 10000) {
      console.error(`CRITICAL: Basket ${basket.id} weights sum to ${totalWeight} bps (expected 10000). Skipping this basket!`);
      continue;
    }

    if (basket.tokens.length === 0) {
      console.warn(`Basket ${basket.id} has no constituent tokens. Skipping.`);
      continue;
    }

    console.log(`Tokens count: ${basket.tokens.length}. Fetching historical prices sequentially (1.5s delay)...`);

    const tokenSeriesMap: Map<string, { symbol: string; weightBps: number; prices: [number, number][] }> = new Map();
    let hasFetchFailure = false;

    for (let i = 0; i < basket.tokens.length; i++) {
      const token = basket.tokens[i];
      // 2.5s delay before each call to respect CoinGecko free tier limits
      await sleep(2500);

      try {
        console.log(` [${i + 1}/${basket.tokens.length}] Fetching ${token.symbol} (${token.coingeckoId})...`);
        const prices = await fetchTokenMarketChart(token.coingeckoId, 180);
        console.log(`   └─ Got ${prices.length} price points for ${token.symbol}`);
        tokenSeriesMap.set(token.symbol, {
          symbol: token.symbol,
          weightBps: token.weightBps,
          prices,
        });
      } catch (err: any) {
        console.error(`Failed to fetch history for ${token.symbol} (${token.coingeckoId}):`, err.message);
        hasFetchFailure = true;
        break;
      }
    }

    if (hasFetchFailure) {
      console.error(`Aborting backfill for basket ${basket.id} due to token fetch failure.`);
      continue;
    }

    // Determine lengths and truncate to shortest common length
    const seriesList = Array.from(tokenSeriesMap.values());
    const lengths = seriesList.map((s) => s.prices.length);
    const minLength = Math.min(...lengths);
    const maxLength = Math.max(...lengths);

    if (minLength === 0) {
      console.error(`One or more tokens have 0 price points for basket ${basket.id}. Skipping.`);
      continue;
    }

    if (minLength !== maxLength) {
      console.warn(
        `⚠️ WARNING: Token price series lengths differ for basket "${basket.id}". Min: ${minLength}, Max: ${maxLength}. Truncating all tokens to the most recent ${minLength} points to ensure aligned time window.`
      );
    }

    // Slice to the most recent minLength data points for each token
    const alignedTokens = seriesList.map((s) => ({
      symbol: s.symbol,
      weightBps: s.weightBps,
      prices: s.prices.slice(-minLength),
    }));

    // Calculate NAV for each aligned index
    const navPoints: Array<{ basketId: string; navValue: number; timestamp: Date }> = [];

    for (let idx = 0; idx < minLength; idx++) {
      // Use the timestamp from the first token's series (all are aligned to daily intervals)
      const timestampMs = alignedTokens[0].prices[idx][0];
      const timestamp = new Date(timestampMs);

      let weightedNav = 0;
      for (const token of alignedTokens) {
        const price = token.prices[idx][1];
        weightedNav += (token.weightBps / 10000) * price;
      }

      navPoints.push({
        basketId: basket.id,
        navValue: parseFloat(weightedNav.toFixed(6)),
        timestamp,
      });
    }

    // Delete existing NAV history rows for clean re-run idempotency
    const deleted = await prisma.basketNAVHistory.deleteMany({
      where: { basketId: basket.id },
    });
    if (deleted.count > 0) {
      console.log(`Cleared ${deleted.count} previous NAV points for basket ${basket.id}.`);
    }

    // Batch insert NAV history
    await prisma.basketNAVHistory.createMany({
      data: navPoints,
    });

    const startNav = navPoints[0].navValue;
    const endNav = navPoints[navPoints.length - 1].navValue;
    const allTimeReturnPct = ((endNav - startNav) / startNav) * 100;

    resultsSummary.push({
      id: basket.id,
      name: basket.name,
      pointsInserted: navPoints.length,
      startNav,
      endNav,
      allTimeReturnPct,
    });

    console.log(
      `✓ Successfully backfilled ${navPoints.length} NAV points for ${basket.name}!` +
      `\n  Start NAV: $${startNav.toFixed(4)} | Current NAV: $${endNav.toFixed(4)} | All-Time Return: ${allTimeReturnPct > 0 ? "+" : ""}${allTimeReturnPct.toFixed(2)}%`
    );
  }

  console.log("\n================ BACKFILL SUMMARY ================");
  for (const s of resultsSummary) {
    console.log(
      `- ${s.name} (${s.id}): ${s.pointsInserted} points | All-Time: ${s.allTimeReturnPct > 0 ? "+" : ""}${s.allTimeReturnPct.toFixed(2)}% (Start: $${s.startNav.toFixed(4)} -> End: $${s.endNav.toFixed(4)})`
    );
  }
}

// Allow CLI execution with basket IDs as arguments
const cliArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
backfillBaskets(cliArgs.length > 0 ? cliArgs : undefined)
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
