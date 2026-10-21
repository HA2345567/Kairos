import { Link, NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import Menu from "lucide-react/dist/esm/icons/menu";
import X from "lucide-react/dist/esm/icons/x";
import Wallet from "lucide-react/dist/esm/icons/wallet";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";
import ArrowUpRight from "lucide-react/dist/esm/icons/arrow-up-right";
import { cn } from "@/lib/utils";
import { WalletDropdown } from "@/components/wallet/WalletDropdown";
import { ClusterBanner } from "@/components/system/ClusterBanner";
import { KairosLogo } from "@/components/common/KairosLogo";
import { useKairosWallet } from "@/components/wallet/useKairosWallet";

const NAV = [
  { to: "/markets", label: "Baskets" },
  { to: "/positions", label: "Positions" },
  { to: "/ideas", label: "Ideas" },
  { to: "/settings", label: "Settings" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isLanding = location.pathname === "/";

  // Solana Wallet Adapter
  const { connected, publicKey, disconnect, wallet, connect } = useKairosWallet();
  const isConnected = connected && !!publicKey;
  const rawAddr = publicKey?.toBase58() || null;
  const displayAddr = rawAddr ? `${rawAddr.slice(0, 4)}...${rawAddr.slice(-4)}` : "";

  const handleSignIn = () => void connect();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/20">
      <ClusterBanner />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        {/* Left: Company Logo + Name — Kairos */}
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <KairosLogo className="size-6 text-foreground transition-transform group-hover:scale-105" />
            <span className="font-display text-2xl tracking-tight text-foreground">Kairos</span>
          </Link>
        </div>

        {/* Center: Floating Capsule Navigation Pill (Hidden on landing page, shown inside the app) */}
        {!isLanding && (
          <nav className="hidden lg:flex items-center border border-border/40 bg-surface/90 backdrop-blur-md p-1.5 rounded-2xl shadow-sm">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-xl transition-all duration-200",
                    isActive
                      ? "bg-primary text-primary-foreground font-bold shadow-sm"
                      : "text-foreground/70 hover:text-foreground hover:bg-surface-elevated"
                  )
                }
              >
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        )}

        {/* Right: Landing shows "Launch App", App pages show "Connect Wallet" */}
        <div className="hidden lg:flex items-center gap-3">
          {isLanding ? (
            <>
              <Link
                to="/docs"
                className="inline-flex h-[32px] items-center justify-center rounded-full border border-border/60 bg-background/55 px-4 text-xs font-semibold text-foreground/75 transition-colors hover:border-border-strong hover:bg-surface hover:text-foreground"
              >
                Docs
              </Link>
              <Link
                to="/labs/create"
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary hover:bg-neutral-200 text-primary-foreground font-bold text-xs px-3.5 h-[32px] transition-all duration-200 shadow-sm cursor-pointer select-none active:scale-95"
              >
                <span>Launch App</span>
                <ArrowRight className="size-3.5 stroke-[2.5]" />
              </Link>
            </>
          ) : (
            <>
              {!isConnected ? (
                <button
                  type="button"
                  onClick={handleSignIn}
                  className="group inline-flex h-10 items-center gap-2.5 rounded-full border border-white/10 bg-[#1b1b1b] py-1 pl-1.5 pr-4 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition-all hover:border-white/20 hover:bg-[#242424] active:scale-[0.98]"
                >
                  <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-neutral-100 via-neutral-300 to-neutral-500 text-[#111] shadow-[0_0_16px_rgba(255,255,255,0.14)]">
                    <Wallet className="size-3.5" aria-hidden="true" />
                  </span>
                  <span>Connect wallet</span>
                  <ArrowUpRight className="size-3.5 text-white/45 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white/80" aria-hidden="true" />
                </button>
              ) : (
                <WalletDropdown
                  address={rawAddr || ""}
                  walletName={wallet?.adapter.name}
                  walletIcon={wallet?.adapter.icon}
                  onDisconnect={() => disconnect()}
                />
              )}
            </>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          className="lg:hidden rounded-lg border border-border p-2 text-foreground"
          onClick={() => setOpen((s) => !s)}
          aria-label="Toggle Menu"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {open && (
        <div className="border-t border-border/40 bg-background/95 backdrop-blur-xl px-4 py-3 lg:hidden space-y-2">
          {!isLanding && NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium",
                  isActive
                    ? "bg-primary text-primary-foreground font-bold"
                    : "text-foreground/75 hover:text-foreground hover:bg-surface"
                )
              }
            >
              <span>{item.label}</span>
            </NavLink>
          ))}
          <div className="pt-2 border-t border-border/30 space-y-2">
            {isLanding ? (
              <div className="flex gap-2">
                <Link
                  to="/docs"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-full border border-border/60 bg-surface py-2.5 text-center text-sm font-semibold text-foreground/80 transition-colors hover:bg-surface-elevated"
                >
                  Docs
                </Link>
                <Link
                  to="/labs/create"
                  onClick={() => setOpen(false)}
                  className="flex-[1.4] rounded-full bg-primary py-2.5 text-center text-sm font-extrabold tracking-wide text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-95"
                >
                  <span>Launch App</span>
                  <ArrowRight className="ml-1 inline size-4 stroke-[2.5]" />
                </Link>
              </div>
            ) : (
              <>
                {!isConnected ? (
                  <button
                    onClick={() => {
                      setOpen(false);
                      handleSignIn();
                    }}
                    className="group flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#1b1b1b] p-2 text-white transition-all hover:border-white/20 hover:bg-[#242424] active:scale-[0.99]"
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-neutral-100 via-neutral-300 to-neutral-500 text-[#111] shadow-[0_0_18px_rgba(255,255,255,0.12)]">
                        <Wallet className="size-4" aria-hidden="true" />
                      </span>
                      <span className="text-left">
                        <span className="block text-sm font-semibold">Connect wallet</span>
                        <span className="mt-0.5 block text-[11px] font-normal text-white/50">Phantom · Backpack · Solflare</span>
                      </span>
                    </span>
                    <ArrowUpRight className="mr-1 size-4 text-white/45 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                  </button>
                ) : (
                  <div className="p-3 bg-surface rounded-2xl border border-border/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="size-6 rounded-full bg-gradient-to-tr from-[#9945FF] via-[#14F195] to-[#00C2FF] p-[1.5px]">
                          <div className="w-full h-full rounded-full bg-surface flex items-center justify-center text-[9px] font-bold text-foreground font-mono">
                            {rawAddr ? rawAddr.slice(0, 2).toUpperCase() : "SO"}
                          </div>
                        </div>
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {displayAddr}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                      void disconnect();
                          setOpen(false);
                        }}
                        className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
                      >
                        Disconnect
                      </button>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Link
                        to="/positions"
                        onClick={() => setOpen(false)}
                        className="flex-1 text-center py-1.5 px-2 rounded-xl bg-foreground/10 hover:bg-foreground/15 text-xs font-semibold text-foreground transition-colors"
                      >
                        My Portfolio
                      </Link>
                      <a
                        href={`https://solscan.io/account/${rawAddr}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 text-center py-1.5 px-2 rounded-xl bg-foreground/10 hover:bg-foreground/15 text-xs font-semibold text-foreground transition-colors"
                      >
                        Solscan
                      </a>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
