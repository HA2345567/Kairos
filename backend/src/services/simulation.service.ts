import { config } from "../config";
import { repository } from "../db/repository";
import { AppError } from "../errors";
import { WINDOWS, WINDOW_DAYS, type BacktestWindow } from "./backtest.service";

/**
 * Custom-allocation simulation (FR-26, glossary "Simulation").
 *
 * Returns a hypothetical index series for a caller-supplied allocation, based at
 * a fixed 1000. Nothing is extrapolated or fabricated:
 *   - legs without verified snapshot history are excluded with a reason;
 *   - a leg that is unknown or denylisted is refused outright;
 *   - the benchmark is reported as unavailable unless a configured benchmark
 *     mint has real verified history.
 *
 * The series construction mirrors backtest.service: hourly bucketing,
 * first-value normalisation over the earliest common hour, and renormalisation
 * across legs that actually have a price at that hour.
 */

export const SIMULATION_BASE = 1000;
const MAX_LEGS = 12;
const MAX_POINTS = 400;
const MIN_LEG_POINTS = 10;
const DISCLAIMER =
  "Hypothetical reweighted simulation from verified price snapshots. Excludes execution costs, liquidity, price impact, taxes, and future market conditions; not a representation of future returns.";

export interface SimulationAllocation {
  mint: string;
  weightBps: number;
}

export interface SimulationInput {
  allocations: SimulationAllocation[];
  window?: string;
}

export interface SimulationPoint {
  ts: string;
  value: number;
}

export interface SimulationResult {
  window: BacktestWindow;
  base: number;
  from: string | null;
  to: string | null;
  returnPct: number | null;
  series: SimulationPoint[];
  allocations: Array<{ mint: string; symbol: string; weightBps: number; included: boolean }>;
  excluded: Array<{ mint: string; symbol: string; reason: string }>;
  benchmark: {
    available: boolean;
    symbol: string | null;
    mint: string | null;
    returnPct: number | null;
    series: SimulationPoint[];
    label: string;
  };
  unavailableReason: string | null;
  isHypothetical: true;
  disclaimer: string;
}

function resolveWindow(window?: string): BacktestWindow {
  if (!window) return "1Y";
  if (!WINDOWS.includes(window as BacktestWindow)) {
    throw new AppError("INVALID_INPUT", `window must be one of ${WINDOWS.join(", ")}`);
  }
  return window as BacktestWindow;
}

function validateAllocations(allocations: SimulationAllocation[]): void {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new AppError("INVALID_INPUT", "At least one allocation is required");
  }
  if (allocations.length > MAX_LEGS) {
    throw new AppError("INVALID_INPUT", `At most ${MAX_LEGS} allocations are supported`);
  }
  for (const allocation of allocations) {
    if (!Number.isInteger(allocation.weightBps) || allocation.weightBps <= 0) {
      throw new AppError("INVALID_INPUT", "Every weight must be a positive integer in basis points");
    }
  }
  const mints = new Set(allocations.map((a) => a.mint));
  if (mints.size !== allocations.length) {
    throw new AppError("INVALID_INPUT", "Allocations must reference distinct mints");
  }
  const sum = allocations.reduce((total, a) => total + a.weightBps, 0);
  if (sum !== 10_000) {
    throw new AppError("WEIGHT_SUM_INVALID", `Allocation weights sum to ${sum}, expected 10000`);
  }
}

async function hourlySeries(mint: string, fromIso: string, toIso: string): Promise<Map<string, number>> {
  const rows = (await repository.getSnapshots(mint, fromIso, toIso));
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.ts.slice(0, 13), row.priceUsd); // bucket to the hour
  return map;
}

/** Normalised index series, rebased so the first point equals SIMULATION_BASE. */
function buildSeries(
  seriesByMint: Map<string, Map<string, number>>,
  weights: Map<string, number>,
  commonStartHour: string
): SimulationPoint[] {
  const hours = [...seriesByMint.values()].map((series) =>
    [...series.keys()].filter((hour) => hour >= commonStartHour)
  );
  const allHours = [...new Set(hours.flat())].sort();
  const sampled =
    allHours.length <= MAX_POINTS
      ? allHours
      : allHours.filter((_, i) => i % Math.ceil(allHours.length / MAX_POINTS) === 0);

  const firstValues = new Map<string, number>();
  for (const [mint, series] of seriesByMint) {
    const firstHour = [...series.keys()].filter((hour) => hour >= commonStartHour).sort()[0];
    firstValues.set(mint, series.get(firstHour) ?? 1);
  }

  const points: SimulationPoint[] = [];
  for (const hour of sampled) {
    let value = 0;
    let weightTotal = 0;
    for (const [mint, series] of seriesByMint) {
      const price = series.get(hour);
      if (price === undefined) continue; // gap hour: skip the leg, renormalise below
      const weight = (weights.get(mint) ?? 0) / 10_000;
      value += weight * (price / (firstValues.get(mint) ?? price));
      weightTotal += weight;
    }
    if (weightTotal === 0) continue;
    points.push({
      ts: `${hour}:00:00.000Z`,
      value: Number(((value / weightTotal) * SIMULATION_BASE).toFixed(6)),
    });
  }
  return points;
}

