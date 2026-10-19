import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { AppError } from "../errors";

export interface AllowlistStore {
  getProgramAllowlist(): Promise<Array<{ programId: string }>>;
  isMintAllowlisted(mint: string): Promise<boolean>;
}

/**
 * Validate the compiled transaction boundary before simulation or relayer
 * signing. The transaction builders currently do not use address lookup
 * tables, so every executable instruction program must be present in the
 * message's static account keys and in the persisted allowlist.
 */
export async function assertTransactionAllowlisted(
  transaction: VersionedTransaction,
  requiredMints: string[],
  requiredPrograms: PublicKey[] = [],
  allowlistStore?: AllowlistStore
): Promise<void> {
  const store = allowlistStore ?? (await import("../db/repository")).repository;
  const allowedPrograms = new Set((await store.getProgramAllowlist()).map((row) => row.programId));

  for (const program of requiredPrograms) {
    if (!allowedPrograms.has(program.toBase58())) {
      throw new AppError("PROGRAM_NOT_ALLOWED", `Required program is not allowlisted: ${program.toBase58()}`, 422);
    }
  }

  for (const instruction of transaction.message.compiledInstructions) {
    const program = transaction.message.staticAccountKeys[instruction.programIdIndex];
    if (!program || !allowedPrograms.has(program.toBase58())) {
      throw new AppError(
        "PROGRAM_NOT_ALLOWED",
        `Transaction instruction targets a non-allowlisted program: ${program?.toBase58() ?? "unknown"}`,
        422
      );
    }
  }

  for (const mint of [...new Set(requiredMints)]) {
    try {
      new PublicKey(mint);
    } catch {
      throw new AppError("MINT_NOT_ALLOWED", `Invalid mint address: ${mint}`, 422);
    }
    if (!(await store.isMintAllowlisted(mint))) {
      throw new AppError("MINT_NOT_ALLOWED", `Mint is not allowlisted: ${mint}`, 422);
    }
  }
}
