import { DEVNET_LABELS, deterministicKeypair } from "./devnetState";

export const DEVNET_ASSETS: Array<{
  symbol: string; priceUsd: number; legType: "spl" | "xstock"; marketClosed?: boolean;
}> = [
  { symbol: "tNVDA", priceUsd: 180, legType: "xstock" },
  { symbol: "tGOLD", priceUsd: 2400, legType: "xstock" },
  { symbol: "tTSLA", priceUsd: 250, legType: "xstock", marketClosed: true },
  { symbol: "tJUP", priceUsd: 0.85, legType: "spl" },
  { symbol: "tJTO", priceUsd: 2.3, legType: "spl" },
  { symbol: "tBONK", priceUsd: 0.000021, legType: "spl" },
  { symbol: "tRENDER", priceUsd: 5.6, legType: "spl" },
  { symbol: "tHNT", priceUsd: 6.8, legType: "spl" },
  { symbol: "tPYTH", priceUsd: 0.42, legType: "spl" },
  { symbol: "tKMNO", priceUsd: 0.06, legType: "spl" },
];

/** Planned addresses for a paused prelaunch catalog; this is not deployment state. */
export function plannedDevnetCatalog() {
  return {
    usdc: { mint: deterministicKeypair(DEVNET_LABELS.usdcMint).publicKey.toBase58(), decimals: 6 },
    assets: DEVNET_ASSETS.map(asset => ({
      ...asset, decimals: 6,
      mint: deterministicKeypair(DEVNET_LABELS.assetMint(asset.symbol)).publicKey.toBase58(),
    })),
  };
}
