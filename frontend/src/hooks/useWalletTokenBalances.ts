/**
 * useWalletTokenBalances
 *
 * Fetches real SOL + SPL token balances for the connected wallet.
 * Maps held mints to KNOWN_TOKENS (all Kairos basket constituents).
 * Prices are fetched live from CoinGecko /simple/price in one batch call.
 * Unknown mints (not in KNOWN_TOKENS) are skipped with a console.warn.
 *
 * Refetches every 30 seconds and exposes a manual `refresh()` method.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export interface TokenBalance {
  symbol: string;
  name: string;
  mint: string;
  amount: number;       // UI amount (decimal)
  price: number;        // live USD price from CoinGecko
  usdValue: number;     // amount × price
  icon: string;
}

export interface UseWalletTokenBalancesResult {
  tokenBalances: TokenBalance[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// KNOWN_TOKENS: every mint across all 5 Kairos baskets
// Any SPL account whose mint is not in this map is skipped (logged to console).
// ---------------------------------------------------------------------------
interface KnownTokenMeta {
  symbol: string;
  name: string;
  icon: string;
  coingeckoId: string;
}

export const KNOWN_TOKENS: Record<string, KnownTokenMeta> = {
  // Native SOL (wrapped mint address used as key for consistency)
  "So11111111111111111111111111111111111111112": {
    symbol: "SOL",
    name: "Solana",
    icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    coingeckoId: "solana",
  },
  // ── Solana Infrastructure ──────────────────────────────────────────────────
  "CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAu": {
    symbol: "CLOUD",
    name: "Sanctum",
    icon: "/tokens/cloud.png",
    coingeckoId: "sanctum-2",
  },
  "BPxxfRCXkUVhig4HS1Lh7kZqV6SPJhzfEk4x6fVBjPCy": {
    symbol: "BP",
    name: "Backpack",
    icon: "/tokens/bp.png",
    coingeckoId: "backpack-exchange",
  },
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": {
    symbol: "JUP",
    name: "Jupiter",
    icon: "/tokens/jup.png",
    coingeckoId: "jupiter-exchange-solana",
  },
  "J1toso1uCk3RKmWHx4qQCeqAghWvMtPxxDMTjaNaUhS": {
    symbol: "JitoSOL",
    name: "Jito Staked SOL",
    icon: "/tokens/jitosol.png",
    coingeckoId: "jito-staked-sol",
  },
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": {
    symbol: "mSOL",
    name: "Marinade Staked SOL",
    icon: "/tokens/msol.png",
    coingeckoId: "msol",
  },
  "KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS": {
    symbol: "KMNO",
    name: "Kamino",
    icon: "/tokens/kmno.png",
    coingeckoId: "kamino",
  },
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": {
    symbol: "RAY",
    name: "Raydium",
    icon: "/tokens/ray.png",
    coingeckoId: "raydium",
  },
  "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE": {
    symbol: "ORCA",
    name: "Orca",
    icon: "/tokens/orca.png",
    coingeckoId: "orca",
  },
  "METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL": {
    symbol: "MET",
    name: "Meteora",
    icon: "/tokens/met.png",
    coingeckoId: "meteora",
  },
  "ARXwZkNAtzPfdcoqQiduJn8EPv9fKiDfGn2KyggyDrFs": {
    symbol: "ARX",
    name: "Arcium",
    icon: "/tokens/arx.png",
    coingeckoId: "arcium",
  },
  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL": {
    symbol: "JTO",
    name: "Jito",
    icon: "/tokens/jto.png",
    coingeckoId: "jito-governance",
  },
  // ── Solana Sigma Basket ───────────────────────────────────────────────────
  "HZ1JovNiDcZvKhVkW1dhPfDYDA422BX2UStnrD1182BQ": {
    symbol: "PYTH",
    name: "Pyth Network",
    icon: "/tokens/pyth.svg",
    coingeckoId: "pyth-network",
  },
  "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof": {
    symbol: "RENDER",
    name: "Render Network",
    icon: "/tokens/render.png",
    coingeckoId: "render-token",
  },
  // ── Solana Culture & Memes ────────────────────────────────────────────────
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": {
    symbol: "BONK",
    name: "Bonk",
    icon: "/tokens/bonk.jpg",
    coingeckoId: "bonk",
  },
  "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN": {
    symbol: "TRUMP",
    name: "Official Trump",
    icon: "/tokens/trump.svg",
    coingeckoId: "official-trump",
  },
  "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv": {
    symbol: "PENGU",
    name: "Pudgy Penguins",
    icon: "/tokens/pengu.svg",
    coingeckoId: "pudgy-penguins",
  },
  // ── Solana AI & Compute ───────────────────────────────────────────────────
  "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump": {
    symbol: "FARTCOIN",
    name: "Fartcoin",
    icon: "/tokens/fartcoin.svg",
    coingeckoId: "fartcoin",
  },
  "Dfh5DzRgSvvCFDoYc2ciTkMrbDfRKybA4SoFbPmApump": {
    symbol: "PIPPIN",
    name: "Pippin",
    icon: "/tokens/pippin.svg",
    coingeckoId: "pippin",
  },
  "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump": {
    symbol: "GOAT",
    name: "Goatseus Maximus",
    icon: "/tokens/goat.svg",
    coingeckoId: "goatseus-maximus",
  },
  // ── Solana DePIN Infrastructure ───────────────────────────────────────────
  "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux": {
    symbol: "HNT",
    name: "Helium",
    icon: "/tokens/hnt.png",
    coingeckoId: "helium",
  },
  "iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns": {
    symbol: "IOT",
    name: "Helium IOT",
    icon: "/tokens/iot.svg",
    coingeckoId: "helium-iot",
  },
  "mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6": {
    symbol: "MOBILE",
    name: "Helium Mobile",
    icon: "/tokens/mobile.svg",
    coingeckoId: "helium-mobile",
  },
};

/** The SOL native mint key */
const SOL_MINT = "So11111111111111111111111111111111111111112";

