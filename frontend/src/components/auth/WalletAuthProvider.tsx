import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { kairosApi } from "@/lib/api-client";
import { encodeBase58 } from "@/lib/base58";

interface WalletAuthContextValue {
  authenticated: boolean;
  authenticating: boolean;
  error: string | null;
  ensureAuthenticated: () => Promise<void>;
  logout: () => void;
}

const WalletAuthContext = createContext<WalletAuthContextValue | null>(null);

function loginMessage(address: string, nonce: string): string {
  const domain = typeof window === "undefined" ? "localhost" : window.location.host;
  return `${domain} wants you to sign in with your Solana account:\n${address}\n\nSign in to Kairos.\n\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;
}

export function WalletAuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage } = useWallet();
  const [authenticated, setAuthenticated] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingLogin = useRef<Promise<void> | null>(null);
  const address = publicKey?.toBase58() ?? null;

  useEffect(() => {
    if (!address) {
      kairosApi.clearAuth();
      setAuthenticated(false);
      setError(null);
      return;
    }
    setAuthenticated(kairosApi.isAuthenticatedFor(address));
    setError(null);
  }, [address]);

  const ensureAuthenticated = useCallback(async () => {
    if (!address || !publicKey) throw new Error("Connect a wallet before signing in to Kairos.");
    if (kairosApi.isAuthenticatedFor(address)) {
      setAuthenticated(true);
      return;
    }
    if (!signMessage) throw new Error("This wallet does not support message signing.");
    if (pendingLogin.current) return pendingLogin.current;

    const pending = (async () => {
      setAuthenticating(true);
      setError(null);
      try {
        const { nonce } = await kairosApi.getNonce(address);
        const message = loginMessage(address, nonce);
        const signature = await signMessage(new TextEncoder().encode(message));
        const result = await kairosApi.verify(address, encodeBase58(signature), message);
        kairosApi.setAuth(result.token, result.refreshToken, address);
        setAuthenticated(true);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Wallet sign-in failed.";
        setError(message);
        kairosApi.clearAuth();
        setAuthenticated(false);
        throw cause instanceof Error ? cause : new Error(message);
      } finally {
        setAuthenticating(false);
      }
    })();
    pendingLogin.current = pending;
    pending.then(
      () => { pendingLogin.current = null; },
      () => { pendingLogin.current = null; },
    );
    return pending;
  }, [address, publicKey, signMessage]);

  const logout = useCallback(() => {
    kairosApi.clearAuth();
    setAuthenticated(false);
    setError(null);
  }, []);

  return (
    <WalletAuthContext.Provider value={{ authenticated, authenticating, error, ensureAuthenticated, logout }}>
      {children}
    </WalletAuthContext.Provider>
  );
}

export function useWalletAuth(): WalletAuthContextValue {
  const value = useContext(WalletAuthContext);
  if (!value) throw new Error("useWalletAuth must be used inside WalletAuthProvider");
  return value;
}
