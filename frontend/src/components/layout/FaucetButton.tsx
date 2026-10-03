import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Droplet, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function FaucetButton({ className }: { className?: string }) {
  const { publicKey, connected } = useWallet();
  const [loading, setLoading] = useState(false);

  const handleFaucet = async () => {
    if (!connected || !publicKey) {
      toast.error("Please connect your wallet first", { id: "faucet" });
      return;
    }

    try {
      setLoading(true);
      toast.loading("Requesting institutional test capital...", { id: "faucet" });
      
      const res = await api.requestFaucet(publicKey.toBase58());
      
      toast.success("Received 1,000 Test USDC!", { id: "faucet" });
    } catch (err: any) {
      toast.error(`Faucet failed: ${err.message}`, { id: "faucet" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleFaucet}
      disabled={loading || !connected}
      className={cn(
        "flex items-center gap-2 rounded-md border border-border/60 bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground hover:bg-surface-elevated disabled:opacity-40",
        className
      )}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Droplet className="h-3 w-3 text-[#00FFBD]" />
      )}
      Faucet
    </button>
  );
}
