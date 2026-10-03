/**
 * useRouterActivity
 *
 * Fetches the wallet's recent transaction history and filters to only
 * transactions that touched the deployed Kairos router program.
 *
 * IMPORTANT: The Kairos router program is currently using a placeholder ID
 * ("KairosRouter1111111111111111111111111111111") — no real program has been
 * deployed to devnet yet. As a result, this hook will always return an empty
 * array until a real program is deployed and the ID is updated here.
 *
 * When the program is deployed, update KAIROS_PROGRAM_ID below to the real
 * deployed program address.
 *
 * Shows an honest empty state instead of fake data.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Connection, PublicKey } from "@solana/web3.js";

export interface RouterActivityItem {
  signature: string;
  blockTime: number | null | undefined;  // Unix timestamp from Solana
  explorerUrl: string;
  /** Action label, e.g. "Invest". Currently always "Invest" for Kairos txs. */
  action: string;
}

export interface UseRouterActivityResult {
  activity: RouterActivityItem[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// KAIROS_PROGRAM_ID
// Update this constant when the real Kairos router program is deployed.
// Currently a placeholder — will match zero real transactions.
// ---------------------------------------------------------------------------
const KAIROS_PROGRAM_ID_STRING = "KairosRouter1111111111111111111111111111111";

// How many recent signatures to scan per refresh
const SIGNATURES_TO_SCAN = 10;

const REFETCH_INTERVAL_MS = 30_000; // 30 seconds

export function useRouterActivity(
  connection: Connection | null,
  publicKey: PublicKey | null
): UseRouterActivityResult {
  const [activity, setActivity] = useState<RouterActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  // 30-second auto-refresh
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

  useEffect(() => {
    if (!connection || !publicKey) {
      setActivity([]);
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
        // Validate the program ID is a real base58 key
        let kairosProgramKey: PublicKey;
        try {
          kairosProgramKey = new PublicKey(KAIROS_PROGRAM_ID_STRING);
        } catch {
          // Placeholder is not a valid base58 key — return empty gracefully
          if (!cancelled) {
            setActivity([]);
            setIsLoading(false);
          }
          return;
        }

        // Fetch the most recent signatures for this wallet
        const sigs = await connection.getSignaturesForAddress(publicKey, {
          limit: SIGNATURES_TO_SCAN,
        });

        if (cancelled) return;

        const relevant: RouterActivityItem[] = [];

        // For each signature, fetch the parsed transaction and check
        // whether the Kairos program ID appears in the account keys.
        for (const sigInfo of sigs) {
          if (cancelled) break;
          try {
            const tx = await connection.getParsedTransaction(sigInfo.signature, {
              maxSupportedTransactionVersion: 0,
            });

            if (!tx) continue;

            // Check if the Kairos program appears in this transaction's accounts
            const accountKeys = tx.transaction.message.accountKeys;
            const touchesKairos = accountKeys.some(
              (k) => k.pubkey.toBase58() === kairosProgramKey.toBase58()
            );

            if (touchesKairos) {
              relevant.push({
                signature: sigInfo.signature,
                blockTime: tx.blockTime,
                explorerUrl: `https://explorer.solana.com/tx/${sigInfo.signature}?cluster=devnet`,
                action: "Invest",
              });
            }
          } catch (txErr) {
            // Skip individual transaction parse errors — don't fail the whole fetch
            console.warn(
              `[useRouterActivity] Could not parse tx ${sigInfo.signature}:`,
              txErr
            );
          }
        }

        if (!cancelled) setActivity(relevant);
      } catch (err: any) {
        if (!cancelled) {
          console.error("[useRouterActivity] fetch error:", err);
          setIsError(true);
          setErrorMessage(err?.message ?? "Unknown error fetching router activity");
          setActivity([]);
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

  return { activity, isLoading, isError, errorMessage, refresh };
}
