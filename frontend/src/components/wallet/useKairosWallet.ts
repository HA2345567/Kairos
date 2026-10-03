import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export function useKairosWallet() {
  const { connected, publicKey, disconnect, select, wallets, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();

  const connect = async () => {
    const phantom = wallets.find((w) => w.adapter.name === "Phantom");
    if (phantom && phantom.readyState === "Installed") {
      try {
        select(phantom.adapter.name);
        await phantom.adapter.connect();
        return;
      } catch (err) {
        console.warn("Direct Phantom connect error:", err);
      }
    }
    setVisible(true);
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
  };
}
