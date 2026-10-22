import { Link } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import PromptBar from "@/components/landing/PromptBar";
import { HorizontalBasketMarquee } from "@/components/basket/HorizontalBasketMarquee";
import { LandingMarketShowcase } from "@/components/landing/LandingMarketShowcase";
import { useBaskets } from "@/lib/baskets-data";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";

const FAQS = [
  {
    question: "What is Kairos?",
    answer: "Kairos helps you explore themed Solana baskets, review their token allocations, and try a basket investment from one place. The current product is built for Solana Devnet.",
  },
  {
    question: "Is Kairos on Solana mainnet?",
    answer: "No. The current app runs on Solana Devnet. Devnet SOL and test assets have no monetary value, and a successful demo transaction is not a real market investment.",
  },
  {
    question: "What happens when I invest in a basket?",
    answer: "Choose a basket and amount, review the quote, then approve the prepared Devnet transactions in your wallet. The current demo sends SOL to the basket treasury for fixed-rate test-asset delivery; it does not route a Jupiter market swap. Your wallet may ask you to approve each asset leg separately.",
  },
  {
    question: "Does Kairos need my wallet password or recovery phrase?",
    answer: "No. Connect and approve transactions through your wallet app, such as Phantom. Kairos never needs your password, private key, or recovery phrase. Read each wallet prompt and only approve transactions you intend to make.",
  },
  {
    question: "Are token prices and the historical chart an investment quote?",
    answer: "No. Token cards show market reference prices, while the historical basket chart is a modeled backtest based on available history. Neither is a guaranteed return or your execution price. Review the live quote in the invest flow before signing.",
  },
  {
    question: "Where can I check my transaction and fees?",
    answer: "The invest dialog shows the quoted platform fee before you sign. After submission, follow confirmation progress in the app and open confirmed transactions in the Solana Devnet Explorer. Your connected wallet Positions page also shows available balances and execution history.",
  },
];

export default function Landing() {
  const { data: baskets = [] } = useBaskets();

  return (
    <PageShell hideFooter={false}>
      {/* Section 1: Hero Section — Classical Ruins (Visible only in this area) */}
      <section className="relative overflow-hidden border-b border-border/40 -mt-16 pt-24 pb-14 sm:pb-16 min-h-[580px] lg:min-h-[620px] flex items-center bg-background">
        {/* Background Artwork Layer — Pure classical ruins visible ONLY in this hero area */}
        <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0">
          <img
            src="/hero-ruins.webp"
            alt="Kairos Architectural Ruins"
            fetchPriority="high"
            decoding="async"
            className="w-full h-full object-cover object-center"
          />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0 z-[1] pointer-events-none bg-gradient-to-b from-black/20 via-black/25 to-black/40"
        />

        <div className="container relative z-10 pb-4 pt-6 md:pb-6 md:pt-8">
          <div className="mx-auto flex max-w-5xl flex-col items-center text-center animate-fade-up">
            <h1
              className="mt-1 max-w-full whitespace-nowrap font-display font-medium text-[clamp(1.8rem,6.3vw,5.5rem)] leading-none tracking-[-0.055em] text-center drop-shadow-[0_4px_18px_rgba(0,0,0,0.6)] [text-shadow:_0_1px_0_rgba(255,255,255,0.24),_0_8px_20px_rgba(0,0,0,0.5)]"
              style={{ fontVariationSettings: '"wdth" 100' }}
            >
              <span className="inline bg-gradient-to-b from-white via-[#f2f3f5] to-[#b7bdc6] bg-clip-text text-transparent">Your Taste.</span>{" "}
              <span className="inline bg-gradient-to-b from-white via-[#f2f3f5] to-[#b7bdc6] bg-clip-text text-transparent">Your Investment.</span>
            </h1>

            <div className="mt-5 sm:mt-6 flex items-center justify-center gap-4 animate-fade-up" style={{ animationDelay: "150ms" }}>
              <span className="font-mono text-xs sm:text-[13px] font-bold uppercase tracking-[0.35em] text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">POWERED BY</span>
              <img src="/solanaLogo.svg" alt="Solana" className="h-4 sm:h-5 w-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" />
            </div>
            <p className="mt-4 sm:mt-5 max-w-2xl text-base sm:text-lg md:text-xl font-normal leading-relaxed text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] [text-shadow:_0_1px_8px_rgba(0,0,0,0.9)]">
              Turn an idea into a Solana basket, shape its token allocations, and trade through Jupiter. Your tokens settle directly in your wallet — never in a pooled vault.</p>

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

      <LandingMarketShowcase baskets={baskets} />
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
      <section aria-labelledby="faq-heading" className="border-t border-border/60 bg-background">
        <div className="container grid gap-10 py-16 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:py-28 xl:gap-20">
          <div className="flex flex-col items-start lg:sticky lg:top-28 lg:self-start">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Kairos · FAQ</p>
            <h2 id="faq-heading" aria-label="Good questions" className="mt-4 max-w-sm font-display text-4xl font-semibold leading-[1.05] tracking-[-0.045em] text-foreground sm:text-5xl">
              Good questions.
            </h2>
            <p className="mt-5 max-w-sm text-sm leading-6 text-muted-foreground sm:text-base">
              Clear answers about Devnet, wallet approvals, and the data you see in Kairos.
            </p>
            <Link to="/docs" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
              Read the docs
              <ArrowRight aria-hidden="true" className="size-4 -rotate-45 transition-transform" />
            </Link>
          </div>

          <Accordion type="single" collapsible defaultValue="faq-0" className="w-full border-t border-border/50">
            {FAQS.map((faq, index) => (
              <AccordionItem
                key={faq.question}
                value={`faq-${index}`}
                className="border-b border-border/50 transition-colors"
              >
                <AccordionTrigger className="gap-5 py-5 text-left font-sans text-sm font-medium leading-6 tracking-[-0.01em] text-foreground hover:no-underline sm:py-6 sm:text-base [&>svg]:text-muted-foreground [&>svg]:transition-transform">
                  <span className="flex min-w-0 items-start gap-4 sm:gap-5">
                    <span aria-hidden="true" className="mt-0.5 w-6 shrink-0 font-mono text-[11px] tracking-normal text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                    <span>{faq.question}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-5 pl-10 pr-7 text-sm leading-6 text-muted-foreground sm:pb-6 sm:pl-[2.8rem] sm:pr-10 sm:text-[15px]">
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
            loading="lazy"
            decoding="async"
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
              className="inline-flex items-center justify-center rounded-full border border-white/20 hover:border-white/40 bg-[#161616]/90 hover:bg-[#222222] backdrop-blur-md px-7 py-3 sm:px-9 sm:py-3.5 font-display text-sm sm:text-base font-bold uppercase tracking-wider text-white transition-all shadow-xl hover:shadow-[0_0_24px_rgba(255,255,255,0.15)] active:scale-95 whitespace-nowrap cursor-pointer"
            >
              TRY KAIROS NOW
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
