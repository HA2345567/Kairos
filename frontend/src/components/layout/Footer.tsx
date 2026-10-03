import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { KairosLogo } from "@/components/common/KairosLogo";

export function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setSubscribed(true);
    toast.success("Subscribed to Kairos updates!");
    setEmail("");
  };

  return (
    <footer className="relative bg-surface pt-20 pb-0 overflow-hidden font-display border-t border-border text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Top Grid: Brand, Nav Columns, Subscribe & Action Button */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-8 items-start pb-20">
          
          {/* Column 1: Brand Logo (kairos) */}
          <div className="lg:col-span-3">
            <Link to="/" className="inline-flex items-center gap-3 group">
              <KairosLogo className="size-8 text-foreground" />
              <span className="font-display text-3xl tracking-tight text-foreground">Kairos</span>
            </Link>
          </div>

          {/* Column 2: KAIROS Links */}
          <div className="lg:col-span-2 space-y-4">
            <h4 className="font-display font-bold text-xs uppercase tracking-wider text-muted-foreground">
              KAIROS
            </h4>
            <ul className="space-y-3 font-display text-sm text-muted-foreground">
              <li>
                <Link to="/markets" className="hover:text-foreground transition-colors block">
                  Docs
                </Link>
              </li>
              <li>
                <a href="#blog" className="hover:text-foreground transition-colors block">
                  Blog
                </a>
              </li>
              <li>
                <a href="#brand" className="hover:text-foreground transition-colors block">
                  Brand Kit
                </a>
              </li>
              <li>
                <a href="#privacy" className="hover:text-foreground transition-colors block">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#terms" className="hover:text-foreground transition-colors block">
                  Terms of Use
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: CONNECT Links */}
          <div className="lg:col-span-2 space-y-4">
            <h4 className="font-display font-bold text-xs uppercase tracking-wider text-muted-foreground">
              CONNECT
            </h4>
            <ul className="space-y-3 font-display text-sm text-muted-foreground">
              <li>
                <a
                  href="https://x.com"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground transition-colors block"
                >
                  X (Twitter)
                </a>
              </li>
            </ul>
          </div>

          {/* Column 4: SUBSCRIBE Box */}
          <div className="lg:col-span-3 space-y-4">
            <h4 className="font-display font-bold text-xs uppercase tracking-wider text-muted-foreground">
              SUBSCRIBE
            </h4>
            <form onSubmit={handleSubscribe} className="space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full bg-surface-muted border border-border rounded-xl px-4 py-2.5 text-sm font-display text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
                />
                <button
                  type="submit"
                  aria-label="Subscribe"
                  className="h-10 px-3.5 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-bold flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  {subscribed ? (
                    <Check className="size-4 stroke-[2.5]" />
                  ) : (
                    <ArrowRight className="size-4 stroke-[2.5]" />
                  )}
                </button>
              </div>
              <p className="font-display text-xs text-muted-foreground leading-relaxed">
                Updates, features, early-access, and new baskets.
                <br />
                Straight to your inbox.
              </p>
            </form>
          </div>

          {/* Column 5: Top-Right Capsule Button */}
          <div className="lg:col-span-2 flex justify-start lg:justify-end">
            <Link
              to="/markets"
              className="inline-block rounded-full border border-border hover:border-foreground px-5 py-2 font-display text-xs font-bold uppercase tracking-wider text-foreground hover:bg-foreground hover:text-background transition-all whitespace-nowrap shadow-sm active:scale-95"
            >
              TRY KAIROS NOW
            </Link>
          </div>

        </div>
      </div>

      {/* Giant Background Watermark — Full Edge to Edge */}
      <div className="relative w-full overflow-hidden select-none pointer-events-none flex justify-center items-end -mb-4 sm:-mb-8 lg:-mb-14">
        <span
          className="w-full text-center font-display font-black leading-[0.74] tracking-tighter whitespace-nowrap block text-transparent bg-clip-text bg-gradient-to-b from-foreground/[0.05] to-transparent"
          style={{ fontSize: "27.5vw" }}
        >
          kairos
        </span>
      </div>
    </footer>
  );
}
