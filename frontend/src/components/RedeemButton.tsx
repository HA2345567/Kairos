import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { IDL } from "@/lib/idl";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface RedeemButtonProps {
  marketId: string;
  marketIdNum: number;
  className?: string;
  onSuccess?: () => void;
}

export function RedeemButton({ marketId, marketIdNum, className, onSuccess }: RedeemButtonProps) {
  const [isClaiming, setIsClaiming] = useState(false);
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const queryClient = useQueryClient();

  const handleClaim = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!publicKey || !signTransaction) {
      toast.error("Please connect your wallet");
      return;
    }

    try {
      setIsClaiming(true);
      toast.loading("Preparing claim...", { id: "claim-p" });

      const programId = new PublicKey("By5KbxUEFGs7NrQYLXcjmptft6yX2saVWvoA8sx7HzqT");
      const provider = new anchor.AnchorProvider(
        connection,
        {
          publicKey: publicKey,
          signTransaction: signTransaction as any,
          signAllTransactions: async (txs) => txs,
        },
        { preflightCommitment: "confirmed" }
      );
      const program = new anchor.Program(IDL, provider);

      const marketIdBytes = new Uint8Array(4);
      const view = new DataView(marketIdBytes.buffer);
      view.setUint32(0, marketIdNum, true);

      const encoder = new TextEncoder();
      const [marketPda] = PublicKey.findProgramAddressSync([encoder.encode('market'), marketIdBytes], programId);
      const [vaultPda] = PublicKey.findProgramAddressSync([encoder.encode('vault'), marketIdBytes], programId);
      const [outcomeAMintPda] = PublicKey.findProgramAddressSync([encoder.encode('outcome_a'), marketIdBytes], programId);
      const [outcomeBMintPda] = PublicKey.findProgramAddressSync([encoder.encode('outcome_b'), marketIdBytes], programId);

      const collateralMint = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");
      const userCollateral = getAssociatedTokenAddressSync(collateralMint, publicKey);
      const userOutcomeA = getAssociatedTokenAddressSync(outcomeAMintPda, publicKey);
      const userOutcomeB = getAssociatedTokenAddressSync(outcomeBMintPda, publicKey);

      const tx = await program.methods
        .claimRewards(marketIdNum)
        .accounts({
          market: marketPda,
          user: publicKey,
          userCollateral: userCollateral,
          collateralVault: vaultPda,
          outcomeAMint: outcomeAMintPda,
          outcomeBMint: outcomeBMintPda,
          userOutcomeA: userOutcomeA,
          userOutcomeB: userOutcomeB,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .transaction();

      toast.loading("Awaiting approval...", { id: "claim-p" });
      const signature = await sendTransaction(tx, connection);
      
      toast.loading("Finalizing redemption...", { id: "claim-p" });
      await connection.confirmTransaction(signature, "confirmed");

      // Notify backend
      await api.redeemMarket(marketId, signature);

      toast.success("Winnings claimed!", { id: "claim-p" });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["market", marketId] });
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error(err);
      toast.error(`Claim failed: ${err.message || "Unknown error"}`, { id: "claim-p" });
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <button
      onClick={handleClaim}
      disabled={isClaiming}
      className={cn(
        "inline-flex items-center justify-center rounded-md bg-foreground px-3 py-1 text-xs font-semibold text-background transition hover:opacity-90 disabled:opacity-50",
        className
      )}
    >
      {isClaiming ? <Loader2 className="h-3 w-3 animate-spin" /> : "Redeem"}
    </button>
  );
}
