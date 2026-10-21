import { kairosApi } from "./api-client";
import { useQuery } from "@tanstack/react-query";
import type { BasketCatalogItem } from "./api-types";

export interface BasketToken {
  mint: string;
  decimals?: number;
  /** Mainnet market reference mint used for public market data providers. */
  priceMint?: string;
  symbol: string;
  name: string;
  weightBps: number;
  icon: string;
  priceUsd: number | null;
  change24h?: number | null;
}

const PUBLIC_MARKET_MINTS: Record<string, string> = {
  CLOUD: "CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAu",
  BP: "BPxxfRCXkUVhig4HS1Lh7kZqV6SPJhzfEk4x6fVBjPCy",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  JITOSOL: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  SOL: "So11111111111111111111111111111111111111112",
  MSOL: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  KMNO: "KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS",
  RAY: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  ORCA: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
  MET: "METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL",
  ARX: "ARXwZkNAtzPfdcoqQiduJn8EPv9fKiDfGn2KyggyDrFs",
  JTO: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
  PYTH: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
  RENDER: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  TRUMP: "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
  PENGU: "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv",
  WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  FARTCOIN: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",
  NOS: "nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7",
  IO: "BZLbGTNCSFfoth2GYDtwr7e4imWzpR5jqcUuGEwr646K",
  HNT: "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
  MOBILE: "mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6",
  IOT: "iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns",
  HONEY: "4vMsoUT2BWatFweudnQM1xedRLfJgJ7hswhcpz4xgBTy",
  USDY: "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6",
  SPYX: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
  XAUM: "5aLhp9VnUEKcsdtkfsf2DUgpJfomx7GmYVny24dHUZoB",
};

export interface Basket {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  thesis: string;
  imageUrl: string;
  pointsMultiplier?: string;
  displayReturn?: { value: string };
  tokens: BasketToken[];
  status: "active" | "paused" | "deprecated";
  minUsdc: number;
  isInvestable: boolean;
  /** True when this record is local seed data returned because the API is unavailable. */
  previewOnly?: boolean;
  comingSoon: false;
  tvlUsd: null;
  aboutStrategy: {
    summary: string;
    thesis: string;
    constituentsRationale: { symbol: string; rationale: string }[];
    characteristics?: string[];
    risks?: string[];
  };
}

