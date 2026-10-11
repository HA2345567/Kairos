import {
  PublicKey,
  AddressLookupTableProgram,
  TransactionInstruction,
} from "@solana/web3.js";

export const FIXED_ROUTER_ACCOUNTS = {
  JUPITER_PROGRAM_ID: new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"),
  USDC_MINT: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  WSOL_MINT: new PublicKey("So11111111111111111111111111111111111111112"),
  JTO_MINT: new PublicKey("jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL"),
  TOKEN_PROGRAM_ID: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  ASSOCIATED_TOKEN_PROGRAM_ID: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
  SYSTEM_PROGRAM_ID: new PublicKey("11111111111111111111111111111111"),
};

export function getFixedAltAddresses(kairosProgramId: PublicKey): PublicKey[] {
  return [
    FIXED_ROUTER_ACCOUNTS.JUPITER_PROGRAM_ID,
    kairosProgramId,
    FIXED_ROUTER_ACCOUNTS.USDC_MINT,
    FIXED_ROUTER_ACCOUNTS.WSOL_MINT,
    FIXED_ROUTER_ACCOUNTS.JTO_MINT,
    FIXED_ROUTER_ACCOUNTS.TOKEN_PROGRAM_ID,
    FIXED_ROUTER_ACCOUNTS.ASSOCIATED_TOKEN_PROGRAM_ID,
    FIXED_ROUTER_ACCOUNTS.SYSTEM_PROGRAM_ID,
  ];
}

export function buildCreateLookupTableInstruction(
  authority: PublicKey,
  payer: PublicKey,
  recentSlot: number
): { instruction: TransactionInstruction; lookupTableAddress: PublicKey } {
  const [instruction, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
    authority,
    payer,
    recentSlot,
  });

  return { instruction, lookupTableAddress };
}

export function buildExtendLookupTableInstruction(
  lookupTable: PublicKey,
  payer: PublicKey,
  authority: PublicKey,
  addresses: PublicKey[]
): TransactionInstruction {
  return AddressLookupTableProgram.extendLookupTable({
    payer,
    authority,
    lookupTable,
    addresses,
  });
}
