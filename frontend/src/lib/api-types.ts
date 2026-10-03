// Shared API types matching backend Prisma models.

export const CATEGORIES = [
  "Crypto", "Politics", "Sports", "Memes",
  "NFTs", "DeFi", "Social", "AI", "Weather",
] as const;
export type MarketCategory = (typeof CATEGORIES)[number];

export type ResolutionSource = "Pyth" | "Switchboard" | "AIOracle" | "DAOVote";
export type MarketStatus = "open" | "resolving" | "resolved" | "disputed";
export type Outcome = "YES" | "NO" | "INVALID" | "DISPUTED";
export type Side = "YES" | "NO";
export type TradeKind = "market" | "limit" | "stop";

export interface ApiUser {
  id: string;
  wallet: string;
  handle?: string | null;
}

export interface ApiMarket {
  id: string;
  onchainId?: string | null;
  question: string;
  description?: string | null;
  category: MarketCategory;
  resolution: ResolutionSource;
  resolutionDetail?: string | null;
  endsAt: string;
  resolvedAt?: string | null;
  status: MarketStatus;
  outcome?: Outcome | null;
  yesPrice: number;
  noPrice: number;
  liquidity: number;
  volume: number;
  participants: number;
  totalTrades?: number;
  isLive: boolean;
  creator: { wallet: string; handle?: string | null };
  createdAt: string;
  imageUrl?: string | null;
  oracleResolution?: ApiOracleResolution | null;
  outcome_mints: string[];
  collateralMint?: string | null;
  winning_outcome_index?: number | null;
}

export interface ApiPricePoint { yesPrice: number; noPrice: number; ts: string }

export interface ApiTrade {
  id: string;
  marketId: string;
  side: Side;
  kind: TradeKind;
  shares: number;
  price: number;
  cost: number;
  txSig?: string | null;
  createdAt: string;
  wallet?: string | null;
  handle?: string | null;
  isAgent?: boolean;
  user?: { wallet: string; handle?: string | null };
}

export interface ApiComment {
  id: string;
  marketId: string;
  userId?: string | null;
  wallet?: string | null;
  text: string;
  gifUrl?: string | null;
  isAgent: boolean;
  likesCount: number;
  isLiked?: boolean;
  isBookmarked?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiPosition {

  id: string;
  marketId: string;
  yesShares: number;
  noShares: number;
  avgYesCost: number;
  avgNoCost: number;
  realizedPnl: number;
  market: ApiMarket;
}

export interface ApiAgent {
  id: string;
  name: string;
  handle: string;
  wallet: string;
  type: "Sentiment" | "Arbitrage" | "MarketMaker" | "NewsAlpha" | "Momentum";
  description: string;
  pnl30d: number;
  winRate: number;
  sharpe: number;
  maxDrawdown: number;
  aum: number;
  performanceFee: number;
  uptime: number;
  marketsTraded: number;
  status: "live" | "paused";
  _count?: { subscriptions: number };
}

export interface ApiOracleResolution {
  id: string;
  marketId: string;
  outcome: Outcome;
  consensus: number;
  totalVotes: number;
  tally?: { YES: number; NO: number; INVALID: number };
  weightedConfidence?: { YES: number; NO: number; INVALID: number };
  averageConfidence?: number;
  consensusThreshold?: number;
  isDisputed?: boolean;
  reasoning?: string | null;
  createdAt: string;
  market: ApiMarket;
  votes: {
    id: string;
    vote: Outcome;
    confidence: number;
    evidence?: string | null;
    agent: ApiAgent;
  }[];
}

export interface ApiProtocolStats {
  markets: number;
  openMarkets: number;
  agents: number;
  users: number;
  totalVolume: number;
  totalLiquidity: number;
}

// ────────────────────────────────────────────────────────────────
// Kalshi Live Markets
// ────────────────────────────────────────────────────────────────

export interface KalshiMarketLive {
  ticker: string;
  title: string;
  subtitle?: string;
  category: string;
  status: string; // "active" | "closed" | "settled"
  yes_bid: number; // in cents
  yes_ask: number; // in cents
  no_bid: number; // in cents
  no_ask: number; // in cents
  yes_prob: number; // 0-1
  trend: "up" | "down" | "flat";
  volume_24h: number;
  liquidity: number;
  open_interest: number;
  close_time: string;
  event_ticker: string;
}

export interface ApiLiveMarketsResponse {
  markets: KalshiMarketLive[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  meta: {
    activeCount: number;
    closedCount: number;
    settledCount: number;
    totalVolume: number;
    totalLiquidity: number;
    categories: {
      crypto: number;
      politics: number;
      sports: number;
      economy: number;
      culture: number;
      weather: number;
      other: number;
    };
    cacheAge: number; // milliseconds
  };
}

export interface OrderbookLevel {
  price: number; // cents
  quantity: number;
}

export interface ApiLiveMarketDetail {
  market: {
    ticker: string;
    title: string;
    subtitle?: string;
    description?: string;
    category: string;
    status: string;
    yes_bid: number;
    yes_ask: number;
    no_bid: number;
    no_ask: number;
    yes_prob: number;
    trend: "up" | "down" | "flat";
    volume_24h: number;
    volume: number;
    liquidity: number;
    open_interest: number;
    notional_value: number;
    close_time: string;
    event_ticker: string;
    result?: string;
  };
  orderbook: {
    yes: { bids: OrderbookLevel[]; asks: OrderbookLevel[] };
    no: { bids: OrderbookLevel[]; asks: OrderbookLevel[] };
  };
}

export interface Candlestick {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ApiCandlesticksResponse {
  ticker: string;
  interval: string;
  candlesticks: Candlestick[];
}

// ────────────────────────────────────────────────────────────────
// Agent Performance Metrics
// ────────────────────────────────────────────────────────────────

export interface AgentPerformanceMetrics {
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  winRate: number;
  winningTrades: number;
  losingTrades: number;
  totalTrades: number;
  maxDrawdown: number;
  sharpe: number;
}

export interface AgentTrade {
  id: string;
  market: {
    id: string;
    question: string;
    category: string;
    outcome?: string;
    status: string;
  };
  side: string;
  shares: number;
  price: number;
  cost: number;
  createdAt: string;
  status: "won" | "lost" | "pending";
}

export interface ApiAgentDetailResponse {
  agent: ApiAgent & {
    subscriptionCount: number;
    oracleVotesCount: number;
  };
  performance: AgentPerformanceMetrics;
  recentTrades: AgentTrade[];
}

export interface ApiAgentPerformanceResponse {
  agent: {
    id: string;
    name: string;
    handle: string;
    type: string;
    aum: number;
    status: string;
  };
  period: string; // "7d" | "30d" | "90d" | "all"
  performance: AgentPerformanceMetrics;
  timestamp: string;
}
