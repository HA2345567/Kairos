import { ArrowRight, Check, Layers, ShieldCheck, Sparkles, TrendingUp, Wallet, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";

const STEPS = [
  {
    number: "01",
    title: "Prepare",
    icon: Layers,
    description: "Split, quote, and simulate every leg.",
  },
  {
    number: "02",
    title: "Sign",
    icon: Wallet,
    description: "Your wallet signs. Kairos never sees your keys.",
  },
  {
    number: "03",
    title: "Submit",
    icon: ArrowRight,
    description: "Submitted bytes must match what was prepared.",
  },
  {
    number: "04",
    title: "Land",
    icon: Check,
    description: "Each leg lands or expires safely.",
  },
];

const DESTINATIONS = [
  { title: "Browse baskets", to: "/markets", icon: Layers },
  { title: "Basket detail and NAV", to: "/markets", icon: TrendingUp },
  { title: "Labs charts", to: "/labs", icon: Sparkles },
  { title: "Portfolio", to: "/portfolio", icon: WalletCards },
  { title: "Admin publishing", to: "/admin", icon: ShieldCheck },
];

export function ExecutionFlowSection() {
  return (
    <section id="how-it-works" aria-labelledby="execution-flow-title" className="relative overflow-hidden border-y border-border/40 bg-surface/25">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.055)_0.7px,transparent_0.7px)] bg-[size:20px_20px] opacity-30 [mask-image:linear-gradient(to_bottom,transparent,black,transparent)]" />
      <div className="container relative py-16 sm:py-20 lg:py-24">
        <header className="max-w-4xl">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Wallet-signed · non-custodial</p>
          <h2 id="execution-flow-title" className="mt-3 font-display text-3xl font-semibold leading-tight tracking-[-0.045em] text-foreground sm:text-4xl lg:text-5xl">
            Pick a basket. Sign once. Own the real assets.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Review the quote, approve it with your wallet, and follow each execution leg as it settles on Solana devnet.
          </p>
        </header>

        <ol className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.number} className="group relative min-h-[180px] rounded-2xl border border-border/70 bg-background/80 p-5 transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:bg-surface/80 sm:p-6">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-2xl font-semibold tracking-tight text-primary">{step.number}</span>
                  <span className="grid size-9 place-items-center rounded-xl border border-border/60 bg-surface/80 text-muted-foreground transition group-hover:border-primary/30 group-hover:text-primary">
                    <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                </div>
                <h3 className="mt-4 font-mono text-xs font-bold uppercase tracking-[0.16em] text-foreground">{step.title}</h3>
                <p className="mt-2 max-w-[18rem] text-sm leading-5 text-muted-foreground">{step.description}</p>
                {index < STEPS.length - 1 && (
                  <ArrowRight aria-hidden="true" className="absolute -right-[11px] top-1/2 z-10 hidden size-5 -translate-y-1/2 rounded-full border border-border/70 bg-background p-1 text-primary xl:block" />
                )}
              </li>
            );
          })}
        </ol>

        <div className="mt-9 sm:mt-11">
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">What users can do today</h3>
          <nav aria-label="Kairos destinations" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {DESTINATIONS.map((destination) => {
              const Icon = destination.icon;
              return (
                <Link
                  key={destination.title}
                  to={destination.to}
                  className="group inline-flex min-h-12 items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/70 px-3.5 py-3 text-xs font-semibold text-foreground/80 transition hover:border-primary/30 hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-4"
                >
                  <span className="flex items-center gap-2.5"><Icon className="size-4 shrink-0 text-muted-foreground transition group-hover:text-primary" aria-hidden="true" />{destination.title}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </section>
  );
}
