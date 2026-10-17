import { Link } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/arc/button";
import PromptBar from "@/components/landing/PromptBar";
import { HorizontalBasketMarquee } from "@/components/basket/HorizontalBasketMarquee";
import { useBaskets } from "@/lib/baskets-data";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
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

const FAQS = [
  {
    question: "What is Kairos and how does it work?",
    answer:
      "Kairos is a non-custodial thematic investment router on Solana. Instead of locking your funds in smart contract vaults or relying on centralized exchanges, Kairos executes atomic swaps via Jupiter CPI to deliver native SPL tokens directly into your wallet with 1 click.",
  },
  {
    question: "Where are my tokens stored after I invest?",
    answer:
      "Your tokens land directly in your own self-custodial wallet (Phantom, Solflare, Backpack, etc.). Kairos never holds custody of your assets. You maintain 100% unilateral ownership at all times and can transfer, stake, or trade your tokens independently.",
  },
  {
    question: "How does 1-click execution work under the hood?",
    answer:
      "When you deposit USDC into a basket, Kairos calculates optimal constituent weights, executes swap legs atomically via Jupiter Aggregator CPI with dynamic slippage protection, and sends all tokens directly to your Associated Token Accounts (ATAs) in the same transaction block.",
  },
  {
    question: "What are the protocol fees on Kairos?",
    answer:
      "On Solana Devnet, Kairos charges 0% protocol fees. In production, Kairos implements an ultra-low, transparent routing fee with zero management fees, zero exit fees, and zero performance carry—unlike traditional crypto funds that charge 2% management and 20% carry.",
  },
  {
    question: "Can I sell or rebalance my basket tokens at any time?",
    answer:
      "Yes. You can exit your entire basket position back into USDC in 1 click through the Kairos Portfolio, or sell constituent tokens individually on any Solana DEX. There are no lockups, cooldown periods, or withdrawal limits.",
  },
  {
    question: "What is Kairos Labs?",
    answer:
      "Kairos Labs is the decentralized creation and discovery hub where strategists and community members can propose, backtest, and share new thematic baskets. Highly rated community ideas can be verified and deployed to the primary market router.",
  },
];

