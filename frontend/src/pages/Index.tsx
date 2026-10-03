import { useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { CURATED_BASKETS, Basket } from "@/lib/baskets-data";
import { BasketCard } from "@/components/basket/BasketCard";
import { Button } from "@/components/arc/button";
import {
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Layers,
  Sparkles,
  Zap,
  Radio,
  ExternalLink,
} from "lucide-react";

const COMPARISON = [
  ["Settlement time", "1–5 min", "1–3 hrs", "412ms"],
  ["Custody model", "Smart contract vault", "Centralized custodial", "Non-custodial (Direct ATAs)"],
  ["Vault drain risk", "High (pooled balance)", "High (exchange reserve)", "Zero (stateless router)"],
  ["Token ownership", "Vault shares", "Database IOU", "Native SPL tokens in wallet"],
  ["Swap liquidity", "Isolated LP pools", "Internal orderbook", "Jupiter Aggregator CPI"],
  ["Protocol fee", "2% mgmt + 20% carry", "Spread markups", "0% protocol fee (Devnet)"],
];


export default function Landing() {
  return (
    <PageShell>
      {/* Section 1: Hero Section — Matte Dark Background */}
      <section className="relative overflow-hidden border-b border-border/40 -mt-16 pt-16 min-h-[640px] bg-background">
        <div className="container relative z-10 pb-20 pt-8 md:pb-28 md:pt-10">
          <div className="mx-auto flex max-w-5xl flex-col items-center text-center animate-fade-up">
            <h1 className="mt-4 font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-tight tracking-[-0.03em] whitespace-nowrap text-foreground">
              <span className="text-foreground">Your Taste.</span>{" "}
              <span className="opacity-70">Your Investment.</span>
            </h1>
            
            <div className="mt-8 flex items-center justify-center gap-4 animate-fade-up" style={{ animationDelay: "150ms" }}>
              <span className="font-mono text-xs sm:text-[13px] font-bold uppercase tracking-[0.35em] text-foreground/60">POWERED BY</span>
              <img src="/solanaLogo.svg" alt="Solana" className="h-4 sm:h-5 w-auto opacity-90" />
            </div>
            <p className="mt-6 max-w-2xl text-base sm:text-lg md:text-xl font-normal leading-relaxed text-foreground/80">
              Curated high-conviction baskets executed via Jupiter CPI. Constituent tokens land directly in your own wallet — zero vaults, zero custody.
            </p>
            <div className="mt-7 flex justify-center">
              <Link to="/markets">
                <Button
                  variant="primary"
                  size="lg"
                  className="rounded-full px-7 font-extrabold text-sm shadow-md"
                >
                  <span>Explore baskets</span>
                  <ArrowRight className="h-4 w-4 stroke-[2.5]" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Narrative Markets Cards (Horizontal Moving Track) */}
          <div className="mt-14 w-full text-left">
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-foreground animate-pulse" />
                <span className="font-mono text-xs uppercase tracking-wider text-foreground/80 font-semibold">
                  Narrative Markets
                </span>
              </div>
              <Link
                to="/markets"
                className="text-xs font-mono text-foreground/60 hover:text-foreground transition-colors flex items-center gap-1 font-semibold"
              >
                View all ({CURATED_BASKETS.length}) →
              </Link>
            </div>

            {/* Horizontal Moving Basket Cards Track */}
            <div className="relative w-full overflow-hidden py-3">
              <div className="flex w-max gap-5 animate-marquee hover:[animation-play-state:paused] cursor-grab active:cursor-grabbing">
                {[...CURATED_BASKETS, ...CURATED_BASKETS].map((basket, idx) => (
                  <div
                    key={`${basket.id}-${idx}`}
                    className="w-[280px] sm:w-[320px] md:w-[340px] shrink-0 text-left"
                  >
                    <BasketCard
                      basket={basket}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* Section 3: The Thesis / Moat Section */}
      <section className="border-y border-border/40 bg-surface/30">
        <div className="container py-24">
          <div className="mx-auto max-w-2xl text-center">
            <div className="badge-pill mb-4">The architecture</div>
            <h2 className="font-display text-4xl tracking-tight text-foreground">
              Vaults and custody are yesterday's model.
            </h2>
          </div>

          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border/30 bg-border/20 lg:grid-cols-3">
            <div className="bg-background p-8">
              <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">DeFi Vaults</div>
              <div className="mt-3 font-display text-2xl text-foreground">Smart contract custody risk</div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                User funds pooled inside vault PDAs. Vulnerable to reentrancy, oracle manipulation, withdrawal freezes, and protocol exploit drainage.
              </p>
            </div>
            <div className="bg-background p-8">
              <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Centralized Apps</div>
              <div className="mt-3 font-display text-2xl text-foreground">Counterparty credit risk</div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Exchange wallets holding user balances off-chain. Subject to freezing, insolvency, commingled reserves, and withdrawal halts.
              </p>
            </div>
            <div className="bg-background p-8 ring-2 ring-primary">
              <div className="font-mono text-[11px] uppercase tracking-wider text-foreground font-bold">Kairos Router</div>
              <div className="mt-3 font-display text-2xl text-foreground font-bold">100% Non-Custodial Delivery</div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                USDC in → Jupiter atomic swap CPI → constituent tokens out to user's wallet ATAs in the same transaction block. Zero custody.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Architectural Superiority Comparison Table */}
      <section className="border-b border-border/40 py-24">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <div className="badge-pill mb-4">Architecture Comparison</div>
            <h2 className="font-display text-4xl tracking-tight text-foreground">
              The only non-custodial thematic router on Solana.
            </h2>
          </div>

          <div className="mt-14 overflow-hidden rounded-2xl border border-border/30 bg-surface shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/30 bg-surface-elevated text-xs font-mono uppercase text-foreground/80">
                <tr>
                  <th className="p-4 sm:p-5">Feature</th>
                  <th className="p-4 sm:p-5">Traditional Vaults</th>
                  <th className="p-4 sm:p-5">CEX / Fintech</th>
                  <th className="p-4 sm:p-5 text-foreground font-extrabold">Kairos Protocol</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {COMPARISON.map(([feature, vaults, cex, kairos]) => (
                  <tr key={feature} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="p-4 sm:p-5 font-medium text-foreground">{feature}</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">{vaults}</td>
                    <td className="p-4 sm:p-5 text-muted-foreground">{cex}</td>
                    <td className="p-4 sm:p-5 font-bold text-foreground">{kairos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