// These entries mirror the devnet seed catalog. They keep markets discoverable
// when the API is offline or has not been seeded; they are deliberately paused.
const PREVIEW_TOKENS: Record<string, { mint: string; priceUsd: number }> = {
  CLOUD: { mint: "9aTcT6oL4mqx5EVwZCx2tGTezNvENxdnwhGeddb8Gk68", priceUsd: 0.06 },
  BP: { mint: "FKBubFBEeCsypTr7op68jMd3Uu3FdNGjG9MNXnhRfobU", priceUsd: 1.06 },
  JUP: { mint: "9xhJQ8FeBPDmHAX3rpiu6Z7Mfz8Bo2YSE5LSrwkgRhiM", priceUsd: 0.85 },
  JITOSOL: { mint: "GRBvxU1rmLNd68fW1F8y3Me2oP1fnatg9fyvUdbYkNhE", priceUsd: 214.5 },
  SOL: { mint: "4s9ZVmJhZpV8TsnQki2M4wULPJgLNMuVJ7x7wnhdeqoD", priceUsd: 184.2 },
  MSOL: { mint: "HBDWz6Uq8Sfq4SY8wmwjgQnGK3zf9CMQ7vbkA6Fa3JCJ", priceUsd: 144 },
  KMNO: { mint: "5rFdL4MGaEQ7Sfidc5N7yWRxTFQoTsdL4q3RrZkRuvkc", priceUsd: 0.06 },
  RAY: { mint: "EJLQMgd7nZN2Wyz96bxCHVsB5KKQUeRnqPV1AgnqzTQE", priceUsd: 1.75 },
  ORCA: { mint: "6gQF1mAU5toTSzPRfEu9yTaksudzboCZuS1VruKwTRab", priceUsd: 1.72 },
  MET: { mint: "4HzzqkDxTKbuWM67Vp2kjyHdNmLYxqW7e5pJgLtpgosY", priceUsd: 0.32 },
  ARX: { mint: "6xei4N3AzsK3pJXx7XQzfKMax1gEUFctYQCHV696g783", priceUsd: 0.23 },
  JTO: { mint: "2kYGeoCwrSoCa8fi6umWyZSAVcZLxMtGCEiuiXRNbAd7", priceUsd: 2.3 },
  PYTH: { mint: "CTpp6LWfBKe1tNgYaaRTnmLhtATmYSy2VPLJSwRUnygt", priceUsd: 0.42 },
  RENDER: { mint: "VhzDxUPVWsQpwjF8NQLe6zCaZGpj9W5uQaGLxpcHuMz", priceUsd: 5.6 },
  BONK: { mint: "5pxniwnjwS26CczUnmuegwpLmdjSTZ3MtnpVruku1dkQ", priceUsd: 0.000003 },
  TRUMP: { mint: "AY6wbs4ar8V7ytdJ5MGxtnWzeJnCaZo1pWvo4usdHF3R", priceUsd: 1.68 },
  PENGU: { mint: "A8VC6wiYn9ApaiSLAKQSRz7wfij27nGghdBVC6gxJzMm", priceUsd: 0.01 },
  WIF: { mint: "GaH577oAfXUfGJTGjFJMjSaJBS3CUTmEcAyb3N7QXg8K", priceUsd: 0.16 },
  FARTCOIN: { mint: "DGMg1Bxroqdo9beYXa8Aapu1s8FGtQvamxR293reyYCb", priceUsd: 0.13 },
  NOS: { mint: "Arp9Srh7XASNHWCTUrdcNJFDjU4iUffhCwZ5eje72bq2", priceUsd: 1 },
  IO: { mint: "C1KftiZUUXNyq7maNmJLRPtpEJhA9EMjCLKLkTSnxau9", priceUsd: 1 },
  HNT: { mint: "BqRxudcyoTbWnefScjaq4RGGQ6j5CZsPLuYSyYMikyeq", priceUsd: 6.8 },
  MOBILE: { mint: "6dsSZb9Ls2cA6E1cBbmEoNQ2NKWxLxXHN63G2J7oTNcQ", priceUsd: 1 },
  IOT: { mint: "5yLxdaFWLYPXNnAvjU1gjQDYAcNWzvBsF8gzjvZeUVCB", priceUsd: 1 },
  HONEY: { mint: "3ToNjrnbuqxFDRkX7RFnQSN7hRxwTSypxqNZBS2xcBJo", priceUsd: 1 },
  USDY: { mint: "Nddx5ygNCz32qvSZ7LHeBbFJGxk2fwiYEZQumt6AeHh", priceUsd: 1.07 },
  OUSG: { mint: "owMWGCZj5Tf1sCaxWb9hdVhnytApkNA15qZToUJZ2tJ", priceUsd: 1.1 },
  BUIDL: { mint: "HoyUoJApscSEKP6eGM1SnkWpgpeciEmSQ1bWhzJbt4kg", priceUsd: 1 },
  SPYX: { mint: "5B2v2SRRtxQgnRj7x9aRzdxFM2wz46zUX6ZtJ7qNSE7Z", priceUsd: 620 },
  XAUM: { mint: "Rwbn8C1fnQAXQv4p6ncLAJa8h17vu3Ff2KWQGxbbqJo", priceUsd: 3200 },
};

const PREVIEW_SPECS = [
  { slug: "solana-infrastructure", name: "Solana Infrastructure", category: "infrastructure", thesis: "Core Solana trading and network infrastructure across liquidity routing, staking and oracle services.", legs: [["CLOUD",1060],["BP",1000],["JUP",900],["JITOSOL",800],["SOL",800],["MSOL",800],["KMNO",800],["RAY",800],["ORCA",800],["MET",800],["ARX",800],["JTO",640]] },
  { slug: "solana-sigma-basket", name: "Solana Sigma Basket", category: "defi", thesis: "A diversified Solana ecosystem allocation spanning oracles, liquidity, lending and decentralized compute.", legs: [["PYTH",3500],["JUP",2500],["KMNO",2000],["RENDER",2000]] },
  { slug: "solana-culture-memes", name: "Solana Culture & Memes", category: "culture", thesis: "A high-volatility basket spanning Solana-native meme communities, internet culture, and social tokens.", legs: [["BONK",3600],["TRUMP",2700],["PENGU",2700],["WIF",500],["FARTCOIN",500]] },
  { slug: "solana-ai-compute", name: "Solana AI & Compute", category: "ai-compute", thesis: "Solana-based GPU and confidential compute networks powering AI workloads, rendering, and encrypted applications.", legs: [["RENDER",2500],["NOS",2500],["IO",2500],["ARX",2500]] },
  { slug: "solana-depin-infrastructure", name: "Solana DePIN Infrastructure", category: "depin", thesis: "A cross-section of Solana DePIN networks spanning wireless coverage, mobile connectivity, map data, and decentralized GPU compute.", legs: [["HNT",2000],["MOBILE",2000],["IOT",2000],["HONEY",2000],["RENDER",2000]] },
  { slug: "solana-real-world-assets", name: "Solana Real World Assets", category: "real-world-assets", thesis: "A diversified Solana RWA preview spanning tokenized Treasuries, institutional liquidity funds, public-market ETFs, and gold.", legs: [["USDY",2000],["OUSG",2000],["BUIDL",2000],["SPYX",2000],["XAUM",2000]] },
] as const;

