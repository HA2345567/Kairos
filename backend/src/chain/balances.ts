import { Connection, PublicKey, type Commitment } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { withFailover } from "./connection";

/**
 * Token balance reads (contracts.md §6 balances.ts).
 *
 * getTokenBalances returns RAW base units (not UI) keyed by mint base58;
 * a missing token account reads as 0. Consumers convert to UI with the
 * token's decimals.
 */

interface ParsedTokenAccountResponse {
  value: {
    account: {
      data: {
        parsed?: {
          info?: {
            mint?: string;
            tokenAmount?: { amount?: string; decimals?: number; uiAmount?: number | null };
          };
        };
      };
    };
  }[];
}

/**
 * Fetch the raw (base-unit) balances for `mints` held by `owner`.
 * Missing accounts are reported as 0 so callers never see `undefined`.
 */
export async function getTokenBalances(
  conn: Connection,
  owner: PublicKey,
  mints: PublicKey[],
  commitment: Commitment = "confirmed"
): Promise<Record<string, number>> {
  void conn; // calls route through withFailover (primary + fallback RPC) like the rest of chain/
  const balances: Record<string, number> = {};
  for (const mint of mints) balances[mint.toBase58()] = 0;

  const responses = await withFailover((c) => Promise.all(
    [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map((programId) =>
      c.getParsedTokenAccountsByOwner(owner, { programId }, commitment) as unknown as Promise<ParsedTokenAccountResponse>
    )
  ));

  const wanted = new Set(Object.keys(balances));
  for (const response of responses) {
    for (const { account } of response.value) {
      const info = account.data.parsed?.info;
      if (!info?.mint || !wanted.has(info.mint)) continue;
      const amount = info.tokenAmount?.amount;
      if (amount === undefined) continue;
      const raw = Number(amount);
      if (Number.isFinite(raw)) balances[info.mint] = (balances[info.mint] ?? 0) + raw;
    }
  }
  return balances;
}

/** Convenience: single-mint balance converted to UI units (missing account = 0). */
export async function getTokenBalanceUi(
  conn: Connection,
  owner: PublicKey,
  mint: PublicKey,
  decimals: number
): Promise<number> {
  const raw = (await getTokenBalances(conn, owner, [mint]))[mint.toBase58()] ?? 0;
  return raw / 10 ** decimals;
}
