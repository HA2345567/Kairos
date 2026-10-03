export interface BasketToken {
  symbol: string;
  name: string;
  mint: string;          // on-chain mint (devnet or mainnet)
  priceMint?: string;    // mainnet mint used for Jupiter price/quote lookups
  weightBps: number;     // e.g. 5000 = 50%
  icon: string;
  priceUsd: number;
  change24h: number;
}

export interface Basket {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  pointsMultiplier?: string; // e.g. "3x Pts"
  imageUrl?: string;
  returns7d: number;
  returns30d: number;
  returns1y: number;
  displayReturn?: {
    value: string;
    period: string;
    isPositive: boolean;
  };
  sparkline?: number[];
  extraTokensCount?: number;
  tvlUsd: number;
  isInvestable?: boolean;
  comingSoon?: boolean;
  tokens: BasketToken[];
  chartData: { time: string; value: number }[];
  aboutStrategy?: {
    summary: string;
    thesis: string;
    constituentsRationale: { symbol: string; rationale: string }[];
    rebalances?: {
      title: string;
      version: string;
      date: string;
      changes: [string, string, string][];
      bullets: string[];
    }[];
    risks?: string[];
    characteristics?: string[];
  };
}

/**
 * Kairos — Final Launch Basket Catalog (Locked)
 * 1. Solana Infrastructure (CLOUD 10.6%, BP 10%, JUP 9%, JitoSOL 8%, SOL 8%, mSOL 8%, KMNO 8%, RAY 8%, ORCA 8%, MET 8%, ARX 8%, JTO 6.4%)
 * 2. Solana Sigma Basket (PYTH 35%, JUP 25%, KMNO 20%, RENDER 20%)
 * 3. Solana Culture & Memes (BONK 40%, TRUMP 30%, PENGU 30%)
 * 4. Solana AI & Compute (RENDER 30%, FARTCOIN 25%, PIPPIN 25%, GOAT 20%)
 * 5. Solana DePIN Infrastructure (HNT 50%, IOT 25%, MOBILE 25%)
 */
export const DEVNET_DEMO_BASKET: Basket = {
  id: "solana-infra-governance",
  slug: "solana-infra-governance",
  name: "Solana Infra Governance",
  category: "Infrastructure",
  pointsMultiplier: "3x Pts",
  imageUrl: "/baskets/solana-infra-governance.jpg",
  description: "Devnet Demo Basket: Real Raydium CPMM swaps into 50% tJUP and 50% tJTO directly to your wallet.",
  returns7d: 18.2,
  returns30d: 56.4,
  returns1y: 212.8,
  displayReturn: {
    value: "+212.80%",
    period: "1 YEAR RETURN",
    isPositive: true,
  },
  sparkline: [20, 24, 28, 34, 42, 51, 63, 76, 92, 114, 138, 162, 185, 201, 212],
  extraTokensCount: 0,
  tvlUsd: 1250000,
  isInvestable: true,
  comingSoon: false,
  tokens: [
    {
      symbol: "tJUP",
      name: "Jupiter (Devnet)",
      mint: "atvmDFJj7iGLBqJywzbs1Xo9SBpfp3eYjm268g9pwen",
      priceMint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // mainnet JUP
      weightBps: 5000,
      icon: "/tokens/jup.png",
      priceUsd: 0.85,
      change24h: 3.4,
    },
    {
      symbol: "tJTO",
      name: "Jito (Devnet)",
      mint: "8YNCULLBG3u4Si2RQpfAidrv84GVifcf5U1wiEXi95Jg",
      priceMint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL", // mainnet JTO
      weightBps: 5000,
      icon: "/tokens/jto.png",
      priceUsd: 2.3,
      change24h: 4.1,
    },
  ],
  chartData: [
    { time: "2024-01-01", value: 100 },
    { time: "2024-02-01", value: 115 },
    { time: "2024-03-01", value: 140 },
    { time: "2024-04-01", value: 185 },
  ],
  aboutStrategy: {
    summary: "Curated 50/50 allocation between Solana's premier DEX aggregator and liquid staking governance tokens.",
    thesis: "Solana's execution layer activity directly accrues value to JUP (routing dominance) and JTO (MEV capture and liquid staking governance).",
    constituentsRationale: [
      { symbol: "tJUP", rationale: "Dominates >80% of Solana DEX volume routing with launchpad and perpetuals." },
      { symbol: "tJTO", rationale: "Captures MEV tips across the Solana validator network with dominant liquid staking." },
    ],
  },
};