const TOKEN_ICON_FILES: Record<string, string> = {
  BONK: "bonk.jpg",
  FARTCOIN: "fartcoin.svg",
  HONEY: "honey.svg",
  IO: "io.svg",
  IOT: "iot.svg",
  MOBILE: "mobile.svg",
  NOS: "nos.svg",
  PENGU: "pengu.svg",
  PYTH: "pyth.svg",
  USDY: "usdy.svg",
  OUSG: "ousg.svg",
  BUIDL: "buidl.svg",
  SPYX: "spyx.svg",
  XAUM: "xaum.svg",
  TRUMP: "trump.svg",
  WIF: "wif.jpg",
};

function tokenIcon(symbol: string): string {
  const underlyingSymbol = symbol.replace(/^t(?=[A-Z])/, "").toUpperCase();
  return `/tokens/${TOKEN_ICON_FILES[underlyingSymbol] ?? `${underlyingSymbol.toLowerCase()}.png`}`;
}

const TOKEN_DISPLAY_NAMES: Record<string, string> = {
  ARX: "Arcium",
  BP: "Backpack",
  BUIDL: "BlackRock USD Institutional Digital Liquidity Fund",
  CLOUD: "Sanctum",
  FARTCOIN: "Fartcoin",
  HNT: "Helium",
  HONEY: "Hivemapper",
  IO: "io.net",
  IOT: "Helium IoT",
  JITOSOL: "Jito Staked SOL",
  MSOL: "Marinade Staked SOL",
  MOBILE: "Helium Mobile",
  NOS: "Nosana",
  MET: "Meteora",
  ORCA: "Orca",
  OUSG: "Ondo Short-Term US Government Treasuries",
  PENGU: "Pudgy Penguins",
  PYTH: "Pyth Network",
  RAY: "Raydium",
  RENDER: "Render Network",
  SOL: "Solana",
  SPYX: "SPDR S&P 500 ETF xStock",
  TRUMP: "Official Trump",
  USDY: "Ondo US Dollar Yield",
  XAUM: "Matrixdock Gold",
  WIF: "dogwifhat",
  JUP: "Jupiter",
  JTO: "Jito",
  KMNO: "Kamino",
};

const PREVIEW_BASKETS: Basket[] = PREVIEW_SPECS.map((spec) => {
  const tokens = spec.legs.map(([symbol, weightBps]) => {
    const asset = PREVIEW_TOKENS[symbol];
    return {
      mint: asset.mint,
      priceMint: PUBLIC_MARKET_MINTS[symbol],
      symbol,
      name: TOKEN_DISPLAY_NAMES[symbol] ?? symbol,
      weightBps,
      icon: tokenIcon(symbol),
      priceUsd: asset.priceUsd,
    };
  });
  const imageBySlug: Record<string, string> = {
    "solana-culture-memes": "solana-culture-council.png",
    "solana-ai-compute": "solana-ai-compute-vision.jpg",
    "solana-infrastructure": "solana-infrastructure.png",
    "solana-sigma-basket": "solana-sigma.png",
    "solana-real-world-assets": "solana-real-world-assets.png",
    "solana-depin-infrastructure": "solana-depin.png",
  };
  return {
    id: `preview-${spec.slug}`,
    slug: spec.slug,
    name: spec.name,
    category: spec.category,
    description: spec.thesis,
    thesis: spec.thesis,
    imageUrl: `/baskets/${imageBySlug[spec.slug]}`,
    tokens,
    status: "paused",
    minUsdc: 25,
    isInvestable: false,
    previewOnly: true,
    comingSoon: false,
    tvlUsd: null,
    aboutStrategy: { summary: spec.thesis, thesis: spec.thesis, constituentsRationale: tokens.map(({ symbol }) => ({ symbol, rationale: "Planned devnet catalog constituent." })) },
  };
});

