import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import { WalletAuthProvider } from "@/components/auth/WalletAuthProvider";
import { EmbeddedWalletProvider } from "./EmbeddedWallet";

export function SolanaProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => {
    const envUrl = import.meta.env.VITE_SOLANA_RPC_URL;
    if (envUrl && envUrl.trim() !== "") return envUrl;
    return "https://api.devnet.solana.com";
  }, []);

  // PRD §4.2: Phantom, Solflare and Backpack adapters are always registered;
  // an embedded wallet layer is added only when it is configured.
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
    ],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <WalletProvider
        wallets={wallets}
        autoConnect
        onError={(error) => {
          console.warn("Solana Wallet Adapter warning:", error.message || error);
        }}
      >
        <EmbeddedWalletProvider>
          <WalletModalProvider>
            <WalletAuthProvider>{children}</WalletAuthProvider>
          </WalletModalProvider>
        </EmbeddedWalletProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
