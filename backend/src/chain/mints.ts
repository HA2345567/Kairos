import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMint,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
} from "@solana/spl-token";
import { withFailover } from "./connection";
import { deterministicKeypair } from "./devnetState";

/**
 * Mint + ATA provisioning for devnet (contracts.md §6 mints.ts).
 * All helpers are idempotent so scripts/devnet-setup.ts can be re-run safely
 * (also after a devnet reset).
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Derive the ATA address for `owner` holding `mint` (classic token program). */
export async function ataFor(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
  return getAssociatedTokenAddress(mint, owner);
}

async function tokenAccountAmount(conn: Connection, ata: PublicKey): Promise<bigint> {
  try {
    const acc = await withFailover((c) => getAccount(c, ata, "confirmed", TOKEN_PROGRAM_ID));
    return acc.amount;
  } catch {
    return 0n; // ATA does not exist yet
  }
}

/**
 * Idempotently ensure the SPL mint derived from `label` exists with `decimals`
 * and `mintAuthority`. Returns the mint keypair (deterministic, from label).
 */
export async function ensureMint(
  conn: Connection,
  payer: Keypair,
  label: string,
  decimals: number,
  mintAuthority: PublicKey
): Promise<Keypair> {
  const mintKeypair = deterministicKeypair(label);

  const info = await withFailover((c) => c.getAccountInfo(mintKeypair.publicKey));
  if (info) {
    if (info.owner.toBase58() !== TOKEN_PROGRAM_ID.toBase58()) {
      throw new Error(
        `[mints] account ${mintKeypair.publicKey.toBase58()} (label "${label}") exists but is not an SPL token account (owner ${info.owner.toBase58()})`
      );
    }
    const mint = await withFailover((c) => getMint(c, mintKeypair.publicKey, "confirmed", TOKEN_PROGRAM_ID));
    if (mint.decimals !== decimals) {
      throw new Error(
        `[mints] mint ${mintKeypair.publicKey.toBase58()} (label "${label}") exists with ${mint.decimals} decimals, expected ${decimals}`
      );
    }
    return mintKeypair; // already provisioned
  }

  // createMint signs with payer + mintKeypair and confirms internally.
  await withFailover((c) =>
    createMint(c, payer, mintAuthority, null, decimals, mintKeypair, { commitment: "confirmed" })
  );
  return mintKeypair;
}

function uniqueSigners(payer: Keypair, extra?: Keypair): Keypair[] {
  if (!extra || extra.publicKey.equals(payer.publicKey)) return [payer];
  return [payer, extra];
}

/**
 * Idempotently ensure an associated token account exists for `owner` and, when
 * `mintAuthorityKeypair` + `amountUi` are given, top the balance up to
 * `amountUi` (mints only the shortfall, so re-running does not inflate supply).
 * Returns the ATA address and confirmed chain signature (when a transaction was sent).
 */
export async function ensureFundedAta(
  conn: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  mintAuthorityKeypair?: Keypair,
  amountUi?: number
): Promise<{ ata: PublicKey; signature: string | null }> {
  const ata = await ataFor(mint, owner);

  const instructions: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, owner, mint),
  ];
  let signers = uniqueSigners(payer);

  if (mintAuthorityKeypair && amountUi && amountUi > 0) {
    const mintInfo = await withFailover((c) => getMint(c, mint, "confirmed", TOKEN_PROGRAM_ID));
    const targetBase = BigInt(Math.round(amountUi * 10 ** mintInfo.decimals));
    const current = await tokenAccountAmount(conn, ata);
    if (current < targetBase) {
      instructions.push(
        createMintToInstruction(mint, ata, mintAuthorityKeypair.publicKey, targetBase - current)
      );
      signers = uniqueSigners(payer, mintAuthorityKeypair);
    }
  }

  // Nothing to do if the ATA already exists and no top-up was required.
  if (instructions.length === 1) {
    const info = await withFailover((c) => c.getAccountInfo(ata));
    if (info) return { ata, signature: null };
  }

  const { blockhash, lastValidBlockHeight } = await withFailover((c) =>
    c.getLatestBlockhash("confirmed")
  );
  const tx = new Transaction().add(...instructions);
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = blockhash;

  let signature: string;
  try {
    signature = await withFailover((c) =>
      c.sendTransaction(tx, signers, { skipPreflight: false, maxRetries: 3 })
    );
    await withFailover((c) =>
      c.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed")
    );
  } catch (err) {
    // Blockhash may have expired between fetch and send; retry once.
    await sleep(1_000);
    const retry = await withFailover((c) => c.getLatestBlockhash("confirmed"));
    const tx2 = new Transaction().add(...instructions);
    tx2.feePayer = payer.publicKey;
    tx2.recentBlockhash = retry.blockhash;
    signature = await withFailover((c) =>
      c.sendTransaction(tx2, signers, { skipPreflight: false, maxRetries: 3 })
    );
    await withFailover((c) =>
      c.confirmTransaction(
        { signature, blockhash: retry.blockhash, lastValidBlockHeight: retry.lastValidBlockHeight },
        "confirmed"
      )
    );
  }
  return { ata, signature };
}
