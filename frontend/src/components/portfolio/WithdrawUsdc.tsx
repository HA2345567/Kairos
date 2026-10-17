import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DEVNET_USDC_MINT, parseUsdcBaseUnits } from "@/lib/usdc";

export function WithdrawUsdc() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState<bigint>(0n);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!publicKey) {
      setBalance(0n);
      return () => { active = false; };
    }
    void (async () => {
      try {
        const ata = await getAssociatedTokenAddress(new PublicKey(DEVNET_USDC_MINT), publicKey);
        const account = await getAccount(connection, ata, "confirmed", TOKEN_PROGRAM_ID);
        if (active) setBalance(account.amount);
      } catch {
        if (active) setBalance(0n);
      }
    })();
    return () => { active = false; };
  }, [connection, publicKey]);

  async function withdraw(event: FormEvent) {
    event.preventDefault();
    if (!publicKey) return toast.error("Connect a wallet to withdraw USDC");
    const units = parseUsdcBaseUnits(amount);
    if (!units) return toast.error("Enter an amount with up to 6 decimal places");
    if (units > balance) return toast.error("Amount exceeds your USDC balance");

    let destination: PublicKey;
    try { destination = new PublicKey(recipient.trim()); }
    catch { return toast.error("Enter a valid Solana recipient address"); }

    setBusy(true);
    try {
      const mint = new PublicKey(DEVNET_USDC_MINT);
      const sourceAta = await getAssociatedTokenAddress(mint, publicKey);
      const destinationAta = await getAssociatedTokenAddress(mint, destination, true);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash });
      if (!(await connection.getAccountInfo(destinationAta, "confirmed"))) {
        transaction.add(createAssociatedTokenAccountIdempotentInstruction(
          publicKey, destinationAta, destination, mint, TOKEN_PROGRAM_ID
        ));
      }
      transaction.add(createTransferCheckedInstruction(
        sourceAta, mint, destinationAta, publicKey, units, 6, [], TOKEN_PROGRAM_ID
      ));

      const signature = await sendTransaction(transaction, connection, { preflightCommitment: "confirmed" });
      const result = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
      if (result.value.err) throw new Error("The USDC transfer failed on chain");
      setAmount("");
      setBalance(await getAccount(connection, sourceAta, "confirmed", TOKEN_PROGRAM_ID).then(account => account.amount));
      toast.success("USDC withdrawal confirmed", {
        description: signature,
        action: { label: "View transaction", onClick: () => window.open(`https://explorer.solana.com/tx/${signature}?cluster=devnet`, "_blank", "noopener,noreferrer") },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "USDC withdrawal failed");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={withdraw} className="rounded-xl border border-border p-4 space-y-3" aria-label="Withdraw USDC">
    <div>
      <h3 className="font-semibold">Withdraw USDC</h3>
      <p className="text-sm text-muted-foreground">Transfer directly from your wallet to any Solana address. Available: {(Number(balance) / 1_000_000).toFixed(6)} USDC.</p>
    </div>
    <label className="block text-sm">Recipient address
      <input className="mt-1 block w-full rounded border border-border bg-background p-2 font-mono" value={recipient} onChange={event => setRecipient(event.target.value)} autoComplete="off" required />
    </label>
    <label className="block text-sm">Amount (USDC)
      <input className="mt-1 block w-full rounded border border-border bg-background p-2" value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" required />
    </label>
    <Button type="submit" variant="outline" disabled={busy || !publicKey || balance === 0n}>
      {busy ? "Waiting for wallet…" : "Withdraw USDC"}
    </Button>
  </form>;
}
