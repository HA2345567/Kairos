import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { FIXED_ROUTER_ACCOUNTS } from "./alt-manager";

export async function verifyTransactionAndBalances(
  connection: Connection,
  txSignature: string,
  userPubkey: PublicKey
) {
  console.log(`Verifying transaction: ${txSignature}`);

  // 1. Confirm transaction
  const tx = await connection.getTransaction(txSignature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    throw new Error(`Transaction ${txSignature} not found or not yet confirmed`);
  }

  // 2. Extract logs and check for InvestLegExecuted events
  const logs = tx.meta?.logMessages ?? [];
  const legEvents = logs.filter((log) => log.includes("InvestLegExecuted") || log.includes("Kairos Swap Leg Executed"));

  console.log(`Found ${legEvents.length} swap execution log events.`);

  // 3. Query user ATAs for WSOL and JTO
  const userWsolAta = getAssociatedTokenAddressSync(
    FIXED_ROUTER_ACCOUNTS.WSOL_MINT,
    userPubkey
  );
  const userJtoAta = getAssociatedTokenAddressSync(
    FIXED_ROUTER_ACCOUNTS.JTO_MINT,
    userPubkey
  );

  const [wsolBalance, jtoBalance] = await Promise.all([
    connection.getTokenAccountBalance(userWsolAta).catch(() => null),
    connection.getTokenAccountBalance(userJtoAta).catch(() => null),
  ]);

  return {
    signature: txSignature,
    slot: tx.slot,
    err: tx.meta?.err,
    computeUnitsConsumed: tx.meta?.computeUnitsConsumed,
    executionLogs: legEvents,
    balances: {
      wsol: wsolBalance?.value.uiAmountString ?? "0",
      jto: jtoBalance?.value.uiAmountString ?? "0",
    },
  };
}
