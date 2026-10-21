import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Check from "lucide-react/dist/esm/icons/check";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import LogOut from "lucide-react/dist/esm/icons/log-out";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Wallet from "lucide-react/dist/esm/icons/wallet";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/PageShell";
import { useWalletAuth } from "@/components/auth/WalletAuthProvider";
import { kairosApi } from "@/lib/api-client";
import { useKairosWallet } from "@/components/wallet/useKairosWallet";
import type { NotificationPreferences } from "@/lib/api-types";

type PreferenceKey = keyof Omit<NotificationPreferences, "walletAddress" | "updatedAt">;

const PREFERENCE_GROUPS: Array<{ title: string; description: string; key: PreferenceKey }> = [
  { title: "In-app notifications", description: "Show execution updates inside Kairos.", key: "inApp" },
  { title: "Email notifications", description: "Email delivery is saved as a preference; an email sender is not configured yet.", key: "email" },
  { title: "Push notifications", description: "Push delivery is saved as a preference; a push provider is not configured yet.", key: "push" },
  { title: "Investment updates", description: "Notify when an investment or recovery execution changes state.", key: "executionUpdates" },
  { title: "Rebalance updates", description: "Notify when a rebalance is prepared or completed.", key: "rebalanceUpdates" },
  { title: "Basket version updates", description: "Notify when a basket you hold publishes a new version.", key: "versionPublish" },
];

