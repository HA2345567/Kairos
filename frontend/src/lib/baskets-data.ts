import { kairosApi } from "./api-client";
import { useQuery } from "@tanstack/react-query";
import type { BasketCatalogItem } from "./api-types";

export interface BasketToken {
  mint: string;
  symbol: string;
  name: string;
  weightBps: number;
  icon: string;
  priceMint?: string;
  priceUsd: number | null;
  change24h?: number | null;
}

export interface Basket {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  thesis: string;
  imageUrl: string;
  tokens: BasketToken[];
  status: "active" | "paused" | "deprecated";
  minUsdc: number;
  isInvestable: boolean;
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

const tokenIcon = (symbol: string) => `/tokens/${symbol.replace(/^t/, "").toLowerCase()}.png`;

export function mapCatalogBasket(item: BasketCatalogItem): Basket {
  const tokens = item.tokens.map((token) => ({
    mint: token.mint,
    symbol: token.symbol,
    name: token.name,
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
    imageUrl: "/baskets/solana-orb.png",
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
  const { baskets } = await kairosApi.getBaskets();
  return baskets.map(mapCatalogBasket);
}

export async function fetchBasket(idOrSlug: string): Promise<Basket> {
  const result = await kairosApi.getBasketBySlug(idOrSlug);
  return mapCatalogBasket({
    ...result.basket,
    activeVersion: result.activeVersion,
    tokens: result.tokens,
  });
}

export function useBaskets() {
  return useQuery({ queryKey: ["basket-catalog"], queryFn: fetchBaskets, staleTime: 60_000 });
}
