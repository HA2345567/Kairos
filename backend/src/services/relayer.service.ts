import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { config } from "../config";
import { getBalance } from "../chain/connection";

/**
 * Gas relayer (contracts.md §7).
 *
 * The relayer is the fee payer of every leg transaction. It always uses a
 * secret key supplied through environment configuration; public label-derived
 * keys are never used to authorize transactions.
 */

const RELAYER_FUNDED_MIN_SOL = 0.01;

let cached: Keypair | null = null;

function keypair(): Keypair {
  if (!cached) {
    cached = config.relayerKeypair;
    console.log(`[relayer] identity ${cached.publicKey.toBase58()} (configured)`);
  }
  return cached;
}

async function getSolBalance(): Promise<number> {
  try {
    const lamports = await getBalance(undefined, keypair().publicKey); // withFailover
    return lamports / 1e9;
  } catch {
    return -1; // RPC unreachable — surfaces as "unknown", not 0
  }
}

export const relayerService: {
  getPublicKey(): PublicKey;
  getKeypair(): Keypair;
  signTransaction(tx: VersionedTransaction): VersionedTransaction;
  getSolBalance(): Promise<number>;
  isFunded(): Promise<boolean>;
} = {
  getPublicKey: () => keypair().publicKey,
  getKeypair: keypair,
  signTransaction(tx: VersionedTransaction): VersionedTransaction {
    tx.sign([keypair()]);
    return tx;
  },
  getSolBalance,
  isFunded: async () => (await getSolBalance()) > RELAYER_FUNDED_MIN_SOL,
};
