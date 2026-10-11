import { repository } from "../db/repository";

/**
 * Backtest & performance (PRD §4.7).
 *
 * Portfolio index = weight_bps-weighted, first-value-normalised leg series
 * over the EARLIEST COMMON timestamp window (never fabricated — legs without
 * history are excluded and disclosed). Benchmark is a flat 8%/yr S&P proxy.
 * Always hypothetical on devnet; results cached per (version, window).
 */

export type BacktestWindow = "1W" | "1M" | "6M" | "1Y" | "3Y";

const WINDOW_DAYS: Record<BacktestWindow, number> = { "1W": 7, "1M": 30, "6M": 182, "1Y": 365, "3Y": 1095 };
export const WINDOWS: BacktestWindow[] = ["1W", "1M", "6M", "1Y", "3Y"];

const BENCHMARK_ANNUAL = 0.08;
const MAX_POINTS = 400;
const DISCLAIMER =
  "Hypothetical performance derived from simulated devnet price snapshots; not a representation of future returns.";

export interface BacktestPoint {
  ts: string;
  value: number;
  benchmark: number;
}

export interface BacktestResult {
  slug: string;
  basketVersionId: string;
  window: BacktestWindow;
  from: string;
  to: string;
  returnPct: number;
  benchmarkReturnPct: number;
  alphaPct: number;
  series: BacktestPoint[];
  excludedLegs: Array<{ mint: string; symbol: string; reason: string }>;
  isHypothetical: true;
  disclaimer: string;
}

const cache = new Map<string, BacktestResult>();

function legSeries(mint: string, fromIso: string, toIso: string): Map<string, number> {
  const rows = repository.getSnapshots(mint, fromIso, toIso);
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.ts.slice(0, 13), row.priceUsd); // bucket to the hour
  return map;
}

export function backtest(basketSlug: string, window: BacktestWindow): BacktestResult {
  const basket = repository.getBasketBySlug(basketSlug);
  if (!basket) throw new Error(`BASKET_NOT_FOUND:${basketSlug}`);
  const version = repository.getBasketVersion(basket.activeVersionId);
  if (!version) throw new Error(`ACTIVE_VERSION_NOT_FOUND:${basketSlug}`);

  const cacheKey = `${version.id}:${window}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const to = new Date();
  const from = new Date(to.getTime() - WINDOW_DAYS[window] * 24 * 3600 * 1000);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const excludedLegs: BacktestResult["excludedLegs"] = [];
  const seriesByMint = new Map<string, Map<string, number>>();
  let commonStartHour = "";

  for (const leg of version.legs) {
    const token = repository.getToken(leg.mint);
    const series = legSeries(leg.mint, fromIso, toIso);
    if (series.size < 10) {
      excludedLegs.push({
        mint: leg.mint,
        symbol: token?.symbol ?? leg.mint.slice(0, 6),
        reason: "insufficient snapshot history in window",
      });
      continue;
    }
    const firstHour = [...series.keys()].sort()[0];
    if (!commonStartHour || firstHour > commonStartHour) commonStartHour = firstHour;
    seriesByMint.set(leg.mint, series);
  }

  if (seriesByMint.size === 0) {
    throw new Error(`NO_BACKTESTABLE_LEGS:${basketSlug}`);
  }

  // Normalize each leg to its value at the earliest common hour, weight & sum.
  const hours = [...seriesByMint.values()].map((s) => [...s.keys()].filter((h) => h >= commonStartHour));
  const allHours = [...new Set(hours.flat())].sort();
  const sampled = allHours.filter((_, i) => allHours.length <= MAX_POINTS || i % Math.ceil(allHours.length / MAX_POINTS) === 0);

  const firstValues = new Map<string, number>();
  for (const [mint, series] of seriesByMint) {
    const hour = [...series.keys()].filter((h) => h >= commonStartHour).sort()[0];
    firstValues.set(mint, series.get(hour) ?? 1);
  }

  const series: BacktestPoint[] = [];
  const totalYears = WINDOW_DAYS[window] / 365;
  for (let i = 0; i < sampled.length; i++) {
    const hour = sampled[i];
    let value = 0;
    let weightTotal = 0;
    for (const leg of version.legs) {
      const legSeriesMap = seriesByMint.get(leg.mint);
      if (!legSeriesMap) continue;
      const price = legSeriesMap.get(hour);
      if (price === undefined) continue; // gap hour: skip leg, renormalise
      value += (leg.weightBps / 10000) * (price / (firstValues.get(leg.mint) ?? price));
      weightTotal += leg.weightBps / 10000;
    }
    if (weightTotal === 0) continue;
    value /= weightTotal; // renormalise over legs present at this hour
    const frac = i / Math.max(sampled.length - 1, 1);
    const yearsElapsed = frac * totalYears;
    series.push({
      ts: `${hour}:00:00.000Z`,
      value: Number(value.toFixed(6)),
      benchmark: Number(Math.pow(1 + BENCHMARK_ANNUAL, yearsElapsed).toFixed(6)),
    });
  }

  const first = series[0]?.value ?? 1;
  const last = series[series.length - 1]?.value ?? 1;
  const benchmarkReturnPct = (Math.pow(1 + BENCHMARK_ANNUAL, totalYears) - 1) * 100;
  const result: BacktestResult = {
    slug: basket.slug,
    basketVersionId: version.id,
    window,
    from: series[0]?.ts ?? fromIso,
    to: series[series.length - 1]?.ts ?? toIso,
    returnPct: Number(((last / first - 1) * 100).toFixed(2)),
    benchmarkReturnPct: Number(benchmarkReturnPct.toFixed(2)),
    alphaPct: Number((((last / first - 1) - (Math.pow(1 + BENCHMARK_ANNUAL, totalYears) - 1)) * 100).toFixed(2)),
    series,
    excludedLegs,
    isHypothetical: true,
    disclaimer: DISCLAIMER,
  };
  cache.set(cacheKey, result);
  return result;
}

/** All five windows for the /performance endpoint (PRD §6). */
export function getPerformance(basketSlug: string): {
  slug: string;
  windows: Record<BacktestWindow, { returnPct: number; benchmarkReturnPct: number; alphaPct: number; points: number }>;
  excludedLegs: BacktestResult["excludedLegs"];
  isHypothetical: true;
  disclaimer: string;
} {
  const basket = repository.getBasketBySlug(basketSlug);
  if (!basket) throw new Error(`BASKET_NOT_FOUND:${basketSlug}`);
  const windows = {} as Record<BacktestWindow, { returnPct: number; benchmarkReturnPct: number; alphaPct: number; points: number }>;
  const excluded = new Map<string, BacktestResult["excludedLegs"][number]>();
  for (const w of WINDOWS) {
    try {
      const r = backtest(basketSlug, w);
      windows[w] = {
        returnPct: r.returnPct,
        benchmarkReturnPct: r.benchmarkReturnPct,
        alphaPct: r.alphaPct,
        points: r.series.length,
      };
      for (const e of r.excludedLegs) excluded.set(e.mint, e);
    } catch (err) {
      if (String(err).startsWith("Error: NO_BACKTESTABLE_LEGS")) {
        continue;
      }
      throw err;
    }
  }
  return {
    slug: basket.slug,
    windows,
    excludedLegs: [...excluded.values()],
    isHypothetical: true,
    disclaimer: DISCLAIMER,
  };
}

export const backtestService = { backtest, getPerformance, WINDOWS };
