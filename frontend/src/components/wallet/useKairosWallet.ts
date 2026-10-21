import { useContext } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { WalletBootstrapContext } from "./SolanaProvider";

export function useKairosWallet() {
  const {
    connected,
    publicKey,
    disconnect,
    sendTransaction,
    signMessage,
    signTransaction,
    signAllTransactions,
    wallet,
  } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const ensureWalletAdapters = useContext(WalletBootstrapContext);

  const connect = async () => {
    // One connection path for every page: Wallet Adapter owns the adapter
    // lifecycle, so do not call window.phantom.connect() or adapter.connect()
    // alongside it (that can open a second wallet prompt).
    try {
      await ensureWalletAdapters();
      setVisible(true);
    } catch (error) {
      console.error("Could not load wallet adapters:", error);
    }
  };

  const address = publicKey?.toBase58() || null;
  const displayAddress = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : null;

  return {
    connected: connected && !!publicKey,
    publicKey,
    address,
    displayAddress,
    connection,
    connect,
    disconnect,
    sendTransaction,
    signMessage,
    signTransaction,
    signAllTransactions,
    wallet,
  };
}
