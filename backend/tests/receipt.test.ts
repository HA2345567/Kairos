import { test } from "node:test";
import assert from "node:assert/strict";
import type { TokenBalance } from "@solana/web3.js";
import { parseLegReceipt } from "../src/chain/receipt";

function balance(mint: string, amount: string, owner = "wallet", decimals = 6): TokenBalance {
  return { accountIndex: 0, mint, owner, uiTokenAmount: { amount, decimals, uiAmount: null } };
}
function transaction(preTokenBalances: TokenBalance[], postTokenBalances: TokenBalance[]) {
  return {
    slot: 123, transaction: { signatures: ["signature"] },
    meta: { err: null, fee: 5000, preBalances: [], postBalances: [], preTokenBalances, postTokenBalances },
  };
}
const parse = (tx: Parameters<typeof parseLegReceipt>[0], side?: "buy" | "sell") =>
  parseLegReceipt(tx, "signature", "wallet", "asset", "usdc", side);

test("buy receipt uses exact token deltas and ignores treasury balances", () => {
  const receipt = parse(transaction(
    [balance("usdc", "50000000"), balance("asset", "90071992547409930")],
    [balance("usdc", "40000000"), balance("asset", "90071992549809931"), balance("asset", "9999999", "treasury")],
  ), "buy");
  assert.equal(receipt.actualOut, "2400001");
  assert.equal(receipt.actualIn, "10000000");
  assert.equal(receipt.assetBalanceAfter, "90071992549809931");
  assert.equal(receipt.outputMint, "asset");
  assert.equal(receipt.commitment, "confirmed");
});

test("new ATA output and closed ATA input are accounted for", () => {
  assert.equal(parse(transaction(
    [balance("usdc", "10000000")],
    [balance("usdc", "0"), balance("asset", "2400000")],
  )).actualOut, "2400000");
  const sale = parse(transaction(
    [balance("asset", "2400000"), balance("usdc", "10")],
    [balance("usdc", "9900010")],
  ), "sell");
  assert.equal(sale.actualIn, "2400000");
  assert.equal(sale.actualOut, "9900000");
  assert.equal(sale.assetBalanceAfter, "0");
  assert.equal(sale.outputMint, "usdc");
});

test("missing, failed, mismatched, and directionally invalid receipts are rejected", () => {
  const tx = transaction([balance("usdc", "10")], [balance("asset", "5")]);
  assert.throws(() => parse({ ...tx, meta: null }), /SUCCESSFUL_TOKEN_RECEIPT_REQUIRED/);
  assert.throws(() => parse({ ...tx, meta: { ...tx.meta, err: { InstructionError: [0, "failed"] } } }), /SUCCESSFUL_TOKEN_RECEIPT_REQUIRED/);
  assert.throws(() => parse({ ...tx, transaction: { signatures: ["other"] } }), /RECEIPT_SIGNATURE_MISMATCH/);
  assert.throws(() => parse(tx, "sell"), /RECEIPT_SWAP_DIRECTION_MISMATCH/);
  assert.throws(() => parse(transaction([], [])), /RECEIPT_SWAP_BALANCES_MISSING/);
  assert.throws(() => parse(transaction([], [balance("asset", "1.5")])), /INVALID_RECEIPT_AMOUNT/);
  assert.throws(() => parse(transaction([], [balance("asset", "5", "someone-else")])), /RECEIPT_SWAP_BALANCES_MISSING/);
});
