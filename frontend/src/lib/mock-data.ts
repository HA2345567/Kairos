export type MarketCategory =
  | "Crypto"
  | "Politics"
  | "Sports"
  | "Memes"
  | "NFTs"
  | "DeFi"
  | "Social"
  | "AI";

export type ResolutionSource = "Pyth" | "Switchboard" | "AI Oracle" | "DAO Vote";

export interface Market {
  id: string;
  question: string;
  category: MarketCategory;
  resolution: ResolutionSource;
  endsAt: string; // ISO
  volume: number;
  liquidity: number;
  yesPrice: number; // 0-1
  noPrice: number;
  participants: number;
  trend: number; // -1 to 1
  isLive?: boolean;
  creator: string;
  createdAgo: string;
}

export const MARKETS: Market[] = [
  {
    id: "m-001",
    question: "Will BTC close above $145,000 by end of May 2026?",
    category: "Crypto",
    resolution: "Pyth",
    endsAt: "2026-05-31T23:59:00Z",
    volume: 4_280_410,
    liquidity: 982_000,
    yesPrice: 0.62,
    noPrice: 0.38,
    participants: 1842,
    trend: 0.08,
    creator: "0xPyth.sol",
    createdAgo: "2d ago",
  },
  {
    id: "m-002",
    question: "Will SOL flip ETH in 24h DEX volume this week?",
    category: "DeFi",
    resolution: "Switchboard",
    endsAt: "2026-05-04T00:00:00Z",
    volume: 1_120_000,
    liquidity: 312_000,
    yesPrice: 0.41,
    noPrice: 0.59,
    participants: 612,
    trend: -0.04,
    creator: "jupiter.dao",
    createdAgo: "6h ago",
  },
  {
    id: "m-003",
    question: "Next BONK candle: will it close green in 15 min?",
    category: "Memes",
    resolution: "Pyth",
    endsAt: "2026-04-26T18:15:00Z",
    volume: 84_220,
    liquidity: 22_800,
    yesPrice: 0.53,
    noPrice: 0.47,
    participants: 1208,
    trend: 0.12,
    isLive: true,
    creator: "memelord.sol",
    createdAgo: "3m ago",
  },
  {
    id: "m-004",
    question: "Will Mad Lads floor exceed 60 SOL by Friday?",
    category: "NFTs",
    resolution: "AI Oracle",
    endsAt: "2026-05-02T20:00:00Z",
    volume: 312_440,
    liquidity: 88_000,
    yesPrice: 0.27,
    noPrice: 0.73,
    participants: 421,
    trend: -0.09,
    creator: "lads.dao",
    createdAgo: "1d ago",
  },
  {
    id: "m-005",
    question: "Will any new pump.fun token reach $50M MC this week?",
    category: "Memes",
    resolution: "AI Oracle",
    endsAt: "2026-05-03T00:00:00Z",
    volume: 728_000,
    liquidity: 145_000,
    yesPrice: 0.71,
    noPrice: 0.29,
    participants: 988,
    trend: 0.21,
    creator: "agent-0x9f.eth",
    createdAgo: "11h ago",
  },
  {
    id: "m-006",
    question: "Will Jupiter daily volume exceed $1B by Sunday?",
    category: "DeFi",
    resolution: "Switchboard",
    endsAt: "2026-04-28T00:00:00Z",
    volume: 198_900,
    liquidity: 56_400,
    yesPrice: 0.48,
    noPrice: 0.52,
    participants: 312,
    trend: 0.02,
    creator: "jup.research",
    createdAgo: "8h ago",
  },
  {
    id: "m-007",
    question: "Will the next Fed meeting cut rates by 25bps?",
    category: "Politics",
    resolution: "AI Oracle",
    endsAt: "2026-06-12T18:00:00Z",
    volume: 2_410_000,
    liquidity: 540_000,
    yesPrice: 0.34,
    noPrice: 0.66,
    participants: 2104,
    trend: -0.05,
    creator: "macro.sol",
    createdAgo: "3d ago",
  },
  {
    id: "m-008",
    question: "Will GPT-6 be announced before July 1, 2026?",
    category: "AI",
    resolution: "AI Oracle",
    endsAt: "2026-06-30T23:59:00Z",
    volume: 612_000,
    liquidity: 184_000,
    yesPrice: 0.29,
    noPrice: 0.71,
    participants: 901,
    trend: 0.06,
    creator: "agent.research.sol",
    createdAgo: "5d ago",
  },
  {
    id: "m-009",
    question: "Will the Lakers make the 2026 NBA Finals?",
    category: "Sports",
    resolution: "AI Oracle",
    endsAt: "2026-06-01T00:00:00Z",
    volume: 1_840_000,
    liquidity: 402_000,
    yesPrice: 0.18,
    noPrice: 0.82,
    participants: 1421,
    trend: -0.03,
    creator: "hoops.dao",
    createdAgo: "1w ago",
  },
  {
    id: "m-010",
    question: "Will this Farcaster cast hit 1k recasts in 24h?",
    category: "Social",
    resolution: "AI Oracle",
    endsAt: "2026-04-27T15:00:00Z",
    volume: 38_400,
    liquidity: 12_000,
    yesPrice: 0.56,
    noPrice: 0.44,
    participants: 188,
    trend: 0.14,
    isLive: true,
    creator: "dwr.eth",
    createdAgo: "20m ago",
  },
];

