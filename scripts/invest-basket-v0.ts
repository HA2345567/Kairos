import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  AddressLookupTableAccount,
  TransactionInstruction,
} from "@solana/web3.js";

export const TOTAL_SOLANA_CU_CAP = 1_400_000;
export const MAX_SAFE_CU_LIMIT = Math.floor(TOTAL_SOLANA_CU_CAP * 0.8); // 1,120,000 CU

export interface AssembleInvestParams {
  connection: Connection;
  payerKey: PublicKey;
  instructions: TransactionInstruction[];
  lookupTables?: AddressLookupTableAccount[];
  computeUnits?: number;
}

export async function assembleAndSimulateBasketInvestment({
  connection,
  payerKey,
  instructions,
  lookupTables = [],
  computeUnits = MAX_SAFE_CU_LIMIT,
}: AssembleInvestParams): Promise<{
  transaction: VersionedTransaction;
  unitsConsumed: number;
  serializedSize: number;
  simulationError: any;
}> {
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");

  const cuInstruction = ComputeBudgetProgram.setComputeUnitLimit({
    units: computeUnits,
  });

  const message = new TransactionMessage({
    payerKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [cuInstruction, ...instructions],
  }).compileToV0Message(lookupTables);

  const transaction = new VersionedTransaction(message);
  const serializedSize = transaction.serialize().length;

  const simResult = await connection.simulateTransaction(transaction, {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });

  return {
    transaction,
    unitsConsumed: simResult.value.unitsConsumed ?? 0,
    serializedSize,
    simulationError: simResult.value.err,
  };
}
