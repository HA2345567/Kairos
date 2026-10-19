import { useQuery } from "@tanstack/react-query";
import { kairosApi } from "@/lib/api-client";
import type { Basket } from "@/lib/baskets-data";

/** Loads an executable basket quote from Kairos' configured Jupiter router. */
export function useJupiterQuote(basket: Basket | undefined, usdcAmount: number) {
  const enabled = Boolean(basket?.slug) && Number.isFinite(usdcAmount) && usdcAmount > 0;
  const query = useQuery({
    queryKey: ["basket-quote", basket?.slug, usdcAmount],
    queryFn: () => kairosApi.getQuote(basket!.slug, usdcAmount, "USDC"),
    enabled,
    staleTime: 10_000,
    retry: false,
  });

  const quote = query.data?.quote;
  return {
    tokens: quote?.legs ?? [],
    totalReceiveUsdc: quote?.netInvestUsdc ?? 0,
    totalFeeUsdc: quote?.platformFeeUsdc ?? 0,
    loading: query.isFetching,
    error: query.error ? (query.error instanceof Error ? query.error.message : "Quote unavailable") : null,
  };
}
