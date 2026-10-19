import { AlertTriangle } from "lucide-react";
import { useClusterCheck } from "@/hooks/useAppConfig";

/**
 * PRD §4.5 wrong-network prompt.
 *
 * Signing a transaction on the wrong cluster fails in a way that looks like a
 * generic wallet error, so the mismatch is surfaced before the user invests.
 * Nothing renders when the endpoint is unknown or matches.
 */
export function ClusterBanner() {
  const { mismatched, expected, actual, endpoint } = useClusterCheck();
  if (!mismatched) return null;

  const fix = expected === "devnet"
    ? "Switch your wallet's network to Devnet."
    : "Switch your wallet's network to Mainnet Beta.";

  return (
    <div
      role="alert"
      className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-center text-[11px] font-mono text-destructive-foreground sm:text-xs"
    >
      <AlertTriangle className="mr-2 inline size-3.5 align-text-bottom" />
      <strong className="mr-2 tracking-wide">WRONG NETWORK</strong>
      <span>
        Kairos is running on {expected}, but your wallet is pointed at {actual}
        {endpoint ? ` (${endpoint})` : ""}. {fix} Trading is disabled until the clusters match.
      </span>
    </div>
  );
}
