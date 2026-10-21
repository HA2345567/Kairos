import Wallet from "lucide-react/dist/esm/icons/wallet";
import { cn } from "@/lib/utils";
import { WalletDropdown } from "@/components/wallet/WalletDropdown";
import { useKairosWallet } from "@/components/wallet/useKairosWallet";

export function ConnectWalletButton({ className }: { className?: string }) {
  const { connected, publicKey, connect, disconnect } = useKairosWallet();
  const address = publicKey?.toBase58() || null;
  const isConnected = connected && !!address;

  if (!isConnected || !address) {
    return (
      <button
        onClick={() => void connect()}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl bg-[#c5ff4a] hover:bg-[#b0f020] px-4 py-2 text-sm font-bold text-black transition-all hover:opacity-90 active:scale-95 cursor-pointer shadow-[0_0_12px_rgba(197,255,74,0.25)]",
          className
        )}
      >
        <Wallet className="h-4 w-4" />
        Connect Wallet
      </button>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <WalletDropdown address={address} onDisconnect={() => disconnect()} />
    </div>
  );
}