const REFETCH_INTERVAL_MS = 30_000; // 30 seconds

export function useWalletTokenBalances(
  connection: Connection | null,
  publicKey: PublicKey | null
): UseWalletTokenBalancesResult {
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Trigger a manual or timer-based refetch */
  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  // Set up 30-second auto-refresh interval
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!publicKey || !connection) return;
    intervalRef.current = setInterval(() => {
      setTick((t) => t + 1);
    }, REFETCH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [publicKey, connection]);

  // Fetch on mount, publicKey change, connection change, or manual refresh
  useEffect(() => {
    if (!connection || !publicKey) {
      setTokenBalances([]);
      setIsError(false);
      setErrorMessage(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      setIsError(false);
      setErrorMessage(null);

      try {
        // ── Step 1: Fetch SOL balance ────────────────────────────────────────
        const lamports = await connection.getBalance(publicKey);
        const solAmount = lamports / LAMPORTS_PER_SOL;

        // ── Step 2: Fetch SPL token accounts ────────────────────────────────
        const splResp = await connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: TOKEN_PROGRAM_ID,
        });

        // Collect held mint → amount pairs (only non-zero)
        const heldMints: { mint: string; amount: number }[] = [];

        for (const { account } of splResp.value) {
          const info = (account.data as any).parsed?.info;
          if (!info) continue;
          const mint: string = info.mint;
          const uiAmount: number = info.tokenAmount?.uiAmount ?? 0;
          if (uiAmount <= 0) continue;

          if (!KNOWN_TOKENS[mint]) {
            console.warn(
              `[useWalletTokenBalances] Unknown mint ${mint} — add to KNOWN_TOKENS to display it`
            );
            continue;
          }

          heldMints.push({ mint, amount: uiAmount });
        }

        // ── Step 3: Build the list of CoinGecko IDs to fetch prices for ─────
        const geckoIds: string[] = [];

        if (solAmount > 0) {
          geckoIds.push(KNOWN_TOKENS[SOL_MINT].coingeckoId);
        }
        for (const { mint } of heldMints) {
          const meta = KNOWN_TOKENS[mint];
          if (meta && !geckoIds.includes(meta.coingeckoId)) {
            geckoIds.push(meta.coingeckoId);
          }
        }

        // ── Step 4: Single batched CoinGecko price call ──────────────────────
        const prices: Record<string, number> = {};

        if (geckoIds.length > 0) {
          const idsParam = geckoIds.join(",");
          const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`;
          const resp = await fetch(url);
          if (resp.ok) {
            const data = await resp.json();
            for (const id of geckoIds) {
              prices[id] = data[id]?.usd ?? 0;
            }
          } else {
            console.warn(
              `[useWalletTokenBalances] CoinGecko responded ${resp.status}; prices will show as 0`
            );
          }
        }

        if (cancelled) return;

        // ── Step 5: Assemble the final token balance list ────────────────────
        const result: TokenBalance[] = [];

        // SOL first (if held)
        if (solAmount > 0) {
          const meta = KNOWN_TOKENS[SOL_MINT];
          const price = prices[meta.coingeckoId] ?? 0;
          result.push({
            symbol: meta.symbol,
            name: meta.name,
            mint: SOL_MINT,
            amount: solAmount,
            price,
            usdValue: solAmount * price,
            icon: meta.icon,
          });
        }

        // SPL tokens
        for (const { mint, amount } of heldMints) {
          const meta = KNOWN_TOKENS[mint];
          if (!meta) continue;
          const price = prices[meta.coingeckoId] ?? 0;
          result.push({
            symbol: meta.symbol,
            name: meta.name,
            mint,
            amount,
            price,
            usdValue: amount * price,
            icon: meta.icon,
          });
        }

        setTokenBalances(result);
      } catch (err: any) {
        if (!cancelled) {
          console.error("[useWalletTokenBalances] fetch error:", err);
          setIsError(true);
          setErrorMessage(err?.message ?? "Unknown error fetching wallet balances");
          setTokenBalances([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, publicKey, tick]);

  return { tokenBalances, isLoading, isError, errorMessage, refresh };
}
