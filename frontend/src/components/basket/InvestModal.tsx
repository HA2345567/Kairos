import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
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
import { Button } from "@/components/arc/button";
import { kairosApi } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-endpoints";
import type { QuoteLeg } from "@/lib/api-types";
import { useWalletAuth } from "@/components/auth/WalletAuthProvider";

interface InvestModalProps {
  basket: Basket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAmount?: string;
  onSuccess?: () => void;
}

const decodeTransaction = (base64: string) =>
  VersionedTransaction.deserialize(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)));

const encodeTransaction = (transaction: VersionedTransaction) => {
  let binary = "";
  for (const byte of transaction.serialize()) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export function InvestModal({ basket, open, onOpenChange, initialAmount, onSuccess }: InvestModalProps) {
  // Solana Wallet Adapter
  const { connected, publicKey, signAllTransactions, signTransaction } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { connection } = useConnection();
  const { ensureAuthenticated } = useWalletAuth();

  const isConnected = connected && !!publicKey;
  const activeAddressStr = publicKey?.toBase58() || null;
  const effectivePublicKey = publicKey;

  const [amountUsdc, setAmountUsdc] = useState<string>(initialAmount || "10");

  useEffect(() => {
    if (open) {
      const requested = Number(initialAmount);
      setAmountUsdc(String(requested >= (basket?.minUsdc ?? 25) ? requested : basket?.minUsdc ?? 25));
    }
  }, [open, initialAmount, basket?.minUsdc]);
  const [isInvesting, setIsInvesting] = useState(false);
  const [step, setStep] = useState<"input" | "quoting" | "signing" | "success">("input");
  const [txSignature, setTxSignature] = useState<string>("");
  const [simError, setSimError] = useState<string | null>(null);
  const [liveQuote, setLiveQuote] = useState<QuoteLeg[] | null>(null);
  const [quoteTotals, setQuoteTotals] = useState<{ platformFeeUsdc: number; netInvestUsdc: number } | null>(null);
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
  // 1-Click Devnet Faucet via real backend /v1/faucet/airdrop
  const handleFaucet = async () => {
    if (!activeAddressStr) {
      toast.error("Please connect your wallet first.");
      return;
    }
    setIsMintingFaucet(true);
    try {
      const res = await kairosApi.post<{ success: boolean; message?: string; amount?: number }>(
        API_ENDPOINTS.FAUCET_AIRDROP,
        { walletAddress: activeAddressStr }
      );
      if (res && res.success !== false) {
        toast.success(`Airdropped ${res.amount || 1000} Devnet USDC to your wallet!`);
        await refreshBalance();
        setSimError(null);
      } else {
        throw new Error(res?.message || "Faucet request failed");
      }
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

    if (numAmount < basket.minUsdc) {
      toast.error(`Minimum investment is $${basket.minUsdc} USDC.`);
      return;
    }

    setSimError(null);
    setIsInvesting(true);
    setLiveQuote(null);
    setQuoteTotals(null);

    try {
      // Step 1: Quote from the backend's configured devnet price source
      setStep("quoting");
      const quoteRes = await kairosApi.getQuote(basket.slug, numAmount);
      const quoteLegs = quoteRes?.quote?.legs;
      if (!quoteLegs?.length) throw new Error("The quote did not include any investable basket legs.");
      setLiveQuote(quoteLegs);
      setQuoteTotals({
        platformFeeUsdc: quoteRes.quote.platformFeeUsdc,
        netInvestUsdc: quoteRes.quote.netInvestUsdc,
      });

      // Step 2: Prepare position with real VersionedTransactions
      setStep("signing");
      await ensureAuthenticated();
      const idempotencyKey = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const prepRes = await kairosApi.preparePosition({
        basket: basket.slug,
        usdc: numAmount,
        walletAddress: effectivePublicKey.toBase58(),
        idempotencyKey,
      });
      const preparedTxs = prepRes?.execution?.preparedTxs ?? [];
      const execId = prepRes?.execution?.id ?? "";
      if (!execId || preparedTxs.length === 0) {
        throw new Error("The server did not prepare executable basket transactions.");
      }

      let sig = "";

      const txObjects = preparedTxs.map(decodeTransaction);
      if (!signAllTransactions && !signTransaction) {
        throw new Error("This wallet cannot return signed transactions for Kairos verification.");
      }
      const signedTxs: VersionedTransaction[] = signAllTransactions
        ? await signAllTransactions(txObjects)
        : await Promise.all(txObjects.map((tx) => signTransaction!(tx)));
      if (signedTxs.length !== txObjects.length) {
        throw new Error("The wallet did not sign every prepared basket leg.");
      }

      await kairosApi.submitPosition({
        executionId: execId,
        signedTxs: signedTxs.map(encodeTransaction),
        idempotencyKey,
      });
      let curExec = await kairosApi.getExecution(execId);
      for (let i = 0; i < 30 && ["SUBMITTED", "LANDING"].includes(curExec.status); i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        curExec = await kairosApi.getExecution(execId);
      }
      if (curExec.status !== "COMPLETED") {
        throw new Error(
          curExec.status === "PARTIALLY_COMPLETED"
            ? `Execution ${execId} completed partially. Resume or unwind it from execution history.`
            : `Execution ${execId} is ${curExec.status.toLowerCase()}. Check execution history before retrying.`
        );
      }
      sig = curExec.legs.find((leg) => leg.txSignature)?.txSignature ?? "";
      if (!sig) throw new Error(`Execution ${execId} completed without a recorded transaction signature.`);

      // Step 5: Persist in local wallet ledger
      try {
        const storageKey = `kairos_invest_${effectivePublicKey.toBase58()}`;
        const prev = JSON.parse(localStorage.getItem(storageKey) || "[]");
        prev.unshift({
          action: "Invest",
          basketId: basket.id,
          basketName: basket.name,
          amountUsdc: numAmount,
          txSignature: sig,
          executionId: execId,
          tokensDescription: quoteLegs
            .map((leg) => `~${Number(leg.expectedOutTokens).toFixed(3)} ${leg.symbol}`)
            .join(" + "),
          timestamp: new Date().toISOString(),
        });
        localStorage.setItem(storageKey, JSON.stringify(prev));
      } catch (e) {}

      setTxSignature(sig);
      setStep("success");
      refreshBalance();
      onSuccess?.();
      toast.success(`Invested $${numAmount.toFixed(2)} USDC into ${basket.name}!`);
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
    setQuoteTotals(null);
    onOpenChange(false);
  };

  const stepLabel =
    step === "quoting"
      ? "Fetching basket quote..."
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
            Review the backend quote, sign the prepared devnet transactions, and receive basket assets in your wallet.
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
                Basket assets were delivered to your wallet after the signed execution completed.
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
              {liveQuote?.map((leg) => (
                <div key={leg.mint} className="flex justify-between items-center text-text-secondary">
                  <span>{leg.symbol} received:</span>
                  <span className="text-foreground font-semibold font-mono">
                    ~{Number(leg.expectedOutTokens).toFixed(4)} {leg.symbol}
                  </span>
                </div>
              ))}
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
                min={basket.minUsdc}
                  step="1"
                  value={amountUsdc}
                  onChange={(e) => {
                    setAmountUsdc(e.target.value);
                    setLiveQuote(null);
                    setQuoteTotals(null);
                  }}
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
                {[...new Set([basket.minUsdc, 50, 100].filter((value) => value >= basket.minUsdc))].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      setAmountUsdc(String(preset));
                      setLiveQuote(null);
                      setQuoteTotals(null);
                    }}
                    disabled={isInvesting}
                    className={`flex-1 py-1.5 text-xs rounded-[10px] border font-mono transition-colors cursor-pointer ${
                      amountUsdc === String(preset)
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

            {/* Backend allocation quote */}
            <div className="space-y-2">
              <span className="text-xs text-text-secondary font-medium">Basket allocation:</span>
              {liveQuote && (
                <p className="text-[10px] text-text-muted">
                  Rate source: {[...new Set(liveQuote.map((leg) => leg.priceSource ?? "unknown"))].join(", ")}. Devnet test values may not track market prices.
                </p>
              )}
              {liveQuote && liveQuote.some((leg) => leg.priceImpactPct === null) && (
                <p className="text-[10px] text-text-muted">Price impact is unavailable for this fixed-rate devnet route.</p>
              )}
              {quoteTotals && (
                <div className="flex justify-between text-[11px] text-text-secondary">
                  <span>Platform fee: ${quoteTotals.platformFeeUsdc.toFixed(2)} USDC</span>
                  <span>Net allocation: ${quoteTotals.netInvestUsdc.toFixed(2)} USDC</span>
                </div>
              )}
              <div className="space-y-1.5 bg-background border border-border-subtle rounded-[16px] p-3.5">
                {basket.tokens.map((token) => {
                  const weightPct = token.weightBps / 100;
                  const quotedLeg = liveQuote?.find((leg) => leg.mint === token.mint);
                  const quotedAmount = quotedLeg?.inUsdcAmount;

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
                        <span className="font-mono text-foreground font-semibold">
                          {quotedAmount === undefined ? "—" : `$${quotedAmount.toFixed(2)}`}
                        </span>
                        <span className="block text-text-muted text-[10px]">
                          {quotedAmount === undefined
                            ? "get quote to preview"
                            : `~${Number(quotedLeg?.expectedOutTokens).toFixed(4)} ${token.symbol} · min ${Number(quotedLeg?.minOutTokens).toFixed(4)} · impact ${quotedLeg?.priceImpactPct ?? "unavailable"}`}
                        </span>
                        {quotedLeg?.priceSource && <span className="block text-text-muted text-[10px]">
                          {quotedLeg.priceSource}
                          {quotedLeg.priceSourceRef ? ` · ${quotedLeg.priceSourceRef.slice(0, 10)}` : ""}
                          {quotedLeg.priceAsOf ? ` · ${new Date(quotedLeg.priceAsOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                        </span>}
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
                Non-custodial. Your wallet signs each leg and receives the basket assets directly.
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
                disabled={isInvesting || numAmount < basket.minUsdc}
                loading={isInvesting}
                className="w-full font-bold shadow-md"
              >
                <span>Invest ${numAmount.toFixed(2)} USDC in {basket.tokens.length} assets</span>
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