export default function Landing() {
  const { data: baskets = [] } = useBaskets();

  return (
    <PageShell>
      {/* Section 1: Hero Section — Classical Ruins (Visible only in this area) */}
      <section className="relative overflow-hidden border-b border-border/40 -mt-16 pt-24 pb-14 sm:pb-16 min-h-[580px] lg:min-h-[620px] flex items-center bg-background">
        {/* Background Artwork Layer — Pure classical ruins visible ONLY in this hero area */}
        <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0">
          <img
            src="/hero-ruins.png"
            alt="Kairos Architectural Ruins"
            className="w-full h-full object-cover object-center"
          />
        </div>

        <div className="container relative z-10 pb-4 pt-6 md:pb-6 md:pt-8">
          <div className="mx-auto flex max-w-5xl flex-col items-center text-center animate-fade-up">
            <h1 className="mt-1 font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-tight tracking-[-0.03em] whitespace-nowrap text-white drop-shadow-[0_3px_12px_rgba(0,0,0,0.9)] [text-shadow:_0_2px_16px_rgba(0,0,0,0.85)]">
              <span className="text-white">Your Taste.</span>{" "}
              <span className="text-white/80">Your Investment.</span>
            </h1>
            
            <div className="mt-5 sm:mt-6 flex items-center justify-center gap-4 animate-fade-up" style={{ animationDelay: "150ms" }}>
              <span className="font-mono text-xs sm:text-[13px] font-bold uppercase tracking-[0.35em] text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">POWERED BY</span>
              <img src="/solanaLogo.svg" alt="Solana" className="h-4 sm:h-5 w-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" />
            </div>
            <p className="mt-4 sm:mt-5 max-w-2xl text-base sm:text-lg md:text-xl font-normal leading-relaxed text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] [text-shadow:_0_1px_8px_rgba(0,0,0,0.9)]">
              Curated high-conviction baskets executed via Jupiter CPI. Constituent tokens land directly in your own wallet — zero vaults, zero custody.
            </p>

            {/* Prompt Bar */}
            <div className="mt-6 sm:mt-7 w-full max-w-xl animate-fade-up" style={{ animationDelay: "200ms" }}>
              <PromptBar />
            </div>

            {/* Explore Baskets Action */}
            <div className="mt-4 flex items-center justify-center gap-4 animate-fade-up" style={{ animationDelay: "250ms" }}>
              <Link
                to="/markets"
                className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 bg-primary hover:bg-neutral-200 text-primary-foreground font-extrabold text-xs sm:text-sm tracking-wide shadow-xl shadow-black/50 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer select-none"
              >
                <span>Explore baskets</span>
                <ArrowRight className="size-3.5 sm:size-4 stroke-[2.5]" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Horizontal Moving Market Baskets Showcase — Clean standalone section */}
      <section className="relative overflow-hidden pt-8 pb-14 sm:pb-16 border-b border-border/40 bg-background">
        {/* Infinite Horizontal Moving Basket Cards Track */}
        <div className="w-full overflow-hidden">
          <HorizontalBasketMarquee baskets={baskets} speedSeconds={50} />
        </div>

        <div className="container relative z-10 mt-6 sm:mt-8">
          <div className="flex justify-center">
            <Link
              to="/markets"
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors group cursor-pointer"
            >
              <span>View all baskets in markets</span>
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
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

      {/* Section 4: Frequently Asked Questions */}
      <section className="border-b border-border/40 py-24 bg-surface/20">
        <div className="container max-w-4xl">
          <div className="mx-auto text-center mb-16">
            <div className="badge-pill mb-4">FAQ</div>
            <h2 className="font-display text-4xl sm:text-5xl tracking-tight text-foreground font-bold">
              Frequently Asked Questions
            </h2>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
              Everything you need to know about non-custodial thematic baskets on Solana.
            </p>
          </div>

          <Accordion type="single" collapsible defaultValue="faq-0" className="w-full space-y-3.5">
            {FAQS.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`faq-${index}`}
                className="border border-border/40 bg-surface/40 hover:border-border-strong hover:bg-surface/70 data-[state=open]:border-border-strong data-[state=open]:bg-surface/80 rounded-2xl px-5 sm:px-6 transition-all duration-200"
              >
                <AccordionTrigger className="hover:no-underline font-display text-base sm:text-lg font-semibold text-foreground py-5 text-left gap-4">
                  <span>{faq.question}</span>
                </AccordionTrigger>
                <AccordionContent className="text-sm sm:text-[15px] leading-relaxed text-muted-foreground pb-5 pt-1">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Section 5: Landing Page CTA — Creation of Adam Hands Artwork */}
      <section className="relative w-full border-b border-border/40 bg-black/95 py-14 sm:py-20 overflow-hidden flex flex-col items-center justify-center">
        <div className="relative max-w-4xl w-full px-6 h-56 sm:h-64 md:h-80 flex items-center justify-center">
          <img
            src="/footer-hands.jpg"
            alt="Kairos — Human Taste Meets Algorithmic Execution"
            className="w-full h-full object-contain object-center select-none pointer-events-none"
          />
          {/* Subtle atmospheric edge blending */}
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-surface/30 pointer-events-none" />
          <div className="absolute inset-y-0 left-0 w-24 sm:w-32 bg-gradient-to-r from-surface to-transparent pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-24 sm:w-32 bg-gradient-to-l from-surface to-transparent pointer-events-none" />

          {/* TRY KAIROS NOW Button Overlaid on Image */}
          <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-20">
            <Link
              to="/markets"
              className="inline-flex items-center justify-center rounded-full border border-white/20 hover:border-white/40 bg-[#161616]/90 hover:bg-[#222222] backdrop-blur-md px-6 py-2.5 sm:px-8 sm:py-3 font-display text-xs sm:text-sm font-bold uppercase tracking-wider text-white transition-all shadow-xl hover:shadow-[0_0_24px_rgba(255,255,255,0.15)] active:scale-95 whitespace-nowrap cursor-pointer"
            >
              TRY KAIROS NOW
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
