import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface CoinGeckoSimplePriceResponse {
  [id: string]: {
    usd?: number;
  };
}

export async function runNavSnapshotCycle(): Promise<{ successfulBaskets: number; skippedBaskets: number }> {
  const timestamp = new Date();
  console.log(`\n[NAV Snapshot Cron] Running snapshot cycle at ${timestamp.toISOString()}...`);

  try {
    const baskets = await prisma.basket.findMany({
      include: {
        tokens: true,
      },
    });

    if (baskets.length === 0) {
      console.warn("[NAV Snapshot Cron] No baskets found in database. Skipping cycle.");
      return { successfulBaskets: 0, skippedBaskets: 0 };
    }

    // Collect all unique CoinGecko IDs across all baskets
    const coingeckoIdSet = new Set<string>();
    for (const b of baskets) {
      for (const t of b.tokens) {
        if (t.coingeckoId) {
          coingeckoIdSet.add(t.coingeckoId);
        }
      }
    }

    const uniqueIds = Array.from(coingeckoIdSet);
    if (uniqueIds.length === 0) {
      console.warn("[NAV Snapshot Cron] No token CoinGecko IDs registered.");
      return { successfulBaskets: 0, skippedBaskets: 0 };
    }

    // Single batched call to avoid redundant API calls and rate limits
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(uniqueIds.join(","))}&vs_currencies=usd`;
    console.log(`[NAV Snapshot Cron] Fetching batched prices for ${uniqueIds.length} unique tokens...`);

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Kairos-NAV-Service/1.0",
      },
    });

    if (!res.ok) {
      console.error(`[NAV Snapshot Cron] CoinGecko API error: HTTP ${res.status} ${res.statusText}`);
      return { successfulBaskets: 0, skippedBaskets: baskets.length };
    }

    const priceData = (await res.json()) as CoinGeckoSimplePriceResponse;

    let successfulBaskets = 0;
    let skippedBaskets = 0;

    for (const basket of baskets) {
      const totalWeight = basket.tokens.reduce((acc, t) => acc + t.weightBps, 0);
      if (totalWeight !== 10000) {
        console.error(
          `[NAV Snapshot Cron] Basket "${basket.name}" (${basket.id}) weights sum to ${totalWeight} bps (expected 10000). Skipping snapshot.`
        );
        skippedBaskets++;
        continue;
      }

      // Verify every constituent token has a valid price
      let missingToken: string | null = null;
      for (const token of basket.tokens) {
        const price = priceData[token.coingeckoId]?.usd;
        if (typeof price !== "number" || isNaN(price)) {
          missingToken = `${token.symbol} (${token.coingeckoId})`;
          break;
        }
      }

      if (missingToken) {
        console.error(
          `[NAV Snapshot Cron] Basket "${basket.name}" (${basket.id}) missing price for token ${missingToken}. Never inserting partial NAV — skipping this basket.`
        );
        skippedBaskets++;
        continue;
      }

      // Calculate current weighted NAV
      let currentNav = 0;
      for (const token of basket.tokens) {
        const price = priceData[token.coingeckoId].usd!;
        currentNav += (token.weightBps / 10000) * price;
      }

      const roundedNav = parseFloat(currentNav.toFixed(6));

      await prisma.basketNAVHistory.create({
        data: {
          basketId: basket.id,
          navValue: roundedNav,
          timestamp,
        },
      });

      console.log(`[NAV Snapshot Cron] ✓ Saved snapshot for ${basket.name}: NAV $${roundedNav.toFixed(4)}`);
      successfulBaskets++;
    }

    console.log(
      `[NAV Snapshot Cron] Cycle complete: ${successfulBaskets} baskets snapshotted, ${skippedBaskets} skipped.\n`
    );
    return { successfulBaskets, skippedBaskets };
  } catch (err: any) {
    console.error("[NAV Snapshot Cron] Unhandled error during snapshot cycle:", err);
    return { successfulBaskets: 0, skippedBaskets: 0 };
  }
}

export function startNavSnapshotCron(intervalMs = 60 * 60 * 1000): NodeJS.Timeout {
  console.log(`[NAV Snapshot Cron] Initializing cron scheduler (interval: ${intervalMs / 1000 / 60}m)...`);

  // Run immediately on startup
  runNavSnapshotCycle().catch((err) => {
    console.error("[NAV Snapshot Cron] Startup snapshot failed:", err);
  });

  // Schedule recurring hourly job
  const timer = setInterval(() => {
    runNavSnapshotCycle().catch((err) => {
      console.error("[NAV Snapshot Cron] Scheduled snapshot failed:", err);
    });
  }, intervalMs);

  return timer;
}
