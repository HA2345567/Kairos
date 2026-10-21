import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Basket } from "@/lib/baskets-data";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import Wallet from "lucide-react/dist/esm/icons/wallet";
import Coins from "lucide-react/dist/esm/icons/coins";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import ArrowUpRight from "lucide-react/dist/esm/icons/arrow-up-right";
import { toast } from "sonner";
import { Button } from "@/components/arc/button";
import { kairosApi } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-endpoints";
import type { QuoteLeg } from "@/lib/api-types";
import { useWalletAuth } from "@/components/auth/WalletAuthProvider";
import { useKairosWallet } from "@/components/wallet/useKairosWallet";

interface InvestModalProps {
  basket: Basket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAmount?: string;
  onSuccess?: (signature: string) => void;
  onBusyChange?: (busy: boolean) => void;
  onAttestationRequired?: () => void;
  onRegisterInvest?: (startInvest: ((amount: string) => void) | null) => void;
}

const decodeTransaction = (base64: string) =>
  VersionedTransaction.deserialize(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)));

const encodeTransaction = (transaction: VersionedTransaction) => {
  let binary = "";
  for (const byte of transaction.serialize()) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export function InvestModal({
  basket,
  open,
  onOpenChange,
  initialAmount,
  onSuccess,
  onBusyChange,
  onAttestationRequired,
  onRegisterInvest,
}: InvestModalProps) {
  // Solana Wallet Adapter
  const { connected, publicKey, signAllTransactions, signTransaction, connection, connect } = useKairosWallet();
  const queryClient = useQueryClient();
  const { ensureAuthenticated } = useWalletAuth();
  const [attestationRequired, setAttestationRequired] = useState(false);
  const [attesting, setAttesting] = useState(false);

  const isConnected = connected && !!publicKey;
  const activeAddressStr = publicKey?.toBase58() || null;
  const effectivePublicKey = publicKey;

  const [amountSol, setAmountSol] = useState<string>("0.25");

  useEffect(() => {
    if (open) {
      setAmountSol(initialAmount || "0.25");
    }
  }, [open, initialAmount, basket?.slug]);
  const [isInvesting, setIsInvesting] = useState(false);
  const investRequestInFlight = useRef(false);
  const [step, setStep] = useState<"input" | "preparing" | "signing" | "confirming" | "success">("input");
  const [executionProgress, setExecutionProgress] = useState<{ confirmed: number; total: number } | null>(null);
  const [txSignature, setTxSignature] = useState<string>("");
  const [liveQuote, setLiveQuote] = useState<QuoteLeg[] | null>(null);
  const [quoteTotals, setQuoteTotals] = useState<{ platformFeeUsdc: number; netInvestUsdc: number } | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceUnavailable, setBalanceUnavailable] = useState(false);
  const [isMintingFaucet, setIsMintingFaucet] = useState(false);
  const [faucetTxSignature, setFaucetTxSignature] = useState("");
  const [solPriceUsd, setSolPriceUsd] = useState<number | null>(null);

  const numAmount = parseFloat(amountSol) || 0;

  // Read native SOL balance from the active Devnet RPC connection.
  const refreshBalance = useCallback(async () => {
    if (!effectivePublicKey) {
      setSolBalance(null);
      setBalanceUnavailable(false);
      return;
    }
    setBalanceLoading(true);
    setBalanceUnavailable(false);
    try {
      const lamports = await connection.getBalance(effectivePublicKey, "confirmed");
      setSolBalance(lamports / 1_000_000_000);
    } catch {
      setSolBalance(null);
      setBalanceUnavailable(true);
    } finally {
      setBalanceLoading(false);
    }
  }, [connection, effectivePublicKey]);

  useEffect(() => {
    if (open && effectivePublicKey) {
      refreshBalance();
    }
  }, [open, effectivePublicKey, refreshBalance]);

  // Connect helper — open standard Wallet Adapter modal
  const handleConnect = () => {
    void connect();
  };

  // 1-Click native Devnet SOL airdrop via the configured backend RPC (Helius primary).
  const handleFaucet = async () => {
    if (!activeAddressStr) {
      toast.error("Please connect your wallet first.");
      return;
    }
    setIsMintingFaucet(true);
    try {
      await ensureAuthenticated();
      const res = await kairosApi.post<{ success: boolean; message?: string; amount?: number; txSignature?: string | null }>(
        API_ENDPOINTS.FAUCET_SOL_AIRDROP,
        { walletAddress: activeAddressStr }
      );
      if (res && res.success !== false) {
        setFaucetTxSignature(res.txSignature ?? "");
        toast.success(`Added ${res.amount ?? 1} Devnet SOL to your wallet.`);
        await refreshBalance();
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

  const handleInvest = async (amountOverride?: string) => {
    if (!basket) return;
    if (!isConnected || !effectivePublicKey) {
      handleConnect();
      return;
    }

    const amountToInvest = Number(amountOverride ?? amountSol) || 0;
    if (amountToInvest <= 0) {
      toast.error("Enter a positive SOL amount.");
      return;
    }
    if (investRequestInFlight.current) return;

    investRequestInFlight.current = true;
    setAmountSol(String(amountToInvest));
    setIsInvesting(true);
    onBusyChange?.(true);
    setLiveQuote(null);
    setQuoteTotals(null);
    setExecutionProgress(null);

    try {
      // §13.1 age gate: the backend refuses prepare with ELIGIBILITY_REQUIRED,
      // so surface the attestation before any transaction is built.
      await ensureAuthenticated();
      setStep("preparing");
      const eligibility = await kairosApi.getEligibility();
      if (!eligibility.eligibility.eligible) {
        setIsInvesting(false);
        setStep("input");
        if (eligibility.eligibility.reason === "ELIGIBILITY_REQUIRED") {
          setAttestationRequired(true);
          onAttestationRequired?.();
          return;
        }
        throw new Error(
          eligibility.eligibility.reason === "REGION_BLOCKED"
            ? "Trading is not available in your region."
            : "This account is not eligible to trade.",
        );
      }

      // Prepare already computes and validates the authoritative quote. Avoid
      // a separate /quotes request that repeated every per-asset price lookup.
      const idempotencyKey = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const prepRes = await kairosApi.preparePosition({
        basket: basket.slug,
        solAmount: amountToInvest,
        walletAddress: effectivePublicKey.toBase58(),
        idempotencyKey,
      });
      const preparedTxs = prepRes?.execution?.preparedTxs ?? [];
      const execId = prepRes?.execution?.id ?? "";
      const executionLegs = prepRes?.execution?.legs ?? [];
      if (!execId || preparedTxs.length === 0 || executionLegs.length !== preparedTxs.length) {
        throw new Error("The server did not prepare executable basket transactions.");
      }
      const preparedQuoteLegs: QuoteLeg[] = executionLegs.map((leg) => {
        const token = basket.tokens.find((item) => item.mint === leg.mint);
        const decimals = token?.decimals ?? 6;
        return {
          mint: leg.mint,
          symbol: leg.symbol,
          weightBps: token?.weightBps ?? 0,
          inUsdcAmount: leg.inAmountUsdc,
          expectedOutTokens: (Number(leg.expectedOut) / 10 ** decimals).toFixed(Math.min(decimals, 6)),
          minOutTokens: "",
          priceImpactPct: null,
          routeHint: "Kairos Router",
        };
      });
      setLiveQuote(preparedQuoteLegs);
      setSolPriceUsd(prepRes.execution.solPriceUsd ?? null);
      setQuoteTotals({
        platformFeeUsdc: prepRes.execution.feeUsdc,
        netInvestUsdc: prepRes.execution.totalUsdc - prepRes.execution.feeUsdc,
      });
      setExecutionProgress({ confirmed: 0, total: preparedTxs.length });

      let sig = "";

      const txObjects = preparedTxs.map(decodeTransaction);
      setStep("signing");
      // Each basket leg is a separate Solana transaction, but request all
      // signatures in one wallet batch so the user approves the basket once
      // instead of confirming the same flow once per asset.
      if (!signAllTransactions) {
        if (txObjects.length !== 1 || !signTransaction) {
          throw new Error("This wallet does not support batch signing required for multi-asset baskets. Connect Phantom and try again.");
        }
      }
      const signedTxs: VersionedTransaction[] = signAllTransactions
        ? await signAllTransactions(txObjects)
        : [await signTransaction!(txObjects[0])];
      if (signedTxs.length !== txObjects.length) {
        throw new Error("The wallet did not sign every prepared basket leg.");
      }

      await kairosApi.submitPosition({
        executionId: execId,
        signedTxs: signedTxs.map(encodeTransaction),
        idempotencyKey,
      });
      setStep("confirming");
      void queryClient.invalidateQueries({ queryKey: ["executions", activeAddressStr] });
      void queryClient.invalidateQueries({ queryKey: ["positions", activeAddressStr] });
      const confirmationDeadline = Date.now() + 30_000;
      let status: Awaited<ReturnType<typeof kairosApi.getExecutionStatus>> | null = null;
      let pollDelayMs = 350;
      while (Date.now() < confirmationDeadline) {
        try {
          status = await kairosApi.getExecutionStatus(execId);
          setExecutionProgress({
            confirmed: status.legs.filter((leg) => leg.status === "CONFIRMED").length,
            total: status.legs.length,
          });
          if (status.terminal) break;
        } catch (pollError) {
          // A brief status API hiccup must not turn a submitted transaction
          // into a failed-looking UI state; keep polling within the deadline.
          console.warn("Execution status check failed; retrying:", pollError);
        }
        await new Promise((resolve) => setTimeout(resolve, pollDelayMs));
        pollDelayMs = Math.min(Math.round(pollDelayMs * 1.5), 1_200);
      }
      if (!status) {
        throw new Error(`Execution ${execId} was submitted, but status is temporarily unavailable. Check execution history before retrying.`);
      }
      if (!status.terminal || status.status !== "COMPLETED") {
        void queryClient.invalidateQueries({ queryKey: ["executions", activeAddressStr] });
        void queryClient.invalidateQueries({ queryKey: ["positions", activeAddressStr] });
        const allLegsExpired = status.legs.length > 0 && status.legs.every(
          leg => leg.status === "FAILED" && leg.error === "BLOCKHASH_EXPIRED"
        );
        if (allLegsExpired) {
          throw new Error(
            `Execution ${execId} expired before Devnet accepted the transactions. No SOL was spent. Reopen Invest to prepare and sign a fresh batch.`
          );
        }
        throw new Error(
          status.status === "PARTIALLY_COMPLETED"
            ? `Execution ${execId} completed partially. Resume or unwind it from execution history.`
            : `Execution ${execId} is ${status.status.toLowerCase()}. Check execution history before retrying.`
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["executions", activeAddressStr] });
      void queryClient.invalidateQueries({ queryKey: ["positions", activeAddressStr] });
      // Fetch the full record once, after terminal confirmation, for the
      // transaction signature shown in the success view.
      const curExec = await kairosApi.getExecution(execId);
      sig = curExec.legs.find((leg) => leg.txSignature)?.txSignature ?? "";
      if (!sig) throw new Error(`Execution ${execId} completed without a recorded transaction signature.`);

      // Step 5: nothing is persisted locally. The execution is already durable
      // server-side (outbox + execution rows), and a browser-side ledger was the
      // only reason the UI could disagree with the backend about a position.

      setTxSignature(sig);
      setStep("success");
      refreshBalance();
      onSuccess?.(sig);
      toast.success(`Invested ${amountToInvest.toFixed(4)} SOL into ${basket.name}!`);
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || "Failed to execute investment.";
      toast.error(msg);
      setStep("input");
    } finally {
      investRequestInFlight.current = false;
      setIsInvesting(false);
      onBusyChange?.(false);
    }
  };

  useLayoutEffect(() => {
    if (!onRegisterInvest) return;
    onRegisterInvest((amount) => void handleInvest(amount));
    return () => onRegisterInvest(null);
  }, [onRegisterInvest, handleInvest]);

  if (!basket) return null;

  const handleReset = () => {
    setStep("input");
    setTxSignature("");
    setLiveQuote(null);
    setQuoteTotals(null);
    setExecutionProgress(null);
    onOpenChange(false);
  };

  const stepLabel =
    step === "preparing"
      ? "Preparing basket transactions..."
      : step === "signing"
      ? `Waiting for wallet signatures (${liveQuote?.length ?? basket.tokens.length} asset transactions)...`
      : "Confirming every Devnet transaction...";

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
        {quoteTotals && solPriceUsd && (
          <div className="mt-2 flex items-center justify-between rounded-xl border border-border-subtle bg-surface-hover/60 px-3.5 py-3 text-xs">
            <span className="text-text-secondary">Platform fee</span>
            <strong className="font-mono font-semibold text-foreground">
              {(quoteTotals.platformFeeUsdc / solPriceUsd).toFixed(6)} SOL
            </strong>
          </div>
        )}
        </DialogHeader>

        {isInvesting && step !== "success" && (
          <div role="status" aria-live="polite" className="rounded-xl border border-border-subtle bg-surface-hover/60 px-3.5 py-3 text-xs text-text-secondary space-y-1">
            <p className="font-semibold text-foreground">{stepLabel}</p>
            {step === "signing" && (
              <p>
                Kairos sends the complete transaction batch to your wallet. Phantom may show a separate review for each asset leg; Devnet test tokens can appear as “Unknown” because they have no wallet metadata.
              </p>
            )}
            {step === "confirming" && executionProgress && (
              <p>
                Confirmed {executionProgress.confirmed} of {executionProgress.total} Devnet transactions. Your batch is processing in the background.
              </p>
            )}
          </div>
        )}

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
                <span>Invested:</span>
                <span className="text-foreground font-semibold font-mono">
                  {numAmount.toFixed(4)} SOL{solPriceUsd ? ` (≈$${(numAmount * solPriceUsd).toFixed(2)})` : ""}
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
            {/* Amount input */}
            <div>
              <div className="flex justify-between items-center text-xs text-text-secondary mb-1.5 font-medium">
                <span>Amount to invest</span>
                <span className="text-text-muted">Currency: SOL (Devnet)</span>
              </div>
              <div className="relative flex items-center">
                <input
                  type="number"
                  min="0.0001"
                  step="0.01"
                  value={amountSol}
                  onChange={(e) => {
                    setAmountSol(e.target.value);
                    setLiveQuote(null);
                    setQuoteTotals(null);
                  }}
                  disabled={isInvesting}
                  placeholder="0.00"
                  className="w-full bg-background border border-border rounded-[14px] px-4 py-3 text-xl font-mono font-bold text-foreground placeholder:text-text-muted focus:outline-none focus:border-text-primary disabled:opacity-50"
                />
                <div className="absolute right-3 px-2 py-1 rounded-[8px] bg-surface-hover border border-border text-xs font-semibold text-text-secondary">
                  SOL
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 mt-2">
                {[0.25, 0.5, 1].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      setAmountSol(String(preset));
                      setLiveQuote(null);
                      setQuoteTotals(null);
                    }}
                    disabled={isInvesting}
                    className={`flex-1 py-1.5 text-xs rounded-[10px] border font-mono transition-colors cursor-pointer ${
                      amountSol === String(preset)
                        ? "border-foreground bg-primary text-primary-foreground font-bold shadow-sm"
                        : "border-border bg-surface hover:bg-surface-hover text-text-secondary hover:text-foreground"
                    }`}
                  >
                    {preset} SOL
                  </button>
                ))}
              </div>

              {/* Balance & 1-click Faucet Helper */}
              {isConnected && (
                <div className="mt-2 px-0.5">
                  <div className="flex items-center justify-between text-[11px] text-text-secondary">
                    <span>
                      SOL balance:{" "}
                      <strong className="text-foreground font-mono">
                        {solBalance !== null
                          ? `${solBalance.toFixed(4)} SOL`
                          : balanceLoading
                            ? "Checking..."
                            : balanceUnavailable
                              ? "Unavailable"
                              : "Waiting for config..."}
                      </strong>
                    </span>
                    {(solBalance === null || solBalance < numAmount + 0.02) && <button
                      type="button"
                      onClick={handleFaucet}
                      disabled={isMintingFaucet}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-foreground font-semibold cursor-pointer transition-colors hover:bg-surface-hover disabled:opacity-50"
                    >
                      {isMintingFaucet ? (
                        <>
                          <Loader2 className="size-3 animate-spin" />
                          <span>Requesting SOL...</span>
                        </>
                      ) : (
                        <>
                          <Coins className="size-3" />
                          <span>Get 1 Devnet SOL</span>
                        </>
                      )}
                    </button>}
                  </div>
                  {faucetTxSignature && (
                    <a
                      href={`https://explorer.solana.com/tx/${faucetTxSignature}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-text-secondary underline-offset-2 hover:text-foreground hover:underline"
                    >
                      View confirmed faucet transaction on Solana Devnet
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* §13.1 age gate — the user must attest before the first invest. */}
            {attestationRequired && (
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 space-y-2 text-xs text-amber-200"
              >
                <p className="font-semibold">This devnet build still requires an eligibility attestation.</p>
                <p className="leading-relaxed">
                  Confirm you are 18 or older and accept that devnet assets have no monetary value. Kairos stays
                  non-custodial throughout.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  loading={attesting}
                  onClick={async () => {
                    setAttesting(true);
                    try {
                      await kairosApi.confirmEligibility(true);
                      setAttestationRequired(false);
                      toast.success("Eligibility confirmed.");
                      await handleInvest(initialAmount);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not confirm eligibility.");
                    } finally {
                      setAttesting(false);
                    }
                  }}
                >
                  I am 18+ and accept
                </Button>
              </div>
            )}

            {/* Security Guarantee */}
            <div className="flex items-center gap-2 text-[11px] text-text-secondary bg-surface-hover/50 p-2.5 rounded-xl border border-border-subtle">
              <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
              <span>
                Your Phantom wallet signs each Devnet leg. SOL is sent to the basket treasury for fixed-rate test-asset delivery; this is not a Jupiter market swap.
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
                onClick={() => void handleInvest()}
                disabled={isInvesting || numAmount <= 0}
                loading={isInvesting}
                className="w-full font-bold shadow-md"
              >
                <span>Invest {numAmount.toFixed(4)} SOL in {basket.tokens.length} assets</span>
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
