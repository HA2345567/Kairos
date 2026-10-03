import type {
  ApiMarket, ApiTrade, ApiPosition, ApiAgent, ApiOracleResolution,
  ApiProtocolStats, ApiPricePoint, MarketCategory, ResolutionSource, Side, TradeKind,
  ApiLiveMarketsResponse, ApiLiveMarketDetail, ApiCandlesticksResponse,
  ApiAgentDetailResponse, ApiAgentPerformanceResponse, ApiComment,
} from "./api-types";

export const apiBaseUrl = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const BASE = apiBaseUrl;

function getWallet(): string | null {
  return null;
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const wallet = getWallet();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(wallet ? { "x-wallet": wallet } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error("Kairos backend offline. Deploy backend/ or use live devnet data.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text || path}`);
  }
  return (await res.json()) as T;
}

export const api = {
  // Markets
  listMarkets: (params: {
    category?: MarketCategory;
    live?: boolean;
    sort?: "volume" | "ending" | "trending" | "newest";
    search?: string;
    take?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && qs.set(k, String(v)));
    return req<{ markets: ApiMarket[] }>(`/api/markets?${qs.toString()}`);
  },
  getMarket: (id: string) =>
    req<{
      market: ApiMarket & { pricePoints: ApiPricePoint[]; oracleResolution?: ApiOracleResolution | null };
      recentTrades: ApiTrade[];
    }>(`/api/markets/${id}`),
  getOrderbook: (id: string) =>
    req<{
      mid: number;
      buyYes: { price: number; size: number }[];
      sellYes: { price: number; size: number }[];
    }>(`/api/markets/${id}/orderbook`),
  getHolders: (id: string) =>
    req<{
      holders: {
        id: string;
        wallet: string;
        handle: string | null;
        isAgent: boolean;
        yesShares: number;
        noShares: number;
        totalShares: number;
        avgPrice: number;
      }[];
    }>(`/api/markets/${id}/holders`),
  createMarket: (body: {
    question: string;
    description?: string;
    category: MarketCategory;
    resolution: ResolutionSource;
    resolutionDetail?: string;
    endsAt: string;
    liquiditySeed?: number;
    isLive?: boolean;
  }) => req<{ market: ApiMarket }>("/api/markets", { method: "POST", body: JSON.stringify(body) }),
  getComments: (marketId: string) =>
    req<{ comments: ApiComment[] }>(`/api/markets/${marketId}/comments`),
  postComment: (marketId: string, body: { text: string; wallet?: string; isAgent?: boolean; gifUrl?: string }) =>
    req<{ comment: ApiComment }>(`/api/markets/${marketId}/comments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Trades
  placeTrade: (body: {
    marketId: string;
    side: Side;
    kind?: TradeKind;
    shares: number;
    price?: number;
    isSell?: boolean;
    txSig?: string;
  }) => req<{ trade: ApiTrade }>("/api/trades", { method: "POST", body: JSON.stringify(body) }),
  recentTrades: (marketId: string) =>
    req<{ trades: ApiTrade[] }>(`/api/trades/recent/${marketId}`),

  // Portfolio
  portfolio: () =>
    req<{
      wallet: string;
      handle: string | null;
      unrealizedPnl: number;
      realizedPnl: number;
      positions: (ApiPosition & { currentValue: number })[];
      recentTrades: (ApiTrade & { question: string; cost: number })[];
      subscriptions: {
        id: string;
        agentId: string;
        agentName: string;
        agentHandle: string;
        agentType: string;
        capital: number;
        pnl: number;
        createdAt: string;
      }[];
    }>("/api/portfolio"),

  // Faucet
  requestFaucet: (wallet: string) =>
    req<{ success: boolean }>("/api/faucet", {
      method: "POST",
      body: JSON.stringify({ wallet }),
    }),

  // Agents
  listAgents: (params?: { type?: string; status?: "live" | "paused"; sort?: "aum" | "pnl" | "winRate" | "sharpe"; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => v !== undefined && qs.set(k, String(v)));
    }
    return req<{ agents: ApiAgent[] }>(`/api/agents?${qs.toString()}`);
  },
  getAgent: (id: string) => req<ApiAgentDetailResponse>(`/api/agents/${id}`),
  getAgentPerformance: (id: string, period: "7d" | "30d" | "90d" | "all" = "30d") =>
    req<ApiAgentPerformanceResponse>(`/api/agents/${id}/performance?period=${period}`),
  subscribeAgent: (id: string, capital: number) =>
    req<{ subscription: unknown }>(`/api/agents/${id}/subscribe`, {
      method: "POST",
      body: JSON.stringify({ capital }),
    }),

  // Live Markets (Institutional)
  liveMarkets: (params?: {
    status?: "open" | "closed" | "settled" | "active" | "all";
    limit?: number;
    offset?: number;
    sort?: "volume" | "ending" | "liquidity" | "newest";
    search?: string;
    category?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => v !== undefined && qs.set(k, String(v)));
    }
    return req<ApiLiveMarketsResponse>(`/api/live?${qs.toString()}`);
  },
  getLiveMarket: (ticker: string) =>
    req<ApiLiveMarketDetail>(`/api/live/${ticker}`),
  getLiveMarketCandlesticks: (ticker: string, interval: "1m" | "5m" | "1h" | "1d" = "1h", limit: number = 100) =>
    req<ApiCandlesticksResponse>(`/api/live/candlesticks/${ticker}?interval=${interval}&limit=${limit}`),
  liveHealthStatus: () =>
    req<{ status: string; markets_available: boolean; cache: unknown; timestamp: string }>("/api/live/health/status"),

  // Oracle
  recentResolutions: () =>
    req<{ resolutions: ApiOracleResolution[] }>("/api/oracle/recent"),
  resolveMarket: (marketId: string, context: string) =>
    req<{ resolution: ApiOracleResolution }>(`/api/oracle/resolve/${marketId}`, {
      method: "POST",
      body: JSON.stringify({ context }),
    }),
  challengeResolution: (marketId: string, reason: string) =>
    req<{ success: boolean }>(`/api/oracle/challenge/${marketId}`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  // Stats
  protocolStats: () => req<ApiProtocolStats>("/api/stats/protocol"),
  leaderboard: () =>
    req<{ leaderboard: { wallet: string; handle?: string | null; pnl: number; positions: number }[] }>(
      "/api/stats/leaderboard",
    ),

  // Social (Watchlist & Alerts)
  toggleWatchlist: (marketId: string) =>
    req<{ status: "added" | "removed"; marketId: string }>("/api/social/watchlist/toggle", {
      method: "POST",
      body: JSON.stringify({ marketId }),
    }),
  getWatchlist: () => req<{ markets: ApiMarket[] }>("/api/social/watchlist"),
  setAlert: (body: { marketId: string; type: string; threshold?: number }) =>
    req<{ alert: unknown }>("/api/social/alerts", { method: "POST", body: JSON.stringify(body) }),
  getAlerts: () => req<{ alerts: unknown[] }>("/api/social/alerts"),
  deleteAlert: (id: string) => req<{ success: boolean }>(`/api/social/alerts/${id}`, { method: "DELETE" }),
  likeComment: (id: string) => req<{ status: "liked" | "unliked"; commentId: string }>(`/api/social/comments/${id}/like`, { method: "POST" }),
  bookmarkComment: (id: string) => req<{ status: "bookmarked" | "unbookmarked"; commentId: string }>(`/api/social/comments/${id}/bookmark`, { method: "POST" }),
  redeemMarket: (marketId: string, txSig: string) =>
    req<{ success: boolean }>("/api/trades/redeem", {
      method: "POST",
      body: JSON.stringify({ marketId, txSig }),
    }),

  // Governance
  govStats: () => req<{ totalStaked: number; apy: number; myStake: number; rewardSol: number; votingPower: number }>("/api/governance/stats"),
  listProposals: () => req<{ proposals: any[] }>("/api/governance/proposals"),
  stakeTokens: (amount: number) => req<{ success: boolean }>("/api/governance/stake", {
    method: "POST",
    body: JSON.stringify({ amount }),
  }),
  voteProposal: (proposalId: string, side: "FOR" | "AGAINST") => req<{ success: boolean }>(`/api/governance/vote/${proposalId}`, {
    method: "POST",
    body: JSON.stringify({ side }),
  }),
};

// Display helpers (kept here to avoid duplication across pages)
export function formatUsd(n: number | undefined | null) {
  if (n === undefined || n === null) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
export function formatNum(n: number | undefined | null) {
  if (n === undefined || n === null) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}
export function timeUntil(iso: string, p0?: boolean): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "ended";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
