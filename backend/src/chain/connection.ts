import { Connection } from "@solana/web3.js";
import { config } from "../config";

/**
 * Chain connection layer (contracts.md §6).
 *
 * getConnection() returns a Connection on config.rpcUrl; chain/ and workers/
 * should route RPC calls through withFailover(fn) so that a failing primary
 * endpoint is retried once against config.fallbackRpcUrl.
 */

const COMMITMENT = "confirmed";

let primary: Connection | null = null;
let fallback: Connection | null = null;

export function getConnection(): Connection {
  if (!primary) {
    primary = new Connection(config.rpcUrl, {
      commitment: COMMITMENT,
      confirmTransactionInitialTimeout: 90_000,
    });
  }
  return primary;
}

export function getFallbackConnection(): Connection {
  if (!fallback) {
    fallback = new Connection(config.fallbackRpcUrl, {
      commitment: COMMITMENT,
      confirmTransactionInitialTimeout: 90_000,
    });
  }
  return fallback;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Run an RPC call against the primary connection; on failure retry exactly
 * once against the fallback connection.
 */
export async function withFailover<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
  try {
    return await fn(getConnection());
  } catch (err) {
    console.warn(`[chain] primary RPC failed (${errMessage(err)}); retrying on fallback RPC`);
    return fn(getFallbackConnection());
  }
}

/** getLatestBlockhash with failover. */
export function getLatestBlockhash(conn?: Connection) {
  const fn = (c: Connection) => c.getLatestBlockhash(COMMITMENT);
  return conn ? fn(conn) : withFailover(fn);
}

/** getBalance with failover (lamports). */
export function getBalance(conn: Connection | undefined, pubkey: Parameters<Connection["getBalance"]>[0]) {
  const fn = (c: Connection) => c.getBalance(pubkey, COMMITMENT);
  return conn ? fn(conn) : withFailover(fn);
}

/** sendRawTransaction with failover. */
export function sendRawTransaction(rawTransaction: Uint8Array | Buffer) {
  return withFailover((c) => c.sendRawTransaction(rawTransaction, { skipPreflight: false }));
}

/** getSignatureStatuses with failover. */
export function getSignatureStatuses(signatures: string[], searchTransactionHistory = false) {
  return withFailover((c) => c.getSignatureStatuses(signatures, { searchTransactionHistory }));
}

/** simulateTransaction with failover (no signature verification by default). */
export function simulateTransaction(
  tx: Parameters<Connection["simulateTransaction"]>[0],
  sigVerify = false
) {
  return withFailover((c) => c.simulateTransaction(tx, { sigVerify, replaceRecentBlockhash: true }));
}
