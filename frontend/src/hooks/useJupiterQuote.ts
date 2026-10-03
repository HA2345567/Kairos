/**
 * useJupiterQuote
 *
 * Fetches a live Jupiter v6 quote for a given USDC input amount
 * split across the basket tokens by their weightBps.
 *
 * Returns: per-token estimated output amounts + aggregate fee/slippage.
 * Debounces 600ms on amount change. Aborts stale requests automatically.
 *
 * Jupiter Quote API v6:
 * GET https://quote-api.jup.ag/v6/quote
 *   ?inputMint=<mint>
 *   &outputMint=<mint>
 *   &amount=<lamports>     (6 decimals for USDC)
 *   &slippageBps=50
 */

import { useEffect, useState, useRef, useCallback } from "react";
import type { BasketToken } from "@/lib/baskets-data";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // mainnet USDC
const QUOTE_API = "https://quote-api.jup.ag/v6/quote";
const SLIPPAGE_BPS = 50; // 0.5%

export interface TokenQuoteResult {
  symbol: string;
  mint: string;
  weightBps: number;
  inputUsdc: number;       // $ portion allocated to this token
  outAmount: number;       // raw output amount (native decimals)
  outAmountUi: number;     // UI decimal amount (outAmount / 10^decimals)
  priceImpactPct: number;
  otherFeeUsdc: number;
}

export interface JupiterQuoteResult {
  tokens: TokenQuoteResult[];
  totalInputUsdc: number;
  totalReceiveUsdc: number; // sum of input minus all fees
  totalFeeUsdc: number;
  slippagePct: number;
  loading: boolean;
  error: string | null;
}

const EMPTY: JupiterQuoteResult = {
  tokens: [],
  totalInputUsdc: 0,
  totalReceiveUsdc: 0,
  totalFeeUsdc: 0,
  slippagePct: 0,
  loading: false,
  error: null,
};

/** Minimal fetch for a single USDC → outputMint quote */
async function fetchQuote(
  outputMint: string,
  amountLamports: number,
  signal: AbortSignal
): Promise<{ outAmount: string; priceImpactPct: string; otherAmountThreshold: string; routePlan: any[] }> {
  const url =
    `${QUOTE_API}?inputMint=${USDC_MINT}` +
    `&outputMint=${outputMint}` +
    `&amount=${amountLamports}` +
    `&slippageBps=${SLIPPAGE_BPS}` +
    `&onlyDirectRoutes=false` +
    `&asLegacyTransaction=false`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jupiter quote ${res.status}: ${text.slice(0, 120)}`);
  }
  return res.json();
}

/**
 * Estimates token decimals from a quote's outAmount by comparing to
 * roughly expected price — heuristic only. For display we use 6 as
 * fallback (most SPL tokens) and 9 for SOL.
 */
function guessDecimals(mint: string): number {
  if (mint === "So11111111111111111111111111111111111111112") return 9;
  return 6;
}

export function useJupiterQuote(
  tokens: BasketToken[],
  totalUsdcAmount: number   // the $ amount user typed
): JupiterQuoteResult {
  const [result, setResult] = useState<JupiterQuoteResult>(EMPTY);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    // Need at least $2 and at least one token with a non-devnet mainnet mint
    if (totalUsdcAmount < 2 || tokens.length === 0) {
      setResult({ ...EMPTY });
      return;
    }

    // Cancel any previous in-flight requests
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setResult((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Map each token to its $ allocation — use priceMint for mainnet quote
      const allocations = tokens.map((t) => ({
        token: t,
        quoteMint: t.priceMint ?? t.mint,  // mainnet mint for Jupiter quote API
        inputUsdc: (totalUsdcAmount * t.weightBps) / 10_000,
        inputLamports: Math.floor((totalUsdcAmount * t.weightBps * 1_000_000) / 10_000),
      }));

      // Fetch all quotes in parallel
      const quotes = await Promise.all(
        allocations.map(({ quoteMint, inputLamports, token }) =>
          fetchQuote(quoteMint, inputLamports, controller.signal).catch((e) => {
            // Devnet/unknown mints will fail — return a null marker
            if (e?.name === "AbortError") throw e;
            console.warn(`[useJupiterQuote] quote failed for ${token.symbol}:`, e.message);
            return null;
          })
        )
      );

      let totalFeeUsdc = 0;
      let totalReceiveUsdc = 0;

      const tokenResults: TokenQuoteResult[] = allocations.map(({ token, inputUsdc }, i) => {
        const q = quotes[i];
        const decimals = guessDecimals(token.mint);
        const outAmount = q ? parseInt(q.outAmount, 10) : 0;
        const outAmountUi = outAmount / Math.pow(10, decimals);
        const priceImpactPct = q ? parseFloat(q.priceImpactPct) * 100 : 0;

        // Jupiter's "otherAmountThreshold" is min receive after slippage
        // Fee estimate: input - (outAmountUi * staticPrice)
        // Simplified: fee = inputUsdc * (priceImpactPct/100 + slippage/100)
        const feeEst = inputUsdc * (Math.abs(priceImpactPct) / 100 + SLIPPAGE_BPS / 10_000);
        totalFeeUsdc += q ? feeEst : 0;
        totalReceiveUsdc += q ? inputUsdc - feeEst : 0;

        return {
          symbol: token.symbol,
          mint: token.mint,
          weightBps: token.weightBps,
          inputUsdc,
          outAmount,
          outAmountUi,
          priceImpactPct,
          otherFeeUsdc: feeEst,
        };
      });

      if (!controller.signal.aborted) {
        setResult({
          tokens: tokenResults,
          totalInputUsdc: totalUsdcAmount,
          totalReceiveUsdc: Math.max(0, totalReceiveUsdc),
          totalFeeUsdc,
          slippagePct: SLIPPAGE_BPS / 100,
          loading: false,
          error: null,
        });
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (!controller.signal.aborted) {
        setResult((prev) => ({
          ...prev,
          loading: false,
          error: err?.message ?? "Failed to fetch quote",
        }));
      }
    }
  }, [tokens, totalUsdcAmount]);

  useEffect(() => {
    // Debounce 600ms so we don't hammer Jupiter on every keystroke
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(run, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [run]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return result;
}
