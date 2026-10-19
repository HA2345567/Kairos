import { stat } from "node:fs/promises";
import { PublicKey } from "@solana/web3.js";
import { config } from "../src/config";
import { withFailover } from "../src/chain/connection";
import { KAIROS_ROUTER_PROGRAM_ID } from "../src/chain/programSwap";

// Read-only deployment check. Never prints endpoint credentials or key material.
if (config.cluster !== "devnet") throw new Error("This check requires the devnet configuration");
const binary = new URL("../../target/deploy/kairos_router.so", import.meta.url);
const bytes = (await stat(binary)).size;
const relayer = config.relayerKeypair.publicKey;
const suppliedWallet = process.argv[2] ? new PublicKey(process.argv[2]) : relayer;
const report = await withFailover(async connection => {
  const [relayerBalance, walletBalance, program, programRent, bufferRent] = await Promise.all([
    connection.getBalance(relayer), connection.getBalance(suppliedWallet),
    connection.getAccountInfo(KAIROS_ROUTER_PROGRAM_ID),
    connection.getMinimumBalanceForRentExemption(bytes + 45),
    connection.getMinimumBalanceForRentExemption(bytes + 37),
  ]);
  return {
    cluster: config.cluster, program: KAIROS_ROUTER_PROGRAM_ID.toBase58(),
    executable: program?.executable ?? false, binaryBytes: bytes,
    relayer: relayer.toBase58(), relayerSol: relayerBalance / 1e9,
    suppliedWalletSol: walletBalance / 1e9,
    // Use `solana program deploy --max-len <binaryBytes>` to avoid reserving double space.
    // Conservative buffer + program-data rent; excludes pools/token setup.
    estimatedDeploymentSol: (programRent + bufferRent) / 1e9 + 0.1,
  };
});
console.log(JSON.stringify(report, null, 2));