async function benchmarkSeries(
  fromIso: string,
  toIso: string
): Promise<SimulationResult["benchmark"]> {
  const mint = config.simulationBenchmarkMint;
  const unavailable = (reason: string): SimulationResult["benchmark"] => ({
    available: false,
    symbol: null,
    mint: mint || null,
    returnPct: null,
    series: [],
    label: `Unavailable: ${reason}`,
  });

  if (!mint) {
    return unavailable("no verified benchmark feed is configured");
  }
  const token = (await repository.getToken(mint));
  const series = (await hourlySeries(mint, fromIso, toIso));
  if (series.size < MIN_LEG_POINTS) {
    return unavailable("benchmark has insufficient verified snapshot history in this window");
  }
  const points = buildSeries(new Map([[mint, series]]), new Map([[mint, 10_000]]), "");
  const first = points[0]?.value ?? SIMULATION_BASE;
  const last = points[points.length - 1]?.value ?? SIMULATION_BASE;
  return {
    available: true,
    symbol: token?.symbol ?? mint.slice(0, 6),
    mint,
    returnPct: Number(((last / first - 1) * 100).toFixed(2)),
    series: points,
    label: `${token?.symbol ?? mint.slice(0, 6)} buy-and-hold, verified snapshots`,
  };
}

export async function simulateGraph(input: SimulationInput): Promise<SimulationResult> {
  validateAllocations(input.allocations);
  const window = resolveWindow(input.window);

  const to = new Date();
  const from = new Date(to.getTime() - WINDOW_DAYS[window] * 24 * 3600 * 1000);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const seriesByMint = new Map<string, Map<string, number>>();
  const weights = new Map<string, number>();
  const allocations: SimulationResult["allocations"] = [];
  const excluded: SimulationResult["excluded"] = [];
  let commonStartHour = "";

  for (const allocation of input.allocations) {
    const token = (await repository.getToken(allocation.mint));
    if (!token) {
      throw new AppError("MINT_NOT_ALLOWED", `Mint ${allocation.mint} is not in the token registry`);
    }
    if (token.denylisted) {
      throw new AppError("MINT_NOT_ALLOWED", `${token.symbol} is denylisted and cannot be simulated`);
    }

    const series = (await hourlySeries(allocation.mint, fromIso, toIso));
    if (series.size < MIN_LEG_POINTS) {
      excluded.push({
        mint: allocation.mint,
        symbol: token.symbol,
        reason: "insufficient verified snapshot history in this window",
      });
      allocations.push({ mint: allocation.mint, symbol: token.symbol, weightBps: allocation.weightBps, included: false });
      continue;
    }

    const firstHour = [...series.keys()].sort()[0];
    if (!commonStartHour || firstHour > commonStartHour) commonStartHour = firstHour;
    seriesByMint.set(allocation.mint, series);
    weights.set(allocation.mint, allocation.weightBps);
    allocations.push({ mint: allocation.mint, symbol: token.symbol, weightBps: allocation.weightBps, included: true });
  }

  const series = seriesByMint.size > 0 ? buildSeries(seriesByMint, weights, commonStartHour) : [];
  const benchmark = await benchmarkSeries(fromIso, toIso);
  const first = series[0]?.value;
  const last = series[series.length - 1]?.value;

  return {
    window,
    base: SIMULATION_BASE,
    from: series[0]?.ts ?? null,
    to: series[series.length - 1]?.ts ?? null,
    returnPct:
      first === undefined || last === undefined || first === 0
        ? null
        : Number(((last / first - 1) * 100).toFixed(2)),
    series,
    allocations,
    excluded,
    benchmark,
    unavailableReason:
      series.length === 0
        ? "No allocated asset has enough verified snapshot history to simulate this window."
        : null,
    isHypothetical: true,
    disclaimer: DISCLAIMER,
  };
}

export const simulationService = { simulateGraph, SIMULATION_BASE };
