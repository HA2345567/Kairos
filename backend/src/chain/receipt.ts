import type { TokenBalance, VersionedMessage, VersionedTransactionResponse } from "@solana/web3.js";
import type { ExecutionLegReceipt } from "../db/schema";
import { withFailover } from "./connection";

type ReceiptTransaction = Pick<VersionedTransactionResponse, "slot" | "meta"> & {
  transaction: { signatures: string[]; message?: VersionedMessage };
};
type ReceiptCommitment = "confirmed" | "finalized";
const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

function walletBalance(balances: TokenBalance[], owner: string, mint: string) {
  const rows = balances.filter(row => row.owner === owner && row.mint === mint);
  let amount = 0n;
  for (const row of rows) {
    if (!/^\d+$/.test(row.uiTokenAmount.amount)) throw new Error("INVALID_RECEIPT_AMOUNT");
    amount += BigInt(row.uiTokenAmount.amount);
  }
  const decimals = rows[0]?.uiTokenAmount.decimals;
  if (rows.some(row => row.uiTokenAmount.decimals !== decimals)) throw new Error("RECEIPT_DECIMALS_MISMATCH");
  return { amount, decimals };
}

/** Wallet deltas are exact base units; sell output is USDC net of transfers. */
export function parseLegReceipt(
  transaction: ReceiptTransaction,
  signature: string,
  wallet: string,
  assetMint: string,
  usdcMint: string,
  expectedSide?: "buy" | "sell",
  commitment: "confirmed" | "finalized" = "confirmed",
  fundingAsset: "USDC" | "SOL" = "USDC"
): ExecutionLegReceipt {
  if (transaction.transaction.signatures[0] !== signature) throw new Error("RECEIPT_SIGNATURE_MISMATCH");
  const meta = transaction.meta;
  if (!meta || meta.err || !meta.preTokenBalances || !meta.postTokenBalances) {
    throw new Error("SUCCESSFUL_TOKEN_RECEIPT_REQUIRED");
  }
  const before = walletBalance(meta.preTokenBalances, wallet, assetMint);
  const after = walletBalance(meta.postTokenBalances, wallet, assetMint);
  const assetDelta = after.amount - before.amount;
  const usdcBefore = fundingAsset === "USDC" ? walletBalance(meta.preTokenBalances, wallet, usdcMint) : undefined;
  const usdcAfter = fundingAsset === "USDC" ? walletBalance(meta.postTokenBalances, wallet, usdcMint) : undefined;
  const usdcDelta = usdcBefore && usdcAfter ? usdcAfter.amount - usdcBefore.amount : 0n;
  const accountKeys = transaction.transaction.message?.staticAccountKeys ?? [];
  const walletIndex = accountKeys.findIndex((key) => key.toBase58() === wallet);
  const solDelta = walletIndex >= 0 && meta.preBalances[walletIndex] !== undefined && meta.postBalances[walletIndex] !== undefined
    ? BigInt(meta.postBalances[walletIndex] - meta.preBalances[walletIndex])
    : 0n;
  const inputDelta = fundingAsset === "SOL" ? solDelta : usdcDelta;
  const side = assetDelta > 0n && inputDelta < 0n ? "buy"
    : fundingAsset === "USDC" && assetDelta < 0n && inputDelta > 0n ? "sell" : undefined;
  const assetDecimals = after.decimals ?? before.decimals;
  if (!side || assetDecimals === undefined) throw new Error("RECEIPT_SWAP_BALANCES_MISSING");
  if (expectedSide && side !== expectedSide) throw new Error("RECEIPT_SWAP_DIRECTION_MISMATCH");
  if (before.decimals !== undefined && after.decimals !== undefined && before.decimals !== after.decimals) {
    throw new Error("RECEIPT_DECIMALS_MISMATCH");
  }
  return {
    side,
    inputMint: side === "buy" ? (fundingAsset === "SOL" ? WRAPPED_SOL_MINT : usdcMint) : assetMint,
    outputMint: side === "buy" ? assetMint : usdcMint,
    actualIn: (side === "buy" ? -inputDelta : -assetDelta).toString(),
    actualOut: (side === "buy" ? assetDelta : usdcDelta).toString(),
    assetBalanceAfter: after.amount.toString(),
    assetDecimals,
    slot: transaction.slot,
    commitment,
  };
}

export async function getLegReceipt(
  signature: string,
  wallet: string,
  assetMint: string,
  usdcMint: string,
  side?: "buy" | "sell",
  commitment: ReceiptCommitment = "finalized",
  fundingAsset: "USDC" | "SOL" = "USDC"
): Promise<ExecutionLegReceipt> {
  // Null can mean provider indexing lag. Try the fallback, then let the job
  // retry; never replace a missing receipt with the prepared quote.
  return withFailover(async connection => {
    const transaction = await connection.getTransaction(signature, {
      commitment, maxSupportedTransactionVersion: 0,
    });
    if (!transaction) throw new Error("TRANSACTION_RECEIPT_PENDING");
    return parseLegReceipt(transaction, signature, wallet, assetMint, usdcMint, side, commitment, fundingAsset);
  });
}