export const CURATED_BASKETS: Basket[] = [
  DEVNET_DEMO_BASKET,
  // 1. Solana Infrastructure
  {
    id: "solana-infrastructure",
    slug: "solana-infrastructure",
    name: "Solana Infrastructure",
    category: "Infrastructure",
    pointsMultiplier: "3x Pts",
    imageUrl: "/baskets/solana-infrastructure.jpg",
    description: "The core foundational stack — liquid staking, DEX routing, AMMs, and compute backbone",
    returns7d: 18.2,
    returns30d: 56.4,
    returns1y: 212.8,
    displayReturn: {
      value: "+212.80%",
      period: "1 YEAR RETURN",
      isPositive: true,
    },
    sparkline: [20, 24, 28, 34, 42, 51, 63, 76, 92, 114, 138, 162, 185, 201, 212],
    extraTokensCount: 9,
    tvlUsd: 5860000,
    tokens: [
      {
        symbol: "CLOUD",
        name: "Sanctum",
        mint: "CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAu",
        weightBps: 1060,
        icon: "/tokens/cloud.png",
        priceUsd: 0.28,
        change24h: 4.8,
      },
      {
        symbol: "BP",
        name: "Backpack",
        mint: "BPxxfRCXkUVhig4HS1Lh7kZqV6SPJhzfEk4x6fVBjPCy",
        weightBps: 1000,
        icon: "/tokens/bp.png",
        priceUsd: 2.45,
        change24h: 6.2,
      },
      {
        symbol: "JUP",
        name: "Jupiter",
        mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        weightBps: 900,
        icon: "/tokens/jup.png",
        priceUsd: 0.92,
        change24h: 3.4,
      },
      {
        symbol: "JitoSOL",
        name: "Jito Staked SOL",
        mint: "J1toso1uCk3RKmWHx4qQCeqAghWvMtPxxDMTjaNaUhS",
        weightBps: 800,
        icon: "/tokens/jitosol.png",
        priceUsd: 214.5,
        change24h: 3.8,
      },
      {
        symbol: "SOL",
        name: "Solana",
        mint: "So11111111111111111111111111111111111111112",
        weightBps: 800,
        icon: "/tokens/sol.png",
        priceUsd: 184.2,
        change24h: 3.2,
      },
      {
        symbol: "mSOL",
        name: "Marinade Staked SOL",
        mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
        weightBps: 800,
        icon: "/tokens/msol.png",
        priceUsd: 218.8,
        change24h: 3.5,
      },
      {
        symbol: "KMNO",
        name: "Kamino",
        mint: "KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS",
        weightBps: 800,
        icon: "/tokens/kmno.png",
        priceUsd: 0.14,
        change24h: 5.8,
      },
      {
        symbol: "RAY",
        name: "Raydium",
        mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
        weightBps: 800,
        icon: "/tokens/ray.png",
        priceUsd: 1.84,
        change24h: 4.2,
      },
      {
        symbol: "ORCA",
        name: "Orca",
        mint: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
        weightBps: 800,
        icon: "/tokens/orca.png",
        priceUsd: 3.42,
        change24h: 2.9,
      },
      {
        symbol: "MET",
        name: "Meteora",
        mint: "METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL",
        weightBps: 800,
        icon: "/tokens/met.png",
        priceUsd: 0.45,
        change24h: 5.1,
      },
      {
        symbol: "ARX",
        name: "Arcium",
        mint: "ARXwZkNAtzPfdcoqQiduJn8EPv9fKiDfGn2KyggyDrFs",
        weightBps: 800,
        icon: "/tokens/arx.png",
        priceUsd: 0.32,
        change24h: 7.4,
      },
      {
        symbol: "JTO",
        name: "Jito",
        mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
        weightBps: 640,
        icon: "/tokens/jto.png",
        priceUsd: 2.85,
        change24h: 6.1,
      },
    ],
    chartData: [
      { time: "Apr", value: 100 },
      { time: "May", value: 118 },
      { time: "Jun", value: 135 },
      { time: "Jul", value: 154 },
      { time: "Aug", value: 182 },
      { time: "Sep", value: 212.8 },
    ],
    aboutStrategy: {
      summary:
        "The foundational infrastructure index capturing Solana's mission-critical liquidity routing, LST staking yield, decentralized exchange layers, and confidential compute backbone.",
      thesis:
        "Protocol revenue, network security, and on-chain liquidity depend directly on Solana's core infrastructure stack. Spanning liquid staking (Sanctum, JitoSOL, mSOL), premier routing & DEXs (Jupiter, Raydium, Orca, Meteora), money markets (Kamino), MEV capture (Jito), wallet ecosystem (Backpack), and confidential computing (Arcium), this basket gives comprehensive exposure to Solana's operational backbone.",
      constituentsRationale: [
        {
          symbol: "CLOUD",
          rationale:
            "Sanctum powers unified LST liquidity and custom liquid staking token infrastructure across Solana.",
        },
        {
          symbol: "BP",
          rationale:
            "Backpack operates the premier regulated ecosystem wallet, exchange, and community standard.",
        },
        {
          symbol: "JUP",
          rationale:
            "Jupiter routes over 80% of all Solana DEX volume and operates the network's leading perpetuals and DCA engines.",
        },
        {
          symbol: "JitoSOL",
          rationale:
            "Leading liquid staked SOL generating validator MEV rewards with deepest ecosystem DeFi integrations.",
        },
        {
          symbol: "SOL",
          rationale:
            "Native Solana layer-1 asset securing consensus and powering base transaction fees.",
        },
        {
          symbol: "mSOL",
          rationale:
            "Marinade's native liquid staking token backed by automated, decentralized stake distribution.",
        },
        {
          symbol: "KMNO",
          rationale:
            "Kamino is Solana's premier money market and automated liquidity vault protocol with billions in supplied capital.",
        },
        {
          symbol: "RAY",
          rationale:
            "Raydium provides core AMM liquidity and powers the high-velocity token launch and swapping flywheel.",
        },
        {
          symbol: "ORCA",
          rationale:
            "Orca provides capital-efficient concentrated liquidity AMM pools and swap infrastructure.",
        },
        {
          symbol: "MET",
          rationale:
            "Meteora delivers dynamic AMM vaults and dynamic liquidity market maker (DLMM) infrastructure.",
        },
        {
          symbol: "ARX",
          rationale:
            "Arcium provides decentralized confidential computing and multi-party computation framework.",
        },
        {
          symbol: "JTO",
          rationale:
            "Jito captures maximum extractable value (MEV) rewards through its liquid staking pool and client infrastructure.",
        },
      ],
      characteristics: [
        "Comprehensive Ecosystem Backbone — Spanning liquid staking, DEX aggregators, AMMs, MEV, and privacy infrastructure.",
        "Spot-Only Direct Wallet Custody — Delivered straight into user Associated Token Accounts via Jupiter CPI router.",
        "Systemic Cashflow Exposure — Exposure to protocols generating hundreds of millions in cumulative annual protocol fees.",
      ],
      risks: [
        "Smart Contract & Protocol Risk — Underlying constituent protocols utilize complex Anchor programs and automated market maker pools.",
        "Ecosystem Market Beta — Infrastructure valuations correlate with broader Solana network activity and liquidity flows.",
      ],
    },
  },

  // 2. Solana Sigma Basket
  {
    id: "solana-sigma-basket",
    slug: "solana-sigma-basket",
    name: "Solana Sigma Basket",
    category: "Infrastructure",
    pointsMultiplier: "3x Pts",
    imageUrl: "/baskets/solana-sigma.jpg",
    description: "Quiet infrastructure that powers everything — no hype needed",
    returns7d: 21.4,
    returns30d: 59.8,
    returns1y: 242.5,
    displayReturn: {
      value: "+242.50%",
      period: "1 YEAR RETURN",
      isPositive: true,
    },
    sparkline: [20, 24, 26, 30, 38, 44, 52, 60, 68, 80, 94, 110, 130, 155, 178],
    extraTokensCount: 1,
    tvlUsd: 3150000,
    tokens: [
      {
        symbol: "PYTH",
        name: "Pyth Network",
        mint: "HZ1JovNiDcZvKhVkW1dhPfDYDA422BX2UStnrD1182BQ",
        weightBps: 3500,
        icon: "/tokens/pyth.svg",
        priceUsd: 0.34,
        change24h: 2.1,
      },
      {
        symbol: "JUP",
        name: "Jupiter",
        mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        weightBps: 2500,
        icon: "/tokens/jup.png",
        priceUsd: 0.92,
        change24h: 3.4,
      },
      {
        symbol: "KMNO",
        name: "Kamino",
        mint: "KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS",
        weightBps: 2000,
        icon: "/tokens/kmno.png",
        priceUsd: 0.14,
        change24h: 5.8,
      },
      {
        symbol: "RENDER",
        name: "Render Network",
        mint: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
        weightBps: 2000,
        icon: "/tokens/render.png",
        priceUsd: 6.2,
        change24h: 7.9,
      },
    ],
    chartData: [
      { time: "Apr", value: 100 },
      { time: "May", value: 122 },
      { time: "Jun", value: 145 },
      { time: "Jul", value: 178 },
      { time: "Aug", value: 210 },
      { time: "Sep", value: 242.5 },
    ],
    aboutStrategy: {
      summary:
        "The backbone protocols operating in the background that power 24/7 financial settlements, real-time market data oracles, and decentralized machine compute.",
      thesis:
        "Hype narratives fade, but foundational infrastructure compounds continuously. This basket weights foundational protocols that every other application, bot, and trader on Solana relies on.",
      constituentsRationale: [
        {
          symbol: "PYTH",
          rationale:
            "Pyth delivers sub-second financial oracle price feeds to over 400 dApps across 50+ blockchains.",
        },
        {
          symbol: "JUP",
          rationale:
            "The routing engine underpinning almost all trades, liquidations, and treasury rebalances across Solana.",
        },
        {
          symbol: "KMNO",
          rationale:
            "Automated liquidity market making and lending infrastructure maintaining collateral health for the entire ecosystem.",
        },
        {
          symbol: "RENDER",
          rationale:
            "Decentralized GPU compute infrastructure scaling AI model inference, 3D rendering, and machine workflows.",
        },
      ],
      characteristics: [
        "Uncorrelated Moat — Core utilities that benefit from total on-chain transaction volume regardless of which specific token pumps.",
        "Mission-Critical Dependencies — Protocols that Solana DeFi cannot function without.",
      ],
      risks: [
        "Technology Upgrade Cycles — Ongoing client updates and network hardware requirements.",
      ],
    },
  },

  // 3. Solana Culture & Memes
  {
    id: "solana-culture-memes",
    slug: "solana-culture-memes",
    name: "Solana Culture & Memes",
    category: "Culture & Memes",
    pointsMultiplier: "3x Pts",
    imageUrl: "/baskets/culture-memes.jpg",
    description: "Highest-liquidity, longest-standing cultural tokens",
    returns7d: 46.2,
    returns30d: 178.4,
    returns1y: 495.6,
    displayReturn: {
      value: "+495.60%",
      period: "1 YEAR RETURN",
      isPositive: true,
    },
    sparkline: [18, 22, 28, 35, 48, 62, 75, 98, 125, 160, 210, 270, 340, 420, 495],
    extraTokensCount: 0,
    tvlUsd: 2640000,
    tokens: [
      {
        symbol: "BONK",
        name: "Bonk",
        mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        weightBps: 4000,
        icon: "/tokens/bonk.jpg",
        priceUsd: 0.000021,
        change24h: 12.4,
      },
      {
        symbol: "TRUMP",
        name: "Official Trump",
        mint: "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
        weightBps: 3000,
        icon: "/tokens/trump.svg",
        priceUsd: 16.5,
        change24h: 8.7,
      },
      {
        symbol: "PENGU",
        name: "Pudgy Penguins",
        mint: "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv",
        weightBps: 3000,
        icon: "/tokens/pengu.svg",
        priceUsd: 0.035,
        change24h: 15.2,
      },
    ],
    chartData: [
      { time: "Apr", value: 100 },
      { time: "May", value: 160 },
      { time: "Jun", value: 230 },
      { time: "Jul", value: 310 },
      { time: "Aug", value: 410 },
      { time: "Sep", value: 495.6 },
    ],
    aboutStrategy: {
      summary:
        "The highest-liquidity cultural anchors driving Solana's viral mindshare, mainstream brand recognition, and retail community engagement.",
      thesis:
        "Rather than chasing short-lived microcap memecoins with 99% rug rates, this basket locks into the proven cultural bluechips that have achieved institutional listings and global retail awareness.",
      constituentsRationale: [
        {
          symbol: "BONK",
          rationale:
            "The community revival coin that reignited the Solana ecosystem; backed by widespread utility, burns, and integrations.",
        },
        {
          symbol: "TRUMP",
          rationale:
            "The premier political and cultural macro token with global media mindshare and sustained high liquidity.",
        },
        {
          symbol: "PENGU",
          rationale:
            "The official token of Pudgy Penguins, the leading consumer IP bridging Web3 culture into mainstream retail.",
        },
      ],
      characteristics: [
        "Global Brand Reach — Exposure to digital assets with cultural recognition beyond crypto-native circles.",
        "Deep Liquidity Pools — Over hundreds of millions in cumulative DEX/CEX daily trading volume.",
      ],
      risks: [
        "High Sentiment Beta — Cultural tokens experience heightened price swings during broader crypto market corrections.",
      ],
    },
  },

  // 4. Solana AI & Compute
  {
    id: "solana-ai-compute",
    slug: "solana-ai-compute",
    name: "Solana AI & Compute",
    category: "AI",
    pointsMultiplier: "3x Pts",
    imageUrl: "/baskets/solana-purple.jpg",
    description: "Agentic economy — established anchor + proven traction leaders",
    returns7d: 68.4,
    returns30d: 312.0,
    returns1y: 640.8,
    displayReturn: {
      value: "+640.80%",
      period: "1 YEAR RETURN",
      isPositive: true,
    },
    sparkline: [15, 20, 26, 38, 54, 76, 105, 148, 195, 260, 340, 430, 520, 590, 640],
    extraTokensCount: 1,
    tvlUsd: 1980000,
    tokens: [
      {
        symbol: "RENDER",
        name: "Render Network",
        mint: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
        weightBps: 3000,
        icon: "/tokens/render.png",
        priceUsd: 6.2,
        change24h: 7.9,
      },
      {
        symbol: "FARTCOIN",
        name: "Fartcoin",
        mint: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",
        weightBps: 2500,
        icon: "/tokens/fartcoin.svg",
        priceUsd: 0.42,
        change24h: 24.5,
      },
      {
        symbol: "PIPPIN",
        name: "Pippin",
        mint: "Dfh5DzRgSvvCFDoYc2ciTkMrbDfRKybA4SoFbPmApump",
        weightBps: 2500,
        icon: "/tokens/pippin.svg",
        priceUsd: 0.18,
        change24h: 19.8,
      },
      {
        symbol: "GOAT",
        name: "Goatseus Maximus",
        mint: "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump",
        weightBps: 2000,
        icon: "/tokens/goat.svg",
        priceUsd: 0.35,
        change24h: 14.1,
      },
    ],
    chartData: [
      { time: "Apr", value: 100 },
      { time: "May", value: 180 },
      { time: "Jun", value: 270 },
      { time: "Jul", value: 390 },
      { time: "Aug", value: 520 },
      { time: "Sep", value: 640.8 },
    ],
    aboutStrategy: {
      summary:
        "The agentic economy index — uniting decentralized GPU compute infrastructure with the pioneering autonomous AI agents leading Solana's AI supercycle.",
      thesis:
        "Solana's sub-second finality and near-zero gas costs make it the undisputed home for autonomous on-chain agents and micro-compute settlements. This basket pairs hardware infrastructure with the breakout AI agent leaders.",
      constituentsRationale: [
        {
          symbol: "RENDER",
          rationale:
            "The foundational compute layer providing distributed GPU clusters for AI rendering and model inference.",
        },
        {
          symbol: "FARTCOIN",
          rationale:
            "High-traction autonomous conversational agent with widespread viral resonance and massive trading volume.",
        },
        {
          symbol: "PIPPIN",
          rationale:
            "Leading modular AI companion and autonomous agent framework with growing developer ecosystem.",
        },
        {
          symbol: "GOAT",
          rationale:
            "Goatseus Maximus, the historic pioneer that originated the autonomous AI agent narrative on Solana.",
        },
      ],
      characteristics: [
        "Hardware + Agent Synergy — Captures both the compute providers (Render) and the consumer AI agent protocols.",
        "Exponential Growth Thesis — Direct exposure to crypto's fastest-growing technological frontier.",
      ],
      risks: [
        "Rapid Narrative Shifts — Fast iteration cycles in AI agent frameworks can create rapid market share rotation.",
      ],
    },
  },

  // 5. Solana DePIN Infrastructure
  {
    id: "solana-depin-infrastructure",
    slug: "solana-depin-infrastructure",
    name: "Solana DePIN Infrastructure",
    category: "DePIN",
    pointsMultiplier: "2x Pts",
    imageUrl: "/baskets/depin-infrastructure.jpg",
    description: "Real-world physical infrastructure networks",
    returns7d: 28.5,
    returns30d: 74.2,
    returns1y: 156.4,
    displayReturn: {
      value: "+156.40%",
      period: "1 YEAR RETURN",
      isPositive: true,
    },
    sparkline: [20, 24, 28, 33, 40, 48, 55, 68, 80, 95, 110, 125, 138, 146, 156],
    extraTokensCount: 0,
    tvlUsd: 1450000,
    tokens: [
      {
        symbol: "HNT",
        name: "Helium",
        mint: "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
        weightBps: 5000,
        icon: "/tokens/hnt.png",
        priceUsd: 6.42,
        change24h: 5.3,
      },
      {
        symbol: "IOT",
        name: "Helium IOT",
        mint: "iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns",
        weightBps: 2500,
        icon: "/tokens/iot.svg",
        priceUsd: 0.00085,
        change24h: 3.8,
      },
      {
        symbol: "MOBILE",
        name: "Helium Mobile",
        mint: "mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6",
        weightBps: 2500,
        icon: "/tokens/mobile.svg",
        priceUsd: 0.0012,
        change24h: 8.4,
      },
    ],
    chartData: [
      { time: "Apr", value: 100 },
      { time: "May", value: 112 },
      { time: "Jun", value: 124 },
      { time: "Jul", value: 136 },
      { time: "Aug", value: 148 },
      { time: "Sep", value: 156.4 },
    ],
    aboutStrategy: {
      summary:
        "Decentralized Physical Infrastructure Networks (DePIN) transforming global telecom, Internet of Things sensor tracking, and 5G cellular coverage.",
      thesis:
        "Helium migrated to Solana to leverage its low-cost state compression and high throughput. This basket captures the full Helium DePIN stack: the parent network (HNT), the nationwide cellular network (MOBILE), and the global IoT sensor network (IOT).",
      constituentsRationale: [
        {
          symbol: "HNT",
          rationale:
            "The overarching Helium network governance and value-accrual token backed by data credit burn mechanisms.",
        },
        {
          symbol: "IOT",
          rationale:
            "SubDAO token incentivizing hundreds of thousands of LoRaWAN IoT tracking gateways globally.",
        },
        {
          symbol: "MOBILE",
          rationale:
            "SubDAO token powering Helium Mobile's nationwide decentralized 5G carrier network and subscribers.",
        },
      ],
      characteristics: [
        "Real-World Utility — Revenue driven by physical SIM card subscribers and commercial data transfer.",
        "Deflationary Burn Dynamics — Data usage burns HNT to mint non-transferable Data Credits.",
      ],
      risks: [
        "Hardware Deployment Cycles — Network expansion depends on physical hotspot manufacturing and deployment.",
      ],
    },
  },
];