function getPreviewBasket(idOrSlug: string): Basket | undefined {
  const normalized = idOrSlug.replace(/^bkt-/, "");
  return PREVIEW_BASKETS.find((basket) => basket.slug === normalized);
}

export function isPreviewBasket(basket: Basket): boolean {
  return basket.previewOnly === true;
}

export function mapCatalogBasket(item: BasketCatalogItem): Basket {
  const tokens = item.tokens.map((token) => ({
    mint: token.mint,
    decimals: token.decimals,
    priceMint: PUBLIC_MARKET_MINTS[token.symbol.replace(/^t(?=[A-Z])/, "").toUpperCase()],
    symbol: token.symbol.replace(/^t(?=[A-Z])/, ""),
    name: TOKEN_DISPLAY_NAMES[token.symbol.replace(/^t(?=[A-Z])/, "").toUpperCase()]
      ?? token.name.replace(/^Kairos Devnet /, "").replace(/^t(?=[A-Z])/, ""),
    weightBps: token.weightBps,
    icon: tokenIcon(token.symbol),
    priceUsd: token.priceUsd > 0 ? token.priceUsd : null,
  }));

  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    category: item.category,
    description: item.thesis,
    thesis: item.thesis,
    imageUrl: item.slug === "solana-culture-memes"
      ? "/baskets/solana-culture-council.png"
      : item.slug === "solana-ai-compute"
        ? "/baskets/solana-ai-compute-vision.jpg"
        : item.slug === "solana-infrastructure"
          ? "/baskets/solana-infrastructure.png"
          : item.slug === "solana-sigma-basket"
            ? "/baskets/solana-sigma.png"
            : item.slug === "solana-real-world-assets"
              ? "/baskets/solana-real-world-assets.png"
              : item.slug === "solana-depin-infrastructure"
                ? "/baskets/solana-depin.png"
                : "/baskets/solana-orb.png",
    tokens,
    status: item.status,
    minUsdc: item.minUsdc,
    isInvestable: item.status === "active" && tokens.length > 0,
    comingSoon: false,
    tvlUsd: null,
    aboutStrategy: { summary: item.thesis, thesis: item.thesis, constituentsRationale: [] },
  };
}

export async function fetchBaskets(): Promise<Basket[]> {
  try {
    const { baskets } = await kairosApi.getBaskets(undefined, AbortSignal.timeout(8_000));
    const catalog = baskets
      .map(mapCatalogBasket)
      // Paused markets stay addressable by their detail URL for history and
      // status messaging, but they do not belong in the public market catalog.
      .filter((basket) =>
        basket.status === "active" &&
        basket.category !== "test" &&
        !basket.id.startsWith("reservation-")
      );
    return catalog.length ? catalog : PREVIEW_BASKETS;
  } catch (error) {
    console.warn("Basket catalog API unavailable; showing the paused preview catalog.", error);
    return PREVIEW_BASKETS;
  }
}

export async function fetchBasket(idOrSlug: string): Promise<Basket> {
  // Keep older shared links working after the catalog was renamed to the six
  // current basket slugs.
  const canonicalSlug = idOrSlug === "solana-infra-governance" ? "solana-infrastructure" : idOrSlug;
  try {
    const result = await kairosApi.getBasketBySlug(canonicalSlug);
    return mapCatalogBasket({
      ...result.basket,
      activeVersion: result.activeVersion,
      tokens: result.tokens,
    });
  } catch (error) {
    // Older links use the database ID while the catalog endpoint is keyed by slug.
    const catalogMatch = (await fetchBaskets()).find(
      (basket) => basket.id === canonicalSlug || basket.slug === canonicalSlug || basket.id === idOrSlug || basket.slug === idOrSlug,
    );
    if (catalogMatch) return catalogMatch;
    const previewBasket = getPreviewBasket(idOrSlug);
    if (previewBasket) return previewBasket;
    throw error;
  }
}

export function useBaskets() {
  return useQuery({
    queryKey: ["basket-catalog"],
    queryFn: fetchBaskets,
    placeholderData: PREVIEW_BASKETS,
    staleTime: 60_000,
    refetchInterval: (query) => query.state.data?.some((basket) => basket.previewOnly) ? 15_000 : 60_000,
  });
}

export function useBasket(idOrSlug?: string) {
  return useQuery({
    queryKey: ["basket", idOrSlug],
    queryFn: () => fetchBasket(idOrSlug!),
    enabled: Boolean(idOrSlug),
    staleTime: 60_000,
  });
}
