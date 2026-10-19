import type { ComponentType, ReactNode } from "react";

/**
 * PRD §4.2 embedded wallet (OD-1: Privy vs Para behind an interface).
 *
 * Status of this layer, stated plainly:
 *
 *   - The provider is INJECTABLE. A runtime that resolves
 *     `@privy-io/react-auth` (or Para) registers its provider through
 *     `registerEmbeddedWalletRuntime()` and the app wraps itself with it.
 *   - The SDK is NOT imported here. `@privy-io/react-auth` is declared in
 *     `package.json`, but bundling it fails under the current Vite/Rolldown
 *     setup because its transitive `react-aria` subpath imports do not
 *     resolve (`react-aria/dist/exports/private/...`), so importing it would
 *     break every build for wallet-only deployments.
 *   - Consequently the Settings page reports the embedded provider as
 *     "not configured" rather than pretending an email/social login exists,
 *     and `GET /v1/config`-driven flows keep using external wallets only.
 *
 * Delegated signing itself is fully implemented server-side: enabling stores a
 * policy on the wallet, auto-rebalance re-reads the flag at landing time (FR-22),
 * and `POST /v1/wallets/delegated-signing { enabled:false }` revokes it in one
 * click and clears the stored policy (§4.5).
 */

let injectedProvider: { id: string; Component: ComponentType<Record<string, unknown>> } | null = null;

/** Register a provider implementation (Privy/Para) from an app entrypoint. */
export function registerEmbeddedWalletRuntime(
  runtime: { id: string; Component: ComponentType<Record<string, unknown>> } | null,
): void {
  injectedProvider = runtime;
}

export const embeddedWalletConfigured = Boolean(
  (import.meta.env.VITE_PRIVY_APP_ID as string | undefined)?.trim(),
);

export function embeddedWalletProvider(): string | null {
  if (injectedProvider) return injectedProvider.id;
  return embeddedWalletConfigured ? "privy (runtime not registered)" : null;
}

export function EmbeddedWalletProvider({ children }: { children: ReactNode }) {
  if (!injectedProvider) return <>{children}</>;
  const Runtime = injectedProvider.Component;
  return (
    <Runtime appId={(import.meta.env.VITE_PRIVY_APP_ID as string | undefined)?.trim()}>
      {children}
    </Runtime>
  );
}
