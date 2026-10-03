import { Link, NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import { Menu, X, Wallet, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { WalletDropdown } from "@/components/wallet/WalletDropdown";
import { KairosLogo } from "@/components/common/KairosLogo";
import { Button } from "@/components/arc/button";

const NAV = [
  { to: "/markets", label: "Baskets" },
  { to: "/positions", label: "Positions" },
  { to: "/labs", label: "Labs", isBeta: true },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isLanding = location.pathname === "/";

  // Solana Wallet Adapter
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const isConnected = connected && !!publicKey;
  const rawAddr = publicKey?.toBase58() || null;
  const displayAddr = rawAddr ? `${rawAddr.slice(0, 4)}...${rawAddr.slice(-4)}` : "";

  const handleSignIn = () => {
    setWalletModalVisible(true);
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (err) {
      console.warn("Wallet adapter disconnect error:", err);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b border-border/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        {/* Left: Company Logo + Name — Kairos */}
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <KairosLogo className="size-7 text-foreground transition-transform group-hover:scale-105" />
            <span className="font-display text-2xl font-extrabold tracking-tight text-foreground">Kairos</span>
          </Link>
        </div>

        {/* Center: Floating Capsule Navigation Pill (Hidden on landing page, shown inside the app) */}
        {!isLanding && (
          <nav className="hidden md:flex items-center border border-border/40 bg-surface/90 backdrop-blur-md p-1.5 rounded-2xl shadow-sm">
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
                {item.isBeta && (
                  <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full bg-primary text-primary-foreground leading-none">
                    BETA
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        )}

        {/* Right: Landing shows "Launch App", App pages show "Connect Wallet" */}
        <div className="hidden md:flex items-center gap-3">
          {isLanding ? (
            <Link to="/markets">
              <Button
                variant="primary"
                size="md"
                className="rounded-full px-5 font-bold"
              >
                <span>Launch App</span>
                <ArrowRight className="size-3.5 stroke-[2.5]" />
              </Button>
            </Link>
          ) : (
            <>
              {!isConnected ? (
                <Button
                  onClick={handleSignIn}
                  variant="primary"
                  size="md"
                  className="rounded-xl px-5 font-bold"
                >
                  <Wallet className="size-3.5" />
                  <span>Sign In</span>
                </Button>
              ) : (
                <WalletDropdown
                  address={rawAddr || ""}
                  onDisconnect={handleDisconnect}
                />
              )}
            </>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          className="md:hidden rounded-lg border border-border p-2 text-foreground"
          onClick={() => setOpen((s) => !s)}
          aria-label="Toggle Menu"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {open && (
        <div className="border-t border-border/40 bg-background/95 backdrop-blur-xl px-4 py-3 md:hidden space-y-2">
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
              {item.isBeta && (
                <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded-full bg-primary text-primary-foreground">
                  BETA
                </span>
              )}
            </NavLink>
          ))}
          <div className="pt-2 border-t border-border/30 space-y-2">
            {isLanding ? (
              <Link
                to="/markets"
                onClick={() => setOpen(false)}
                className="w-full py-2.5 rounded-full bg-primary hover:opacity-90 text-primary-foreground font-extrabold text-sm tracking-wide flex items-center justify-center gap-2 select-none transition-all active:scale-95 shadow-sm"
              >
                <span>Launch App</span>
                <ArrowRight className="size-4 stroke-[2.5]" />
              </Link>
            ) : (
              <>
                {!isConnected ? (
                  <button
                    onClick={() => {
                      setOpen(false);
                      handleSignIn();
                    }}
                    className="w-full rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-bold py-2.5 text-sm transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Wallet className="size-4" />
                    Sign In
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
                          handleDisconnect();
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
