// Typed client for the Kairos kalshi-proxy edge function.
// Read-only mirror of Kalshi's public market data.

import { supabase } from "@/integrations/supabase/client";

const FN = "kalshi-proxy";

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  market_type: string;
  title: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  open_time: string;
  close_time: string;
  expiration_time: string;
  status: "active" | "closed" | "settled" | string;
  yes_bid: number;        // ¢
  yes_ask: number;        // ¢
  no_bid: number;
  no_ask: number;
  last_price: number;     // ¢
  previous_yes_bid?: number;
  previous_yes_ask?: number;
  volume: number;
  volume_24h: number;
  liquidity: number;
  open_interest: number;
  notional_value: number;
  category?: string;
  result?: "" | "yes" | "no";
}

interface ListResponse {
  markets: KalshiMarket[];
  cursor?: string;
}

async function call<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && qs.set(k, String(v)));
  const suffix = qs.toString() ? `?${qs}` : "";
  const { data, error } = await supabase.functions.invoke(`${FN}/${path}${suffix}`, {
    method: "GET",
  });
  if (error) throw new Error(error.message);
  return data as T;
}

export const kalshi = {
  listMarkets: (params: { status?: "open" | "closed" | "settled"; limit?: number; cursor?: string; series_ticker?: string } = {}) =>
    call<ListResponse>("markets", params),
  getMarket: (ticker: string) => call<{ market: KalshiMarket }>(`market/${ticker}`),
  getOrderbook: (ticker: string) =>
    call<{ orderbook: { yes: [number, number][]; no: [number, number][] } }>(`market/${ticker}/orderbook`),
  health: () => call<{ ok: boolean; upstream: string }>("health"),
};

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Cents → 0–1 probability. */
export const centsToProb = (c: number) => Math.max(0, Math.min(1, c / 100));
/** Cents → percent string. */
export const centsToPct = (c: number) => `${Math.round(c)}¢`;

export function categorize(m: KalshiMarket): string {
  const t = `${m.title} ${m.event_ticker}`.toLowerCase();
  if (/btc|bitcoin|eth|sol|crypto|hash/.test(t)) return "Crypto";
  if (/election|president|senate|house|congress|trump|biden|harris|vote/.test(t)) return "Politics";
  if (/nfl|nba|mlb|nhl|soccer|premier|world cup|f1|tennis/.test(t)) return "Sports";
  if (/inflation|cpi|fed|gdp|jobs|unemployment|rate/.test(t)) return "Economy";
  if (/oscar|emmy|grammy|movie|netflix|spotify/.test(t)) return "Culture";
  if (/weather|hurricane|temp|snow|rain/.test(t)) return "Weather";
  return "Other";
}

export function trend(m: KalshiMarket): "up" | "down" | "flat" {
  if (m.previous_yes_bid == null) return "flat";
  const d = m.yes_bid - m.previous_yes_bid;
  if (d > 1) return "up";
  if (d < -1) return "down";
  return "flat";
}
