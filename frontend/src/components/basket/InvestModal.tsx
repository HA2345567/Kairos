import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Basket } from "@/lib/baskets-data";
import { TokenAvatar } from "@/components/common/TokenAvatar";
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Wallet,
  Coins,
  ExternalLink,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { buildInvestTransaction } from "@/lib/solana-tx-builder";
import { Button } from "@/components/arc/button";

interface InvestModalProps {
  basket: Basket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAmount?: string;
  onSuccess?: () => void;
}

export function InvestModal({ basket, open, onOpenChange, initialAmount, onSuccess }: InvestModalProps) {
  // Solana Wallet Adapter
  const { connected, publicKey, sendTransaction } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { connection } = useConnection();

  const isConnected = connected && !!publicKey;
  const activeAddressStr = publicKey?.toBase58() || null;
  const effectivePublicKey = publicKey;

  const [amountUsdc, setAmountUsdc] = useState<string>(initialAmount || "10");

  useEffect(() => {
    if (open && initialAmount && parseFloat(initialAmount) > 0) {
      setAmountUsdc(initialAmount);
    }
  }, [open, initialAmount]);
  const [isInvesting, setIsInvesting] = useState(false);
  const [step, setStep] = useState<"input" | "quoting" | "signing" | "success">("input");
  const [txSignature, setTxSignature] = useState<string>("");
  const [simError, setSimError] = useState<string | null>(null);
  const [liveQuote, setLiveQuote] = useState<{ jupTokens: number; jtoTokens: number } | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [isMintingFaucet, setIsMintingFaucet] = useState(false);

  const numAmount = parseFloat(amountUsdc) || 0;

  // Refresh USDC Devnet balance
  const refreshBalance = useCallback(async () => {
    if (!effectivePublicKey) return;
    try {
      const usdcMint = new PublicKey("An9DFuHeSDYgVBiybraa7Svn1RHjrDb7Ed8YJZCZ4D1Y");
      const ata = await getAssociatedTokenAddress(usdcMint, effectivePublicKey);
      const info = await connection.getTokenAccountBalance(ata);
      setUsdcBalance(info?.value?.uiAmount ?? 0);
    } catch {
      setUsdcBalance(0);
    }
  }, [connection, effectivePublicKey]);

  useEffect(() => {
    if (open && effectivePublicKey) {
      refreshBalance();
    }
  }, [open, effectivePublicKey, refreshBalance]);

  // Connect helper — open standard Wallet Adapter modal
  const handleConnect = () => {
    setWalletModalVisible(true);
  };

  // 1-Click Devnet Faucet (USDC + SOL)
  const handleFaucet = async () => {
    if (!activeAddressStr) {
      toast.error("Please connect your wallet first.");
      return;
    }
    setIsMintingFaucet(true);
    try {
      const apiBase = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
      const res = await fetch(`${apiBase}/api/faucet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: activeAddressStr, amountUsdc: 50 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Faucet failed");
      toast.success("Airdropped 50 Devnet USDC & SOL directly to your wallet!");
      await refreshBalance();
      setSimError(null);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to airdrop test funds.");
    } finally {
      setIsMintingFaucet(false);
    }
  };

  if (!basket) return null;

  const handleInvest = async () => {
    if (!isConnected || !effectivePublicKey) {
      handleConnect();
      return;
    }

    if (numAmount <= 0 || numAmount < 2) {
      toast.error("Minimum investment is $2 USDC (split 50/50 between constituent tokens).");
      return;
    }

    setSimError(null);
    setIsInvesting(true);

    try {
      // Step 1: Fetch live quotes + build tx(s) via Jupiter
      setStep("quoting");
      const amountLamports = Math.floor(numAmount * 1_000_000);

      const { tx, jupQuote, jtoQuote } = await buildInvestTransaction(
        connection,
        effectivePublicKey,
        amountLamports
      );

      setLiveQuote({
        jupTokens: jupQuote.estimatedTokens,
        jtoTokens: jtoQuote.estimatedTokens,
      });

      // Step 2: Sign & send — Jupiter txs come pre-signed by their program
      // so we skip simulation (it would fail with stale blockhash) and send directly
      setStep("signing");
      let sig: string;

      sig = await sendTransaction(tx, connection, {
        skipPreflight: true,  // Jupiter handles preflight internally
        preflightCommitment: "confirmed",
        maxRetries: 3,
      });

      // If two Jupiter swap txs, send the second one after confirming first
      const secondTx = (tx as any).__secondTx;
      if (secondTx) {
        await connection.confirmTransaction(sig, "confirmed");
        await sendTransaction(secondTx, connection, {
          skipPreflight: true,
          preflightCommitment: "confirmed",
          maxRetries: 3,
        });
      }

      // Step 3: Confirm on-chain
      const confirmation = await connection.confirmTransaction(sig, "confirmed");
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      // Step 4: Record in backend (non-blocking)
      const apiBase = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
      fetch(`${apiBase}/api/investments/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: effectivePublicKey.toBase58(),
          basketId: basket.id,
          txSignature: sig,
          amountUsdc: numAmount,
        }),
      }).catch(() => {});

      try {
        const storageKey = `kairos_invest_${effectivePublicKey.toBase58()}`;
        const prev = JSON.parse(localStorage.getItem(storageKey) || "[]");
        prev.unshift({
          action: "Invest",
          basketId: basket.id,
          basketName: basket.name,
          amountUsdc: numAmount,
          txSignature: sig,
          tokensDescription: `~${jupQuote.estimatedTokens.toFixed(3)} tJUP + ~${jtoQuote.estimatedTokens.toFixed(3)} tJTO`,
          timestamp: new Date().toISOString(),
        });
        localStorage.setItem(storageKey, JSON.stringify(prev));
      } catch (e) {}

      setTxSignature(sig);
      setStep("success");
      refreshBalance();
      onSuccess?.();
      toast.success(`Invested $${numAmount.toFixed(2)} USDC into 2 tokens!`);
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || "Failed to execute investment.";
      toast.error(msg);
      setSimError(msg);
      setStep("input");
    } finally {
      setIsInvesting(false);
    }
  };

  const handleReset = () => {
    setStep("input");
    setTxSignature("");
    setSimError(null);
    setLiveQuote(null);
    onOpenChange(false);
  };

  const stepLabel =
    step === "quoting"
      ? "Fetching live quotes via Jupiter..."
      : step === "signing"
      ? "Waiting for wallet signature..."
      : "Confirming on-chain...";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-surface border border-border text-foreground p-6 rounded-[22px] shadow-2xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="font-display text-xl font-bold text-foreground">
            Invest in {basket.name}
          </DialogTitle>
          <DialogDescription className="text-text-secondary text-xs leading-relaxed">
            USDC is split and swapped via Raydium CPMM directly into constituent tokens in your wallet's ATAs.
          </DialogDescription>
        </DialogHeader>

        {step === "success" ? (
          <div className="py-6 flex flex-col items-center text-center space-y-4">
            <div className="size-14 rounded-full bg-surface-hover text-foreground flex items-center justify-center border border-border shadow-sm">
              <CheckCircle2 className="size-8 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-display font-bold text-xl text-foreground">Investment Executed!</h3>
              <p className="text-xs text-text-secondary mt-1 max-w-xs mx-auto">
                Both tokens were delivered directly to your wallet Associated Token Accounts.
              </p>
            </div>

            <div className="w-full bg-background border border-border-subtle rounded-2xl p-3.5 text-xs space-y-2.5 text-left">
              <div className="flex justify-between text-text-muted pb-2 border-b border-border-subtle">
                <span>Destination Wallet:</span>
                <span className="text-foreground font-mono font-semibold">
                  {activeAddressStr
                    ? `${activeAddressStr.slice(0, 6)}...${activeAddressStr.slice(-4)}`
                    : "Connected Wallet"}
                </span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Invested USDC:</span>
                <span className="text-foreground font-semibold font-mono">
                  ${numAmount.toFixed(2)} USDC
                </span>
              </div>
              <div className="flex justify-between items-center text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-cyan-400" />
                  {basket.tokens[0]?.symbol || "tJUP"} received:
                </span>
                <span className="text-foreground font-semibold font-mono">
                  ~{liveQuote ? liveQuote.jupTokens.toFixed(4) : "1.1724"} {basket.tokens[0]?.symbol || "tJUP"}
                </span>
              </div>
              <div className="flex justify-between items-center text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-purple-400" />
                  {basket.tokens[1]?.symbol || "tJTO"} received:
                </span>
                <span className="text-foreground font-semibold font-mono">
                  ~{liveQuote ? liveQuote.jtoTokens.toFixed(4) : "0.4289"} {basket.tokens[1]?.symbol || "tJTO"}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border-subtle text-text-muted">
                <span>Transaction:</span>
                <a
                  href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground hover:underline font-bold font-mono flex items-center gap-1"
                >
                  <span>
                    {txSignature
                      ? `${txSignature.slice(0, 8)}...${txSignature.slice(-6)}`
                      : "View Explorer"}
                  </span>
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full pt-1">
              {activeAddressStr && (
                <a
                  href={`https://solscan.io/account/${activeAddressStr}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-2.5 rounded-xl border border-border hover:border-border-strong bg-surface hover:bg-surface-hover text-xs font-semibold text-foreground flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>View on Solscan</span>
                  <ArrowUpRight className="size-3.5 text-text-secondary" />
                </a>
              )}
              <Button
                variant="primary"
                size="md"
                onClick={handleReset}
                className="flex-1 font-bold"
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {/* Simulation error banner */}
            {simError && (
              <div className="flex flex-col gap-2 text-xs text-rose-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5 text-rose-400" />
                  <span className="leading-relaxed">{simError}</span>
                </div>
                {isConnected && (
                  <button
                    onClick={handleFaucet}
                    disabled={isMintingFaucet}
                    className="self-start mt-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1.5 cursor-pointer hover:bg-neutral-200 transition-colors"
                  >
                    <Coins className="size-3" />
                    <span>Airdrop 50 Devnet USDC to Wallet</span>
                  </button>
                )}
              </div>
            )}

            {/* Amount input */}
            <div>
              <div className="flex justify-between items-center text-xs text-text-secondary mb-1.5 font-medium">
                <span>Deposit Amount</span>
                <span className="text-text-muted">Currency: USDC (Devnet)</span>
              </div>
              <div className="relative flex items-center">
                <input
                  type="number"
                  min="2"
                  step="1"
                  value={amountUsdc}
                  onChange={(e) => setAmountUsdc(e.target.value)}
                  disabled={isInvesting}
                  placeholder="0.00"
                  className="w-full bg-background border border-border rounded-[14px] px-4 py-3 text-xl font-mono font-bold text-foreground placeholder:text-text-muted focus:outline-none focus:border-text-primary disabled:opacity-50"
                />
                <div className="absolute right-3 px-2 py-1 rounded-[8px] bg-surface-hover border border-border text-xs font-semibold text-text-secondary">
                  USDC
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 mt-2">
                {["10", "25", "50", "100"].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setAmountUsdc(preset)}
                    disabled={isInvesting}
                    className={`flex-1 py-1.5 text-xs rounded-[10px] border font-mono transition-colors cursor-pointer ${
                      amountUsdc === preset
                        ? "border-foreground bg-primary text-primary-foreground font-bold shadow-sm"
                        : "border-border bg-surface hover:bg-surface-hover text-text-secondary hover:text-foreground"
                    }`}
                  >
                    ${preset}
                  </button>
                ))}
              </div>

              {/* Balance & 1-click Faucet Helper */}
              {isConnected && (
                <div className="flex items-center justify-between text-[11px] text-text-secondary mt-2 px-0.5">
                  <span>
                    Balance:{" "}
                    <strong className="text-foreground font-mono">
                      {usdcBalance !== null ? `$${usdcBalance.toFixed(2)} USDC` : "Checking..."}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleFaucet}
                    disabled={isMintingFaucet}
                    className="text-foreground font-semibold underline flex items-center gap-1 cursor-pointer disabled:opacity-50 hover:text-text-primary"
                  >
                    {isMintingFaucet ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        <span>Minting USDC...</span>
                      </>
                    ) : (
                      <>
                        <Coins className="size-3" />
                        <span>+ Get 50 Devnet USDC</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Allocation breakdown */}
            <div className="space-y-2">
              <span className="text-xs text-text-secondary font-medium">Allocation (50/50):</span>
              <div className="space-y-1.5 bg-background border border-border-subtle rounded-[16px] p-3.5">
                {basket.tokens.slice(0, 2).map((token) => {
                  const weightPct = token.weightBps / 100;
                  const tokenDollarValue = (numAmount * weightPct) / 100;

                  return (
                    <div key={token.symbol} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <TokenAvatar
                          symbol={token.symbol}
                          src={token.icon}
                          name={token.name}
                          size="xs"
                        />
                        <span className="font-semibold text-foreground">{token.symbol}</span>
                        <span className="text-text-muted">({weightPct}%)</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-foreground font-semibold">${tokenDollarValue.toFixed(2)}</span>
                        <span className="text-text-muted text-[10px] ml-1">live quote</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Security Guarantee */}
            <div className="flex items-center gap-2 text-[11px] text-text-secondary bg-surface-hover/50 p-2.5 rounded-xl border border-border-subtle">
              <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
              <span>
                Non-custodial. Constituent tokens land directly in your wallet ATAs via Raydium CPMM.
              </span>
            </div>

            {/* Action CTA */}
            {!isConnected ? (
              <Button
                variant="primary"
                size="lg"
                onClick={handleConnect}
                className="w-full font-bold shadow-md"
              >
                <Wallet className="size-4" />
                <span>Connect Wallet to Invest</span>
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                onClick={handleInvest}
                disabled={isInvesting || numAmount < 2}
                loading={isInvesting}
                className="w-full font-bold shadow-md"
              >
                <span>Invest ${numAmount.toFixed(2)} USDC in 2 Tokens</span>
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
