import { config } from "../config";
import { repository } from "../db/repository";
import { priceResource, publishEvent } from "../services/event-stream";

type HermesResponse = {
  parsed?: Array<{
    id: string;
    price: { price: string; conf: string; expo: number; publish_time: number };
  }>;
};

const MINTS_BY_FEED = new Map<string, string[]>();
for (const [mint, feedId] of Object.entries(config.pythFeeds)) {
  MINTS_BY_FEED.set(feedId, [...(MINTS_BY_FEED.get(feedId) ?? []), mint]);
}

let timer: ReturnType<typeof setInterval> | undefined;
let running = false;
let lastFailure = "";

async function ingest(): Promise<void> {
  if (running || !config.pythApiKey || MINTS_BY_FEED.size === 0) return;
  running = true;
  try {
    const url = new URL(`${config.pythHermesUrl}/v2/updates/price/latest`);
    for (const feedId of MINTS_BY_FEED.keys()) url.searchParams.append("ids[]", feedId);
    url.searchParams.set("parsed", "true");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.pythApiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Hermes returned HTTP ${response.status}`);
    const body = await response.json() as HermesResponse;
    const publishedAt = new Date();
    const nowSec = publishedAt.getTime() / 1000;
    let inserted = 0;
    for (const update of body.parsed ?? []) {
      const mints = MINTS_BY_FEED.get(`0x${update.id.replace(/^0x/i, "").toLowerCase()}`);
      if (!update.price) continue;
      const { price, conf, expo, publish_time: publishTime } = update.price;
      if (!mints || !Number.isInteger(expo) || !Number.isFinite(publishTime)) continue;
      const ageSec = nowSec - publishTime;
      const priceUsd = Number(price) * 10 ** expo;
      const confidenceUsd = Number(conf) * 10 ** expo;
      if (
        !Number.isFinite(priceUsd) || priceUsd <= 0 ||
        !Number.isFinite(confidenceUsd) || confidenceUsd < 0 ||
        ageSec < -5 || ageSec > config.pythMaxAgeSec
      ) continue;
      const ts = new Date(publishTime * 1000).toISOString();
      for (const mint of mints ?? []) {
        if (!(await repository.getToken(mint))) continue;
        const latestPyth = (await repository.latestPrice(mint, "pyth"));
        if (latestPyth && ts <= latestPyth.ts) continue;
        const latestPrice = (await repository.latestPrice(mint));
        if ((await repository.addSnapshot(mint, ts, priceUsd, "pyth", update.id, confidenceUsd))) {
          if (!latestPrice || ts > latestPrice.ts) (await repository.updateTokenPrice(mint, priceUsd));
          publishEvent(priceResource(mint), "price.snapshot", {
            mint,
            ts,
            priceUsd,
            confidenceUsd,
            source: "pyth",
          });
          inserted++;
        }
      }
    }
    if (inserted || lastFailure) console.info(`[prices] stored ${inserted} Pyth snapshots`);
    lastFailure = "";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== lastFailure) console.warn(`[prices] Pyth snapshot ingestion unavailable: ${message}`);
    lastFailure = message;
  } finally {
    running = false;
  }
}

export async function startPriceSnapshotWorker(): Promise<void> {
  if (timer || !config.pythApiKey || MINTS_BY_FEED.size === 0) return;
  void (await ingest());
  timer = setInterval(async () => void (await ingest()), config.pythPollMs);
  timer.unref?.();
  console.info(`[prices] Pyth ingestion enabled for ${Object.keys(config.pythFeeds).length} token mints`);
}

export function stopPriceSnapshotWorker(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
