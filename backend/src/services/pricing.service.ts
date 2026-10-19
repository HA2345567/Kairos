import { repository } from "../db/repository";
import { config } from "../config";

/**
 * Devnet quote-price lookup. Impact requires an execution-route quote.
 *
 * Devnet quotes use the configured registry price until a verified feed is
 * connected. Only provider snapshots may contribute to historical results.
 */

export interface QuotePrice {
  priceUsd: number;
  ts: string | null;
  source: "pyth" | "chainlink" | "devnet-registry";
  sourceRef: string | null;
  confidenceUsd: number | null;
  stale: boolean;
  ageSec: number | null;
}

function effectiveStaleSec(): number {
  return config.chaos.stalePriceSec ?? config.stalePriceSec;
}

export async function getQuotePrice(mint: string): Promise<QuotePrice> {
  const token = (await repository.getToken(mint));
  if (!token) throw new Error(`TOKEN_NOT_FOUND:${mint}`);

  const latest = (await repository.latestPrice(mint));
  const now = Date.now();
  if (latest) {
    const ageSec = (now - new Date(latest.ts).getTime()) / 1000;
    // Recent Pyth/Chainlink data takes precedence over the devnet registry rate.
    if (
      Number.isFinite(latest.priceUsd) && latest.priceUsd > 0 &&
      ageSec >= 0 && ageSec <= config.pythMaxAgeSec
    ) {
      return {
        priceUsd: latest.priceUsd,
        ts: latest.ts,
        source: latest.source,
        sourceRef: latest.sourceRef ?? null,
        confidenceUsd: latest.confidence ?? null,
        stale: ageSec > effectiveStaleSec(),
        ageSec: Math.round(ageSec),
      };
    }
  }
  // Devnet-only indicative rate. It is not a live market quote.
  return {
    priceUsd: token.priceUsd,
    ts: null,
    source: "devnet-registry",
    sourceRef: null,
    confidenceUsd: null,
    stale: !config.isDevnet() || !Number.isFinite(token.priceUsd) || token.priceUsd <= 0,
    ageSec: null,
  };
}

export const pricingService = { getQuotePrice };