/**
 * Helper to resolve basket by ID or legacy slug alias
 */
export function getBasketById(idOrSlug?: string): Basket {
  if (!idOrSlug) return CURATED_BASKETS[0];

  const lower = idOrSlug.toLowerCase();

  // Devnet demo basket check
  if (lower === "solana-infra-governance" || lower.includes("governance") || lower === "demo") {
    return DEVNET_DEMO_BASKET;
  }

  // Check direct match
  const found = CURATED_BASKETS.find(
    (b) => b.id.toLowerCase() === lower || b.slug.toLowerCase() === lower
  );
  if (found) return found;

  // Legacy aliases & matches
  if (
    lower.includes("infra") ||
    lower.includes("spartan") ||
    lower.includes("blue") ||
    lower.includes("core") ||
    lower.includes("alt-szn") ||
    lower.includes("defi")
  ) {
    return CURATED_BASKETS.find((b) => b.id === "solana-infrastructure") || CURATED_BASKETS[1];
  }
  if (lower.includes("sigma")) {
    return CURATED_BASKETS.find((b) => b.id === "solana-sigma-basket") || CURATED_BASKETS[2];
  }
  if (lower.includes("meme") || lower.includes("culture")) {
    return CURATED_BASKETS.find((b) => b.id === "solana-culture-memes") || CURATED_BASKETS[3];
  }
  if (lower.includes("ai") || lower.includes("compute")) {
    return CURATED_BASKETS.find((b) => b.id === "solana-ai-compute") || CURATED_BASKETS[4];
  }
  if (lower.includes("depin")) {
    return CURATED_BASKETS.find((b) => b.id === "solana-depin-infrastructure") || CURATED_BASKETS[5];
  }

  return CURATED_BASKETS[0];
}
