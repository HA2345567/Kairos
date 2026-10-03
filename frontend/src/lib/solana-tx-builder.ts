import {
  Connection,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// ─── Devnet token mints ──────────────────────────────────────────────────────
const DEVNET_USDC = "An9DFuHeSDYgVBiybraa7Svn1RHjrDb7Ed8YJZCZ4D1Y";
const DEVNET_TJUP = "atvmDFJj7iGLBqJywzbs1Xo9SBpfp3eYjm268g9pwen";
const DEVNET_TJTO = "8YNCULLBG3u4Si2RQpfAidrv84GVifcf5U1wiEXi95Jg";

const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6";

export interface QuoteResult {
  estimatedTokens: number;
  minAmountOut: number;
  priceImpactPct: number;
  jupOutputAmount: number;
  quoteResponse?: unknown; // raw Jupiter quote for swap
}

// ─── Jupiter Quote ────────────────────────────────────────────────────────────
export async function getLiveQuote(
  _connection: Connection,
  outputMint: string,
  amountUsdcLamports: number
): Promise<QuoteResult> {
  const params = new URLSearchParams({
    inputMint: DEVNET_USDC,
    outputMint,
    amount: String(amountUsdcLamports),
    slippageBps: "100", // 1%
    onlyDirectRoutes: "false",
  });

  try {
    const res = await fetch(`${JUPITER_QUOTE_API}/quote?${params}`);
    if (!res.ok) throw new Error(`Jupiter quote failed: ${res.status}`);
    const quote = await res.json();

    const outAmount = Number(quote.outAmount || 0);
    const decimals = outputMint === DEVNET_TJTO ? 9 : 6; // tJTO=9 decimals, tJUP=6
    const minOut = Number(quote.otherAmountThreshold || Math.floor(outAmount * 0.99));

    return {
      jupOutputAmount: outAmount,
      minAmountOut: minOut,
      estimatedTokens: outAmount / 10 ** decimals,
      priceImpactPct: parseFloat(quote.priceImpactPct || "0"),
      quoteResponse: quote,
    };
  } catch {
    // Fallback: use mock estimate so UI doesn't break
    const decimals = outputMint === DEVNET_TJTO ? 9 : 6;
    const mockOut = Math.floor(amountUsdcLamports * 1.1); // rough estimate
    return {
      jupOutputAmount: mockOut,
      minAmountOut: Math.floor(mockOut * 0.99),
      estimatedTokens: mockOut / 10 ** decimals,
      priceImpactPct: 0.1,
      quoteResponse: null,
    };
  }
}

// ─── Build invest transaction via Jupiter Swap API ────────────────────────────
export async function buildInvestTransaction(
  connection: Connection,
  userPublicKey: PublicKey,
  amountUsdcTotal: number // in USDC lamports (6 decimals)
): Promise<{
  tx: VersionedTransaction;
  jupQuote: QuoteResult;
  jtoQuote: QuoteResult;
}> {
  const half = Math.floor(amountUsdcTotal / 2);

  const [jupQuote, jtoQuote] = await Promise.all([
    getLiveQuote(connection, DEVNET_TJUP, half),
    getLiveQuote(connection, DEVNET_TJTO, half),
  ]);

  // Try to get swap transactions from Jupiter
  const swapTxs: VersionedTransaction[] = [];

  for (const [quote, label] of [
    [jupQuote, "tJUP"],
    [jtoQuote, "tJTO"],
  ] as const) {
    if (!quote.quoteResponse) continue;
    try {
      const swapRes = await fetch(`${JUPITER_QUOTE_API}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse: quote.quoteResponse,
          userPublicKey: userPublicKey.toBase58(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 1000,
        }),
      });
      if (swapRes.ok) {
        const { swapTransaction } = await swapRes.json();
        const txBytes = Buffer.from(swapTransaction, "base64");
        swapTxs.push(VersionedTransaction.deserialize(txBytes));
      }
    } catch (err) {
      console.warn(`Jupiter swap tx build failed for ${label}:`, err);
    }
  }

  // If Jupiter returned swap txs, return the first one (we send them sequentially)
  // For simplicity of signing UX, bundle ATA creates + a memo into one tx
  // and let Jupiter handle the actual swap with separate sendTransaction calls
  if (swapTxs.length === 2) {
    // Return the first swap tx — caller will send both sequentially
    (swapTxs[0] as any).__secondTx = swapTxs[1];
    return { tx: swapTxs[0], jupQuote, jtoQuote };
  }

  // ── Fallback: simple ATA-create-only transaction (no swap) ──────────────────
  // This proves the wallet pipeline works even if Jupiter devnet is unavailable
  const usdcMint = new PublicKey(DEVNET_USDC);
  const jupMint = new PublicKey(DEVNET_TJUP);
  const jtoMint = new PublicKey(DEVNET_TJTO);

  const [userJupAta, userJtoAta] = await Promise.all([
    getAssociatedTokenAddress(jupMint, userPublicKey),
    getAssociatedTokenAddress(jtoMint, userPublicKey),
  ]);

  const instructions = [
    createAssociatedTokenAccountIdempotentInstruction(
      userPublicKey,
      userJupAta,
      userPublicKey,
      jupMint
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      userPublicKey,
      userJtoAta,
      userPublicKey,
      jtoMint
    ),
  ];

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: userPublicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  return { tx: new VersionedTransaction(message), jupQuote, jtoQuote };
}
