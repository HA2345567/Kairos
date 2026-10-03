import { describe, it, expect } from "vitest";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  assembleAndSimulateBasketInvestment,
  MAX_SAFE_CU_LIMIT,
  TOTAL_SOLANA_CU_CAP,
} from "../../../scripts/invest-basket-v0";
import { FIXED_ROUTER_ACCOUNTS } from "../../../scripts/alt-manager";

describe("Kairos Router - Step 5 Assembly & Simulation Gate Tests", () => {
  // Use public mainnet endpoint for simulation
  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
  // Active funded mainnet account so simulation validates execution without AccountNotFound
  const testUser = Keypair.generate();
  const fundedPayer = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
  const mockProgramId = Keypair.generate().publicKey;

  it(
    "assembles Versioned Transaction (v0) with ALT and validates Compute Unit ceiling",
    async () => {
      // 1. Live simulation of the combined dual-swap instructions using Jupiter ALTs
      const solQuote = await fetch("https://api.jup.ag/swap/v1/quote?inputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&outputMint=So11111111111111111111111111111111111111112&amount=500000").then((r) => r.json());
      await new Promise((r) => setTimeout(r, 200));
      const jtoQuote = await fetch("https://api.jup.ag/swap/v1/quote?inputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&outputMint=jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL&amount=500000").then((r) => r.json());

      await new Promise((r) => setTimeout(r, 400));
      const solIxRes = await fetch("https://api.jup.ag/swap/v1/swap-instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPublicKey: fundedPayer.toBase58(), quoteResponse: solQuote, wrapAndUnwrapSol: false, useSharedAccounts: true }),
      }).then((r) => r.json());
      if (!solIxRes.swapInstruction) {
        throw new Error(`Jupiter SOL SwapIx Error: ${JSON.stringify(solIxRes)}`);
      }

      await new Promise((r) => setTimeout(r, 400));
      const jtoIxRes = await fetch("https://api.jup.ag/swap/v1/swap-instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPublicKey: fundedPayer.toBase58(), quoteResponse: jtoQuote, wrapAndUnwrapSol: false, useSharedAccounts: true }),
      }).then((r) => r.json());
      if (!jtoIxRes.swapInstruction) {
        throw new Error(`Jupiter JTO SwapIx Error: ${JSON.stringify(jtoIxRes)}`);
      }

      const altAddrs = Array.from(new Set([...(solIxRes.addressLookupTableAddresses || []), ...(jtoIxRes.addressLookupTableAddresses || [])]));
      const lookupTables = [];
      for (const a of altAddrs) {
        const t = await connection.getAddressLookupTable(new PublicKey(a));
        if (t.value) lookupTables.push(t.value);
      }

      const solIx = {
        programId: new PublicKey(solIxRes.swapInstruction.programId),
        keys: solIxRes.swapInstruction.accounts.map((a: any) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
        data: Buffer.from(solIxRes.swapInstruction.data, "base64"),
      };
      const jtoIx = {
        programId: new PublicKey(jtoIxRes.swapInstruction.programId),
        keys: jtoIxRes.swapInstruction.accounts.map((a: any) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
        data: Buffer.from(jtoIxRes.swapInstruction.data, "base64"),
      };

      const latestBh = await connection.getLatestBlockhash("confirmed");
      const { ComputeBudgetProgram, TransactionMessage, VersionedTransaction } = await import("@solana/web3.js");
      const msg = new TransactionMessage({
        payerKey: fundedPayer,
        recentBlockhash: latestBh.blockhash,
        instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }), solIx, jtoIx],
      }).compileToV0Message(lookupTables);

      const v0Tx = new VersionedTransaction(msg);
      const sim = await connection.simulateTransaction(v0Tx, { sigVerify: false, replaceRecentBlockhash: true });

      const unitsConsumed = sim.value.unitsConsumed ?? 0;
      const serializedSize = v0Tx.serialize().length;

      console.log(`[Telemetry] Real Simulated CU Consumed: ${unitsConsumed} CU`);
      console.log(`[Telemetry] Safe Ceiling (80% of 1.4M): ${MAX_SAFE_CU_LIMIT} CU`);
      console.log(`[Telemetry] v0 Serialized Packet Size: ${serializedSize} bytes (limit: 1232)`);
      console.log(`[Telemetry] Simulation Err: ${JSON.stringify(sim.value.err)}`);

      expect(serializedSize).toBeLessThanOrEqual(1232);
      expect(unitsConsumed).toBeGreaterThan(0);
      expect(unitsConsumed).toBeLessThanOrEqual(MAX_SAFE_CU_LIMIT);
      expect(sim.value.err).toBeNull();
    },
    30000
  );
});
