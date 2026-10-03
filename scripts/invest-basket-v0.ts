import {
  Connection,
  PublicKey,
  Keypair,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionInstruction,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import {
  FIXED_ROUTER_ACCOUNTS,
  getFixedAltAddresses,
} from "./alt-manager";
import {
  fetchJupiterQuote,
  fetchSwapInstructions,
} from "./jupiter-client";

export const MAX_SAFE_CU_LIMIT = 1_120_000; // 80% of 1.4M cap
export const TOTAL_SOLANA_CU_CAP = 1_400_000;

export interface SimulationResult {
  unitsConsumed: number;
  isWithinSafeLimit: boolean;
  logs: string[];
  err: any;
  v0Transaction: VersionedTransaction;
  solLegAccountsCount: number;
  jtoLegAccountsCount: number;
}

export function buildSwapLegInstruction(
  kairosProgramId: PublicKey,
  user: PublicKey,
  userUsdcAta: PublicKey,
  userDestAta: PublicKey,
  basketConfigPda: PublicKey,
  jupiterSwapInstruction: {
    programId: string;
    accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
    data: string;
  },
  amountInUsdc: bigint,
  minAmountOut: bigint
): TransactionInstruction {
  // Discriminator for swap_and_distribute_leg
  // In Anchor, instruction discriminator = sha256("global:swap_and_distribute_leg")[..8]
  // 0xd3037953cb7be8d1
  const discriminator = Buffer.from([211, 3, 121, 83, 203, 123, 232, 209]);

  const rawSwapData = Buffer.from(jupiterSwapInstruction.data, "base64");

  // Serialize args: amount_in_usdc (u64), min_amount_out (u64), jupiter_swap_data (Vec<u8>)
  const data = Buffer.alloc(8 + 8 + 8 + 4 + rawSwapData.length);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(amountInUsdc, 8);
  data.writeBigUInt64LE(minAmountOut, 16);
  data.writeUInt32LE(rawSwapData.length, 24);
  rawSwapData.copy(data, 28);

  // Accounts
  const keys = [
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: userUsdcAta, isSigner: false, isWritable: true },
    { pubkey: userDestAta, isSigner: false, isWritable: true },
    { pubkey: basketConfigPda, isSigner: false, isWritable: false },
    { pubkey: FIXED_ROUTER_ACCOUNTS.JUPITER_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: FIXED_ROUTER_ACCOUNTS.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: FIXED_ROUTER_ACCOUNTS.SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    // Remaining accounts forwarded to Jupiter
    ...jupiterSwapInstruction.accounts.map((acc) => ({
      pubkey: new PublicKey(acc.pubkey),
      isSigner: acc.isSigner,
      isWritable: acc.isWritable,
    })),
  ];

  return new TransactionInstruction({
    programId: kairosProgramId,
    keys,
    data,
  });
}

export async function assembleAndSimulateBasketInvestment(
  connection: Connection,
  user: Keypair,
  kairosProgramId: PublicKey,
  totalUsdcAtomic = 1_000_000n // $1.00 USDC
): Promise<SimulationResult> {
  const halfUsdc = totalUsdcAtomic / 2n;

  // 1. Fetch quotes for SOL and JTO legs
  const solQuote = await fetchJupiterQuote(
    FIXED_ROUTER_ACCOUNTS.USDC_MINT.toBase58(),
    FIXED_ROUTER_ACCOUNTS.WSOL_MINT.toBase58(),
    halfUsdc
  );

  const jtoQuote = await fetchJupiterQuote(
    FIXED_ROUTER_ACCOUNTS.USDC_MINT.toBase58(),
    FIXED_ROUTER_ACCOUNTS.JTO_MINT.toBase58(),
    halfUsdc
  );

  // 2. Fetch swap instructions for both legs
  const [solSwapIxRes, jtoSwapIxRes] = await Promise.all([
    fetchSwapInstructions(user.publicKey.toBase58(), solQuote),
    fetchSwapInstructions(user.publicKey.toBase58(), jtoQuote),
  ]);

  // 3. Collect all unique addresses for Address Lookup Table
  const uniqueAddresses = new Set<string>();
  getFixedAltAddresses(kairosProgramId).forEach((pk) => uniqueAddresses.add(pk.toBase58()));

  solSwapIxRes.swapInstruction.accounts.forEach((a) => uniqueAddresses.add(a.pubkey));
  jtoSwapIxRes.swapInstruction.accounts.forEach((a) => uniqueAddresses.add(a.pubkey));

  const altAddressList = Array.from(uniqueAddresses).map((s) => new PublicKey(s));

  // 4. Derive Basket Config PDA
  const [basketConfigPda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("basket"), new TextEncoder().encode("sol_jto_50_50")],
    kairosProgramId
  );

  // Derive Associated Token Accounts
  // For simulation check, user public key or mock ATAs
  const userUsdcAta = user.publicKey;
  const userWsolAta = user.publicKey;
  const userJtoAta = user.publicKey;

  // 5. Build instructions for Versioned Transaction (v0)
  const instructions: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: TOTAL_SOLANA_CU_CAP }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
    buildSwapLegInstruction(
      kairosProgramId,
      user.publicKey,
      userUsdcAta,
      userWsolAta,
      basketConfigPda,
      solSwapIxRes.swapInstruction,
      halfUsdc,
      BigInt(solQuote.otherAmountThreshold)
    ),
    buildSwapLegInstruction(
      kairosProgramId,
      user.publicKey,
      userUsdcAta,
      userJtoAta,
      basketConfigPda,
      jtoSwapIxRes.swapInstruction,
      halfUsdc,
      BigInt(jtoQuote.otherAmountThreshold)
    ),
  ];

  // 6. Fetch real on-chain Address Lookup Tables returned by Jupiter
  const altAddresses = new Set<string>([
    ...(solSwapIxRes.addressLookupTableAddresses ?? []),
    ...(jtoSwapIxRes.addressLookupTableAddresses ?? []),
  ]);

  const lookupTableAccounts: AddressLookupTableAccount[] = [];
  for (const addr of altAddresses) {
    const tableRes = await connection.getAddressLookupTable(new PublicKey(addr));
    if (tableRes.value) {
      lookupTableAccounts.push(tableRes.value);
    }
  }

  const latestBlockhash = await connection.getLatestBlockhash("confirmed");

  const messageV0 = new TransactionMessage({
    payerKey: user.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions,
  }).compileToV0Message(lookupTableAccounts);

  const v0Tx = new VersionedTransaction(messageV0);
  v0Tx.sign([user]);

  // 7. Execute simulateTransaction
  const simResponse = await connection.simulateTransaction(v0Tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });

  const unitsConsumed = simResponse.value.unitsConsumed ?? 0;
  const isWithinSafeLimit = unitsConsumed < MAX_SAFE_CU_LIMIT;

  return {
    unitsConsumed,
    isWithinSafeLimit,
    logs: simResponse.value.logs ?? [],
    err: simResponse.value.err,
    v0Transaction: v0Tx,
    solLegAccountsCount: solSwapIxRes.swapInstruction.accounts.length,
    jtoLegAccountsCount: jtoSwapIxRes.swapInstruction.accounts.length,
  };
}
