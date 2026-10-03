/**
 * Technical Analysis & Quantitative Metrics Engine
 * 
 * Provides production-grade calculations for:
 * - Simple Moving Average (SMA)
 * - Exponential Moving Average (EMA)
 * - Relative Strength Index (RSI - 14 period Wilder's Smoothing)
 * - Maximum Drawdown (MDD)
 * - Annualized Volatility (Standard deviation of daily log returns)
 * - Sharpe Ratio (Risk-adjusted excess return)
 * - Live Basket NAV & Weight Distribution from real-time token price feeds
 */

export interface TechnicalPoint {
  timestamp: number;
  dateStr: string;
  navValue: number;
  returnPct: number;
  sma20: number | null;
  ema50: number | null;
  rsi14: number | null;
  drawdownPct: number;
}

export interface TechnicalSummary {
  currentNav: number;
  currentReturnPct: number;
  sma20: number | null;
  isAboveSma20: boolean;
  rsi14: number | null;
  rsiSignal: "Overbought" | "Bullish Momentum" | "Neutral" | "Bearish Pressure" | "Oversold";
  annualizedVolatilityPct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  peakNav: number;
  troughNav: number;
  high52w: number;
  low52w: number;
}

/**
 * Calculates complete technical indicators across a historical NAV series.
 */
export function computeTechnicalIndicators(
  history: { timestamp: number; navValue: number }[]
): {
  points: TechnicalPoint[];
  summary: TechnicalSummary;
} {
  if (!history || history.length === 0) {
    return {
      points: [],
      summary: {
        currentNav: 0,
        currentReturnPct: 0,
        sma20: null,
        isAboveSma20: false,
        rsi14: null,
        rsiSignal: "Neutral",
        annualizedVolatilityPct: 0,
        sharpeRatio: 0,
        maxDrawdownPct: 0,
        peakNav: 0,
        troughNav: 0,
        high52w: 0,
        low52w: 0,
      },
    };
  }

  const startNav = history[0].navValue;
  const navValues = history.map((h) => h.navValue);
  const n = history.length;

  // 1. SMA 20
  const smaWindow = 20;
  const smaValues: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    if (i < smaWindow - 1) {
      smaValues.push(null);
    } else {
      const slice = navValues.slice(i - smaWindow + 1, i + 1);
      const sum = slice.reduce((a, b) => a + b, 0);
      smaValues.push(Number((sum / smaWindow).toFixed(4)));
    }
  }

  // 2. EMA 50
  const emaWindow = Math.min(50, Math.floor(n / 2) || 1);
  const emaMultiplier = 2 / (emaWindow + 1);
  const emaValues: (number | null)[] = [];
  let prevEma: number | null = null;
  for (let i = 0; i < n; i++) {
    if (i < emaWindow - 1) {
      emaValues.push(null);
    } else if (i === emaWindow - 1) {
      const slice = navValues.slice(0, emaWindow);
      prevEma = slice.reduce((a, b) => a + b, 0) / emaWindow;
      emaValues.push(Number(prevEma.toFixed(4)));
    } else {
      prevEma = (navValues[i] - prevEma!) * emaMultiplier + prevEma!;
      emaValues.push(Number(prevEma.toFixed(4)));
    }
  }

  // 3. RSI 14 (Wilder's Smoothing)
  const rsiPeriod = 14;
  const rsiValues: (number | null)[] = [];
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < n; i++) {
    if (i === 0) {
      rsiValues.push(null);
      continue;
    }

    const change = navValues[i] - navValues[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    if (i < rsiPeriod) {
      avgGain += gain;
      avgLoss += loss;
      rsiValues.push(null);
    } else if (i === rsiPeriod) {
      avgGain = (avgGain + gain) / rsiPeriod;
      avgLoss = (avgLoss + loss) / rsiPeriod;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
      rsiValues.push(Number(rsi.toFixed(1)));
    } else {
      avgGain = (avgGain * (rsiPeriod - 1) + gain) / rsiPeriod;
      avgLoss = (avgLoss * (rsiPeriod - 1) + loss) / rsiPeriod;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
      rsiValues.push(Number(rsi.toFixed(1)));
    }
  }

  // 4. Drawdowns and Peaks
  let peak = -Infinity;
  let maxDd = 0;
  const drawdownValues: number[] = [];

  for (let i = 0; i < n; i++) {
    if (navValues[i] > peak) {
      peak = navValues[i];
    }
    const dd = peak > 0 ? ((navValues[i] - peak) / peak) * 100 : 0;
    drawdownValues.push(Number(dd.toFixed(2)));
    if (dd < maxDd) {
      maxDd = dd;
    }
  }

  // 5. Volatility (Annualized log returns)
  const logReturns: number[] = [];
  for (let i = 1; i < n; i++) {
    if (navValues[i - 1] > 0 && navValues[i] > 0) {
      logReturns.push(Math.log(navValues[i] / navValues[i - 1]));
    }
  }

  let annualizedVol = 0;
  if (logReturns.length > 1) {
    const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance =
      logReturns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) /
      (logReturns.length - 1);
    const dailyStdDev = Math.sqrt(variance);
    annualizedVol = dailyStdDev * Math.sqrt(365) * 100;
  }

  // 6. Annualized Return & Sharpe Ratio
  const currentNav = navValues[n - 1];
  const totalDays = Math.max(1, (history[n - 1].timestamp - history[0].timestamp) / (86400 * 1000));
  const totalReturn = startNav > 0 ? (currentNav - startNav) / startNav : 0;
  const annualizedReturn = Math.pow(1 + Math.max(-0.99, totalReturn), 365 / totalDays) - 1;
  const riskFreeRate = 0.045; // 4.5% baseline yield
  const sharpe =
    annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / (annualizedVol / 100) : 0;

  // 7. Latest RSI & Signal
  const latestRsi = rsiValues[n - 1] ?? (rsiValues.filter(Boolean).pop() || 50);
  let rsiSignal: TechnicalSummary["rsiSignal"] = "Neutral";
  if (latestRsi >= 70) rsiSignal = "Overbought";
  else if (latestRsi >= 55) rsiSignal = "Bullish Momentum";
  else if (latestRsi <= 30) rsiSignal = "Oversold";
  else if (latestRsi <= 45) rsiSignal = "Bearish Pressure";

  const latestSma20 = smaValues[n - 1] ?? null;

  const points: TechnicalPoint[] = history.map((h, i) => {
    const d = new Date(h.timestamp);
    const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const retPct = startNav > 0 ? ((h.navValue - startNav) / startNav) * 100 : 0;

    return {
      timestamp: h.timestamp,
      dateStr,
      navValue: Number(h.navValue.toFixed(4)),
      returnPct: Number(retPct.toFixed(2)),
      sma20: smaValues[i],
      ema50: emaValues[i],
      rsi14: rsiValues[i],
      drawdownPct: drawdownValues[i],
    };
  });

  return {
    points,
    summary: {
      currentNav: Number(currentNav.toFixed(4)),
      currentReturnPct: Number((totalReturn * 100).toFixed(2)),
      sma20: latestSma20,
      isAboveSma20: latestSma20 !== null ? currentNav >= latestSma20 : true,
      rsi14: latestRsi,
      rsiSignal,
      annualizedVolatilityPct: Number(annualizedVol.toFixed(1)),
      sharpeRatio: Number(sharpe.toFixed(2)),
      maxDrawdownPct: Number(maxDd.toFixed(2)),
      peakNav: Number(Math.max(...navValues).toFixed(4)),
      troughNav: Number(Math.min(...navValues).toFixed(4)),
      high52w: Number(Math.max(...navValues).toFixed(4)),
      low52w: Number(Math.min(...navValues).toFixed(4)),
    },
  };
}

