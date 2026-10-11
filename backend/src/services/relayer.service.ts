import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { config } from "../config";
import { getBalance } from "../chain/connection";
import { DEVNET_LABELS, deterministicKeypair } from "../chain/devnetState";

/**
 * Gas relayer (contracts.md §7).
 *
 * The relayer is the fee payer of every leg transaction. On devnet it uses the
 * deterministic `kairos-devnet-relayer-v1` identity (same label scheme as the
 * mints/treasury), funded by scripts/devnet-setup.ts.
 *
 * DEVIATION (documented): contracts §7 does not mandate a keypair source, but
 * the task brief suggested config.relayerKeypair (seed-42). That address
 * (2iXtA8oeZqUU5pofxK971TCEvFGfems2AcDRaZHKD2pQ) already exists on devnet
 * owned by the SPL Token program, so the runtime rejects it as fee payer
 * ("This account may not be used to pay transaction fees") — permanently, and
 * it cannot be closed without its token-account owner's signature. config's
 * keypair is therefore still used for mainnet-beta.
 */

const RELAYER_FUNDED_MIN_SOL = 0.01;

let cached: Keypair | null = null;

function keypair(): Keypair {
  if (!cached) {
    cached = config.isDevnet()
      ? deterministicKeypair(DEVNET_LABELS.relayer)
      : config.relayerKeypair;
    console.log(
      `[relayer] identity ${cached.publicKey.toBase58()} (${config.isDevnet() ? "devnet-deterministic" : "config"})`
    );
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
