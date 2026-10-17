import { PublicKey } from "@solana/web3.js";
import devnet from "../../../shared/devnet-config.json";
import type { ProgramBuildOpts } from "./programSwap";
import { AppError } from "../errors";

/** Resolve vault direction from mint identity, never token sort order. */
export function poolForPair(inputMint: string, outputMint: string): ProgramBuildOpts["pool"] {
  const entry = Object.values(devnet.pools).find(pool =>
    (pool.mint0 === inputMint && pool.mint1 === outputMint) ||
    (pool.mint1 === inputMint && pool.mint0 === outputMint)
  );
  if (!entry || inputMint === outputMint) {
    throw new AppError("POOL_NOT_CONFIGURED", "No configured pool matches this token pair", 422);
  }
  const forward = entry.mint0 === inputMint;
  return {
    authority: new PublicKey(devnet.raydiumAuthority),
    ammConfig: new PublicKey(entry.ammConfig),
    poolState: new PublicKey(entry.poolId),
    inputVault: new PublicKey(forward ? entry.vault0 : entry.vault1),
    outputVault: new PublicKey(forward ? entry.vault1 : entry.vault0),
    observation: new PublicKey(entry.observationKey),
  };
}
