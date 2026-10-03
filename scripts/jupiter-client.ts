import {
  PublicKey,
  AccountMeta,
} from "@solana/web3.js";

export const JUPITER_API_BASE = "https://api.jup.ag/swap/v1";

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: any[];
}

export interface JupiterSwapInstructionsResponse {
  tokenLedgerInstruction?: any;
  computeBudgetInstructions?: any[];
  setupInstructions?: any[];
  swapInstruction: {
    programId: string;
    accounts: {
      pubkey: string;
      isSigner: boolean;
      isWritable: boolean;
    }[];
    data: string; // Base64 serialized instruction data
  };
  cleanupInstruction?: any;
  addressLookupTableAddresses?: string[];
}

export interface CategorizedLegAccounts {
  programId: PublicKey;
  fixedAccounts: AccountMeta[];
  dynamicRemainingAccounts: AccountMeta[];
  data: Buffer;
  minAmountOut: bigint;
}

async function fetchWithRetry(url: string, options?: RequestInit, maxRetries = 4, baseDelayMs = 800): Promise<Response> {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const response = await fetch(url, options);
      if (response.status === 429 && attempt <= maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[Jupiter Client] 429 Rate limited on ${url}. Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return response;
    } catch (err: any) {
      if (attempt <= maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}

export async function fetchJupiterQuote(
  inputMint: string,
  outputMint: string,
  amountAtomic: bigint,
  slippageBps = 50
): Promise<JupiterQuoteResponse> {
  const url = `${JUPITER_API_BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountAtomic.toString()}&slippageBps=${slippageBps}`;
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter Quote API failed (${response.status}): ${errorText}`);
  }
  return await response.json();
}

export async function fetchSwapInstructions(
  userPublicKey: string,
  quoteResponse: JupiterQuoteResponse
): Promise<JupiterSwapInstructionsResponse> {
  const url = `${JUPITER_API_BASE}/swap-instructions`;
  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userPublicKey,
      quoteResponse,
      wrapAndUnwrapSol: false,
      useSharedAccounts: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter Swap Instructions API failed (${response.status}): ${errorText}`);
  }
  return await response.json();
}

export function parseAndCategorizeSwapInstruction(
  swapInstruction: JupiterSwapInstructionsResponse["swapInstruction"],
  minAmountOut: bigint,
  staticKnownKeys: Set<string>
): CategorizedLegAccounts {
  const programId = new PublicKey(swapInstruction.programId);
  const data = Buffer.from(swapInstruction.data, "base64");

  const fixedAccounts: AccountMeta[] = [];
  const dynamicRemainingAccounts: AccountMeta[] = [];

  for (const acc of swapInstruction.accounts) {
    const pubkey = new PublicKey(acc.pubkey);
    const meta: AccountMeta = {
      pubkey,
      isSigner: acc.isSigner,
      isWritable: acc.isWritable,
    };

    if (staticKnownKeys.has(acc.pubkey)) {
      fixedAccounts.push(meta);
    } else {
      dynamicRemainingAccounts.push(meta);
    }
  }

  return {
    programId,
    fixedAccounts,
    dynamicRemainingAccounts,
    data,
    minAmountOut,
  };
}
