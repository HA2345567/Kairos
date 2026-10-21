import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { WalletAdapter } from "@solana/wallet-adapter-base";
import { WalletAuthProvider } from "@/components/auth/WalletAuthProvider";
import { EmbeddedWalletProvider } from "./EmbeddedWallet";

export const WalletBootstrapContext = createContext<() => Promise<void>>(async () => {});

export function SolanaProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<WalletAdapter[]>([]);
  const walletLoadPromise = useRef<Promise<void> | null>(null);
  const endpoint = useMemo(() => {
    const envUrl = import.meta.env.VITE_SOLANA_RPC_URL;
    if (envUrl && envUrl.trim() !== "") return envUrl;
    return "https://api.devnet.solana.com";
  }, []);

  // PRD §4.2: Phantom, Solflare and Backpack adapters are always registered;
  // an embedded wallet layer is added only when it is configured.
  const ensureWalletAdapters = useCallback(() => {
    if (wallets.length > 0) return Promise.resolve();
    if (walletLoadPromise.current) return walletLoadPromise.current;

    walletLoadPromise.current = Promise.all([
      import("@solana/wallet-adapter-phantom"),
      import("@solana/wallet-adapter-solflare"),
      import("@solana/wallet-adapter-backpack"),
    ]).then(([phantom, solflare, backpack]) => {
      setWallets([
        new phantom.PhantomWalletAdapter(),
        new solflare.SolflareWalletAdapter(),
        new backpack.BackpackWalletAdapter(),
      ]);
    }).catch((error) => {
      walletLoadPromise.current = null;
      throw error;
    });

    return walletLoadPromise.current;
  }, [wallets.length]);

  useEffect(() => {
    // Preserve Wallet Adapter's existing reconnect behavior for returning users,
    // while keeping wallet libraries off the initial bundle for new visitors.
    if (window.localStorage.getItem("walletName")) {
      void ensureWalletAdapters().catch((error) => {
        console.error("Could not restore wallet adapters:", error);
      });
    }
  }, [ensureWalletAdapters]);

  return (
    <WalletBootstrapContext.Provider value={ensureWalletAdapters}>
      <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
        <WalletProvider
          wallets={wallets}
          autoConnect={wallets.length > 0}
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
    </WalletBootstrapContext.Provider>
  );
}
