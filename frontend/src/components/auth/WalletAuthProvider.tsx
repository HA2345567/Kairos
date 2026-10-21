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
  const pendingLogin = useRef<{ address: string; promise: Promise<void> } | null>(null);
  const autoAuthAttemptedFor = useRef<string | null>(null);
  const currentAddress = useRef<string | null>(null);
  const address = publicKey?.toBase58() ?? null;
  currentAddress.current = address;

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
    const currentLogin = pendingLogin.current;
    if (currentLogin) {
      if (currentLogin.address === address) return currentLogin.promise;
      await currentLogin.promise.catch(() => undefined);
      if (currentAddress.current !== address) throw new Error("The connected wallet changed. Retry the action with the active wallet.");
      return ensureAuthenticated();
    }

    const loginAddress = address;
    const loginPublicKey = publicKey;
    const loginSigner = signMessage;
    // Assign the in-flight promise before any await. The header, positions
    // page, and invest modal can all request the same session at once; they
    // must share one cookie probe and at most one wallet message signature.
    const pending = Promise.resolve().then(async () => {
      setAuthenticating(true);
      setError(null);
      try {
        try {
          const session = await kairosApi.getSession();
          if (session.walletAddress === loginAddress) {
            kairosApi.setSessionWallet(loginAddress);
            setAuthenticated(true);
            return;
          }
        } catch {
          /* no cookie session; fall through to refresh/sign */
        }
        if (currentAddress.current !== loginAddress) throw new Error("The connected wallet changed. Retry the action with the active wallet.");
        if (await kairosApi.refreshAuth() && kairosApi.isAuthenticatedFor(loginAddress)) {
          setAuthenticated(true);
          return;
        }
        if (!loginSigner) throw new Error("This wallet does not support message signing.");
        const { nonce } = await kairosApi.getNonce(loginAddress);
        const message = loginMessage(loginAddress, nonce);
        const signature = await loginSigner(new TextEncoder().encode(message));
        if (currentAddress.current !== loginAddress || loginPublicKey.toBase58() !== loginAddress) {
          throw new Error("The connected wallet changed before sign-in finished. Retry with the active wallet.");
        }
        const result = await kairosApi.verify(loginAddress, encodeBase58(signature), message);
        kairosApi.setAuth(result.token, result.refreshToken, loginAddress);
        setAuthenticated(true);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Wallet sign-in failed.";
        setError(message);
        if (kairosApi.getSessionWallet() === loginAddress) kairosApi.clearAuth();
        setAuthenticated(false);
        throw cause instanceof Error ? cause : new Error(message);
      } finally {
        setAuthenticating(false);
      }
    });
    const login = { address: loginAddress, promise: pending };
    pendingLogin.current = login;
    pending.then(
      () => { if (pendingLogin.current === login) pendingLogin.current = null; },
      () => { if (pendingLogin.current === login) pendingLogin.current = null; },
    );
    return pending;
  }, [address, publicKey, signMessage]);

  // Connecting a wallet in the shared header is the app-wide sign-in intent.
  // Reuse the cookie session when present; otherwise request one SIWS signature
  // here instead of leaving protected pages waiting for a page-specific login.
  useEffect(() => {
    if (!address || !publicKey || authenticated || authenticating || pendingLogin.current?.address === address) return;
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