function SettingSwitch({ checked, disabled, label, onChange }: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "border-foreground bg-foreground" : "border-border bg-surface-elevated"}`}
    >
      <span className={`absolute top-0.5 size-4 rounded-full transition-transform ${checked ? "translate-x-[1.3rem] bg-background" : "translate-x-0.5 bg-muted-foreground"}`} />
    </button>
  );
}

export default function SettingsPage() {
  const wallet = useWallet();
  const { connect } = useKairosWallet();
  const { authenticated, authenticating, ensureAuthenticated, logout, error: authError } = useWalletAuth();
  const queryClient = useQueryClient();
  const address = wallet.publicKey?.toBase58() ?? "";

  const config = useQuery({ queryKey: ["app-config"], queryFn: () => kairosApi.getConfig(), staleTime: 5 * 60_000 });
  const preferences = useQuery({
    queryKey: ["notification-preferences", address],
    queryFn: () => kairosApi.getNotificationPreferences(),
    enabled: authenticated && Boolean(address),
    retry: 1,
  });

  useEffect(() => {
    if (wallet.connected && address && !authenticated) void ensureAuthenticated().catch(() => undefined);
  }, [wallet.connected, address, authenticated, ensureAuthenticated]);

  const savePreference = useMutation({
    mutationFn: ({ key, value }: { key: PreferenceKey; value: boolean }) => kairosApi.updateNotificationPreferences({ [key]: value }),
    onSuccess: async ({ preferences: next }) => {
      queryClient.setQueryData(["notification-preferences", address], { preferences: next });
      toast.success("Notification preference saved");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save preference"),
  });

  const revokeSession = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["notification-preferences", address] });
      toast.success("Kairos session signed out");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not revoke session"),
  });

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Account</p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">Manage this wallet session, notification preferences, and the active Solana environment.</p>
        </header>

        <section className="rounded-2xl border border-border/60 bg-surface/80 p-5 sm:p-6" aria-labelledby="wallet-settings-title">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id="wallet-settings-title" className="text-base font-semibold text-foreground">Wallet and session</h2>
              <p className="mt-1 text-sm text-muted-foreground">Your connected wallet remains the transaction signer.</p>
            </div>
            <Wallet className="size-5 text-muted-foreground" aria-hidden="true" />
          </div>
          {wallet.connected && address ? (
            <>
              <div className="break-all rounded-xl border border-border/50 bg-background px-4 py-3 font-mono text-xs text-foreground sm:text-sm">{address}</div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground" role="status">
                  {authenticating ? "Checking wallet session…" : authenticated ? "Kairos session active" : authError || "Wallet connected; sign-in required for account settings."}
                </p>
                {authenticated ? (
                  <button
                    type="button"
                    disabled={revokeSession.isPending}
                    onClick={() => revokeSession.mutate()}
                    className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated disabled:opacity-50"
                  >
                    {revokeSession.isPending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                    Sign out of Kairos
                  </button>
                ) : (
                  <button type="button" onClick={() => void ensureAuthenticated().catch(() => undefined)} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                    Sign in with wallet
                  </button>
                )}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Signing out revokes the Kairos session. It does not disconnect Phantom or move any on-chain assets.</p>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-background p-4">
              <p className="text-sm text-muted-foreground">Connect a wallet to manage account preferences.</p>
              <button type="button" onClick={() => void connect()} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Connect wallet</button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border/60 bg-surface/80 p-5 sm:p-6" aria-labelledby="notifications-title">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 id="notifications-title" className="text-base font-semibold text-foreground">Notifications</h2>
              <p className="mt-1 text-sm text-muted-foreground">Preferences are saved to your Kairos account.</p>
            </div>
            {preferences.isFetching && <RefreshCw className="size-4 animate-spin text-muted-foreground" aria-label="Loading preferences" />}
          </div>
          {!authenticated ? (
            <p className="rounded-xl bg-background p-4 text-sm text-muted-foreground">Connect and sign in with your wallet to load notification preferences.</p>
          ) : preferences.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background p-4" role="alert">
              <span className="text-sm text-muted-foreground">Could not load notification preferences.</span>
              <button type="button" onClick={() => void preferences.refetch()} className="text-sm font-semibold text-foreground underline underline-offset-4">Retry</button>
            </div>
          ) : preferences.data ? (
            <div className="divide-y divide-border/40">
              {PREFERENCE_GROUPS.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-5 py-4 first:pt-2 last:pb-1">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                  </div>
                  <SettingSwitch
                    checked={preferences.data.preferences[item.key]}
                    disabled={savePreference.isPending}
                    label={item.title}
                    onChange={(value) => savePreference.mutate({ key: item.key, value })}
                  />
                </div>
              ))}
              <p className="flex items-center gap-1.5 pt-3 text-[11px] text-muted-foreground"><Check className="size-3" /> Last saved {new Date(preferences.data.preferences.updatedAt).toLocaleString()}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" role="status">Loading notification preferences…</p>
          )}
        </section>

        <section className="rounded-2xl border border-border/60 bg-surface/80 p-5 sm:p-6" aria-labelledby="network-settings-title">
          <h2 id="network-settings-title" className="text-base font-semibold text-foreground">Network and trading</h2>
          {config.isLoading ? <p className="mt-3 text-sm text-muted-foreground" role="status">Loading app configuration…</p> : config.isError ? (
            <p className="mt-3 text-sm text-destructive-foreground" role="alert">Runtime configuration is unavailable. Refresh to try again.</p>
          ) : config.data ? (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <ConfigValue label="Solana cluster" value={config.data.cluster} />
              <ConfigValue label="Runtime status" value={config.data.devnetInitialized ? "Devnet initialized" : "Devnet setup incomplete"} />
              <ConfigValue label="Trade path" value={config.data.swapBuilder === "program" ? "On-chain router" : "Treasury-based Devnet demo"} />
              <ConfigValue label="USDC mint" value={config.data.usdcMint ?? "Not configured"} mono />
            </dl>
          ) : null}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Auto-rebalance delegation is currently unavailable for external wallets. Kairos will not enable it unless a supported embedded wallet and delegated-signing policy are configured.</p>
        </section>
      </div>
    </PageShell>
  );
}

function ConfigValue({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/50 bg-background px-4 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-all text-sm text-foreground ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</dd>
    </div>
  );
}
