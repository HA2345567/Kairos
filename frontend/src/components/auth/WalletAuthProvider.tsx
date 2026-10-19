import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { kairosApi } from "@/lib/api-client";
import { encodeBase58 } from "@/lib/base58";

interface WalletAuthContextValue {
  authenticated: boolean;
  authenticating: boolean;
  error: string | null;
  ensureAuthenticated: () => Promise<void>;
  logout: () => Promise<void>;
}

const WalletAuthContext = createContext<WalletAuthContextValue | null>(null);

function loginMessage(address: string, nonce: string): string {
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const domain = typeof window === "undefined" ? "localhost" : window.location.host;
  // Keep this as plain UTF-8 SIWS text: wallet adapters display/sign the bytes
  // directly, and HTML entities or page markup must never enter the payload.
  return [
    `${domain} wants you to sign in with your Solana account:`,
    address,
    "",
    "Sign in to Kairos.",
    "",
    `URI: ${origin}`,
    "Version: 1",
    "Chain ID: solana:devnet",
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");
}

export function WalletAuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage } = useWallet();
  const [authenticated, setAuthenticated] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingLogin = useRef<Promise<void> | null>(null);
  const autoAuthAttemptedFor = useRef<string | null>(null);
  const address = publicKey?.toBase58() ?? null;

  useEffect(() => {
    autoAuthAttemptedFor.current = null;
  }, [address]);

  useEffect(() => {
    if (!address) {
      kairosApi.clearAuth();
      setAuthenticated(false);
      setError(null);
      return;
    }
    setError(null);
    const hasAddressSession = kairosApi.isAuthenticatedFor(address);
    // Never let a prior wallet's authenticated state unlock the new wallet's
    // protected queries while its cookie session is being checked.
    setAuthenticated(hasAddressSession);
    if (hasAddressSession) return;
    // FE-03: a cookie session survives reloads and tab closes; probe it before
    // asking the wallet to sign a fresh message.
    let cancelled = false;
    void (async () => {
      try {
        const session = await kairosApi.getSession();
        if (!cancelled && session.walletAddress === address) {
          kairosApi.setSessionWallet(address);
          setAuthenticated(true);
          return;
        }
      } catch {
        /* no cookie session; fall through to signed-out */
      }
      if (!cancelled) setAuthenticated(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const ensureAuthenticated = useCallback(async () => {
    if (!address || !publicKey) throw new Error("Connect a wallet before signing in to Kairos.");
    if (kairosApi.isAuthenticatedFor(address)) {
      setAuthenticated(true);
      return;
    }
    try {
      const session = await kairosApi.getSession();
      if (session.walletAddress === address) {
        kairosApi.setSessionWallet(address);
        setAuthenticated(true);
        return;
      }
    } catch {
      /* fall through to refresh/sign */
    }
    if (await kairosApi.refreshAuth() && kairosApi.isAuthenticatedFor(address)) {
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

  // Connecting a wallet in the shared header is the app-wide sign-in intent.
  // Reuse the cookie session when present; otherwise request one SIWS signature
  // here instead of leaving protected pages waiting for a page-specific login.
  useEffect(() => {
    if (!address || !publicKey || authenticated || authenticating || pendingLogin.current) return;
    if (autoAuthAttemptedFor.current === address) return;
    autoAuthAttemptedFor.current = address;
    void ensureAuthenticated().catch(() => {
      // The error is rendered by pages that need the protected session and can
      // offer an explicit retry after a rejected or unavailable wallet prompt.
    });
  }, [address, publicKey, authenticated, authenticating, ensureAuthenticated]);

  const logout = useCallback(async () => {
    // Revoke server-side first (PRD §4.5 one-click revoke); local state clears
    // even if the network call fails, because a stale local token is useless.
    try {
      await kairosApi.logout();
    } catch {
      kairosApi.clearAuth();
    }
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