/**
 * Computes live real-time Basket NAV and aggregated 24h performance
 * by combining individual token prices with their exact bps weights.
 */
export function computeLiveBasketPrice(
  tokens: { weightBps: number; mint: string; priceMint?: string; priceUsd: number; change24h: number }[],
  livePrices: Record<string, { priceUsd: number; change24h: number }>
): {
  liveNavUsd: number;
  liveChange24hPct: number;
  hasLivePrices: boolean;
} {
  let weightedNav = 0;
  let weightedChange24h = 0;
  let liveMatchCount = 0;

  for (const t of tokens) {
    const lookupMint = t.priceMint ?? t.mint;
    const live = livePrices[lookupMint] || livePrices[t.mint];

    const price = live?.priceUsd && live.priceUsd > 0 ? live.priceUsd : t.priceUsd;
    const change = live?.change24h !== undefined ? live.change24h : t.change24h;

    if (live) liveMatchCount++;

    const weightRatio = t.weightBps / 10000;
    weightedNav += price * weightRatio;
    weightedChange24h += change * weightRatio;
  }

  return {
    liveNavUsd: Number(weightedNav.toFixed(4)),
    liveChange24hPct: Number(weightedChange24h.toFixed(2)),
    hasLivePrices: liveMatchCount > 0,
  };
}
