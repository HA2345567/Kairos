import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { kairosApi } from "@/lib/api-client";
import type { AppConfigResponse } from "@/lib/api-types";

/**
 * Runtime config (GET /v1/config). Every devnet constant the UI used to
 * hardcode — USDC mint, fees, minimums — now comes from here.
 */
export function useAppConfig() {
  return useQuery<AppConfigResponse>({
    queryKey: ["app-config"],
    queryFn: () => kairosApi.getConfig(),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export type ClusterName = "devnet" | "mainnet-beta" | "unknown";

/** Classify an RPC endpoint without trusting the UI's own cluster label. */
export function classifyCluster(endpoint: string | undefined | null): ClusterName {
  if (!endpoint) return "unknown";
  const value = endpoint.toLowerCase();
  if (value.includes("devnet")) return "devnet";
  // A loopback/private validator is a local devnet, never mainnet-beta.
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/.test(value)) return "devnet";
  if (value.includes("mainnet") || value.includes("api\.solana\.com")) return "mainnet-beta";
  return "unknown";
}

export interface ClusterCheck {
  expected: ClusterName;
  actual: ClusterName;
  /** True only when both sides are known and differ — never a guess. */
  mismatched: boolean;
  endpoint: string | null;
}

/**
 * PRD §4.5 wrong-network detection: the wallet's RPC must be the cluster the
 * API runs on. An unknown endpoint is reported as unknown rather than a
 * mismatch, so a custom RPC cannot raise a false alarm.
 */
export function useClusterCheck(): ClusterCheck {
  const { connection } = useConnection();
  const { data } = useAppConfig();
  const expected = (data?.cluster as ClusterName | undefined) ?? "unknown";
  const endpoint = connection?.rpcEndpoint ?? null;
  const actual = classifyCluster(endpoint);
  return {
    expected,
    actual,
    mismatched: expected !== "unknown" && actual !== "unknown" && expected !== actual,
    endpoint,
  };
}