export const CATEGORIES: MarketCategory[] = [
  "Crypto",
  "Politics",
  "Sports",
  "Memes",
  "NFTs",
  "DeFi",
  "Social",
  "AI",
];

export interface AgentProfile {
  id: string;
  name: string;
  handle: string;
  type: "Sentiment" | "Arbitrage" | "Market Maker" | "News Alpha" | "Momentum";
  description: string;
  pnl30d: number; // %
  winRate: number; // %
  sharpe: number;
  maxDrawdown: number; // %
  aum: number; // USDC
  subscribers: number;
  performanceFee: number; // %
  uptime: number; // %
  marketsTraded: number;
  status: "live" | "paused";
}

export const AGENTS: AgentProfile[] = [
  {
    id: "a-001",
    name: "Pulse",
    handle: "pulse.agent.sol",
    type: "Sentiment",
    description:
      "Monitors X, Farcaster and Reddit firehoses. Trades narrative shifts within a single Solana slot.",
    pnl30d: 42.3,
    winRate: 61,
    sharpe: 2.4,
    maxDrawdown: -8.2,
    aum: 1_240_000,
    subscribers: 482,
    performanceFee: 15,
    uptime: 99.98,
    marketsTraded: 1842,
    status: "live",
  },
  {
    id: "a-002",
    name: "Arc",
    handle: "arc.agent.sol",
    type: "Arbitrage",
    description:
      "Cross-venue spread capture across Kairos, Polymarket and institutional liquidity sources via Jupiter routing.",
    pnl30d: 18.7,
    winRate: 78,
    sharpe: 3.9,
    maxDrawdown: -2.1,
    aum: 4_120_000,
    subscribers: 1204,
    performanceFee: 20,
    uptime: 100,
    marketsTraded: 9420,
    status: "live",
  },
  {
    id: "a-003",
    name: "Anchor",
    handle: "anchor.agent.sol",
    type: "Market Maker",
    description:
      "Provides two-sided liquidity to thin and long-tail markets. Earns AMM fees and PREDICT emissions.",
    pnl30d: 11.4,
    winRate: 54,
    sharpe: 2.1,
    maxDrawdown: -4.4,
    aum: 8_840_000,
    subscribers: 312,
    performanceFee: 10,
    uptime: 99.91,
    marketsTraded: 2104,
    status: "live",
  },
  {
    id: "a-004",
    name: "Wire",
    handle: "wire.agent.sol",
    type: "News Alpha",
    description:
      "Web search + reasoning loop. Trades within ~400ms of breaking news publication.",
    pnl30d: 67.1,
    winRate: 58,
    sharpe: 2.8,
    maxDrawdown: -12.4,
    aum: 612_000,
    subscribers: 188,
    performanceFee: 20,
    uptime: 99.4,
    marketsTraded: 320,
    status: "live",
  },
  {
    id: "a-005",
    name: "Drift",
    handle: "drift.agent.sol",
    type: "Momentum",
    description:
      "Identifies markets with rapidly shifting odds. Rides confirmed trends, exits on mean-reversion signals.",
    pnl30d: 29.6,
    winRate: 49,
    sharpe: 1.9,
    maxDrawdown: -14.0,
    aum: 980_000,
    subscribers: 244,
    performanceFee: 15,
    uptime: 99.7,
    marketsTraded: 1102,
    status: "paused",
  },
  {
    id: "a-006",
    name: "Lattice",
    handle: "lattice.agent.sol",
    type: "Arbitrage",
    description:
      "Statistical arbitrage across correlated markets. Hedges with perps via Drift Protocol.",
    pnl30d: 22.0,
    winRate: 71,
    sharpe: 3.2,
    maxDrawdown: -3.8,
    aum: 2_640_000,
    subscribers: 612,
    performanceFee: 18,
    uptime: 99.95,
    marketsTraded: 4220,
    status: "live",
  },
];

export const ORACLE_RESOLUTIONS = [
  { id: "r-1", market: "Did SpaceX achieve orbital reuse before April 2026?", agents: 5, consensus: 5, outcome: "YES", time: "42m" },
  { id: "r-2", market: "Did the Fed announce QT taper at the March meeting?", agents: 5, consensus: 4, outcome: "NO", time: "1h" },
  { id: "r-3", market: "Did BONK trend on X for 3+ hours yesterday?", agents: 5, consensus: 5, outcome: "YES", time: "18m" },
  { id: "r-4", market: "Did Vitalik publish a post tagged 'rollups' last week?", agents: 5, consensus: 5, outcome: "YES", time: "9m" },
  { id: "r-5", market: "Did Mad Lads floor cross 70 SOL between Mar 1–15?", agents: 5, consensus: 4, outcome: "NO", time: "2h" },
];

export function formatUsd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "ended";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
