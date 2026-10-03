import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { WalletDropdown } from "@/components/wallet/WalletDropdown";

export function ConnectWalletButton({ className }: { className?: string }) {
  const { connected, publicKey, disconnect, select, wallets } = useWallet();
  const { setVisible } = useWalletModal();

  const isConnected = connected && !!publicKey;
  const address = publicKey?.toBase58() || null;

  const handleConnect = async () => {
    try {
      const solana = (window as any)?.phantom?.solana || (window as any)?.solana;
      const isPhantomInstalled = !!solana?.isPhantom;
      const phantom = wallets.find(
        (w) => w.adapter.name.toLowerCase() === "phantom"
      );

      if (phantom) {
        select(phantom.adapter.name);
      } else {
        select("Phantom" as any);
      }

      if (isPhantomInstalled && solana?.connect) {
        try {
          await solana.connect();
          if (phantom?.adapter) {
            await phantom.adapter.connect();
          }
          return;
        } catch (err: any) {
          if (err?.code === 4001 || err?.message?.includes("User rejected")) {
            return;
          }
          console.warn("Direct Phantom connect error:", err);
        }
      }

      if (phantom?.adapter) {
        await phantom.adapter.connect();
        return;
      }
    } catch (err: any) {
      console.warn("Phantom connection error:", err);
    }

    setVisible(true);
  };

  const handleDisconnect = async () => {
    if (connected && disconnect) {
      try {
        await disconnect();
      } catch (err) {
        console.warn("Wallet adapter disconnect error:", err);
      }
    }
  };

  if (!isConnected || !address) {
    return (
      <button
        onClick={handleConnect}
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
      <WalletDropdown address={address} onDisconnect={handleDisconnect} />
    </div>
  );
}
