import { DEVNET_LABELS, deterministicKeypair } from "./devnetState";

export const DEVNET_ASSETS: Array<{
  symbol: string; priceUsd: number; legType: "spl" | "xstock"; marketClosed?: boolean;
}> = [
  { symbol: "tNVDA", priceUsd: 180, legType: "xstock" },
  { symbol: "tGOLD", priceUsd: 2400, legType: "xstock" },
  { symbol: "tTSLA", priceUsd: 250, legType: "xstock", marketClosed: true },
  { symbol: "tJUP", priceUsd: 0.85, legType: "spl" },
  { symbol: "tJTO", priceUsd: 2.3, legType: "spl" },
  { symbol: "tBONK", priceUsd: 0.000003, legType: "spl" },
  { symbol: "tRENDER", priceUsd: 5.6, legType: "spl" },
  { symbol: "tHNT", priceUsd: 6.8, legType: "spl" },
  { symbol: "tPYTH", priceUsd: 0.42, legType: "spl" },
  { symbol: "tKMNO", priceUsd: 0.06, legType: "spl" },
  // Local devnet test mints; fallback prices are illustrative, not live quotes.
  { symbol: "tCLOUD", priceUsd: 0.06, legType: "spl" },
  { symbol: "tBP", priceUsd: 1.06, legType: "spl" },
  { symbol: "tJitoSOL", priceUsd: 214.5, legType: "spl" },
  { symbol: "tSOL", priceUsd: 184.2, legType: "spl" },
  { symbol: "tMSOL", priceUsd: 144, legType: "spl" },
  { symbol: "tRAY", priceUsd: 1.75, legType: "spl" },
  { symbol: "tORCA", priceUsd: 1.72, legType: "spl" },
  { symbol: "tMET", priceUsd: 0.32, legType: "spl" },
  { symbol: "tARX", priceUsd: 0.23, legType: "spl" },
  // Local devnet culture/meme test mints with illustrative reference prices.
  { symbol: "tTRUMP", priceUsd: 1.68, legType: "spl" },
  { symbol: "tPENGU", priceUsd: 0.01, legType: "spl" },
  { symbol: "tWIF", priceUsd: 0.16, legType: "spl" },
  { symbol: "tFARTCOIN", priceUsd: 0.13, legType: "spl" },
  // Solana AI/compute test assets. Prices are catalog placeholders only.
  { symbol: "tNOS", priceUsd: 1, legType: "spl" },
  { symbol: "tIO", priceUsd: 1, legType: "spl" },
  // Additional Solana DePIN preview mints; prices are illustrative only.
  { symbol: "tMOBILE", priceUsd: 1, legType: "spl" },
  { symbol: "tIOT", priceUsd: 1, legType: "spl" },
  { symbol: "tHONEY", priceUsd: 1, legType: "spl" },
  // RWA basket preview assets. These are local devnet test mints; prices are illustrative only.
  { symbol: "tUSDY", priceUsd: 1.07, legType: "spl" },
  { symbol: "tOUSG", priceUsd: 1.1, legType: "spl" },
  { symbol: "tBUIDL", priceUsd: 1, legType: "spl" },
  { symbol: "tSPYX", priceUsd: 620, legType: "xstock" },
  { symbol: "tXAUM", priceUsd: 3200, legType: "spl" },
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
