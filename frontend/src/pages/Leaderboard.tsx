import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { kairosApi } from "@/lib/api-client";
import type { LabsBasket } from "@/lib/api-types";

type Contributor = {
  address: string;
  name: string;
  votes: number;
};

function CrownIcon() {
  const gradientId = `crown-${useId().replace(/:/g, "")}`;
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className="size-6 drop-shadow-[0_1px_4px_rgba(239,194,92,0.38)]">
      <defs>
        <linearGradient id={gradientId} x1="9" y1="11" x2="38" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF3C4" />
          <stop offset="0.38" stopColor="#EFC25C" />
          <stop offset="0.72" stopColor="#B87824" />
          <stop offset="1" stopColor="#F8D982" />
        </linearGradient>
      </defs>
      <path d="M8.5 15.5 17 21l7-12 7 12 8.5-5.5-3.8 19H12.3l-3.8-19Z" fill={`url(#${gradientId})`} stroke="#FFE9A5" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M13 30h22M15 35h18" stroke="#FFF0BD" strokeOpacity=".76" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8.5" cy="14.5" r="2.4" fill="#FFF3C4" />
      <circle cx="24" cy="8.5" r="2.7" fill="#F8D982" />
      <circle cx="39.5" cy="14.5" r="2.4" fill="#EFC25C" />
    </svg>
  );
}

function RankMedal({ rank }: { rank: number }) {
  const gradientId = `medal-${rank}-${useId().replace(/:/g, "")}`;
  const colors = rank === 1
    ? ["#FFF1BA", "#E5B84D", "#A96A1D"]
    : rank === 2
      ? ["#F6FAFF", "#B9C5D2", "#748394"]
      : ["#F5D0A8", "#C4824C", "#80502F"];
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" fill="none" className="size-8 drop-shadow-[0_2px_5px_rgba(0,0,0,0.3)]">
      <defs>
        <linearGradient id={gradientId} x1="8" y1="5" x2="31" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor={colors[0]} />
          <stop offset=".52" stopColor={colors[1]} />
          <stop offset="1" stopColor={colors[2]} />
        </linearGradient>
      </defs>
      <path d="m12 23-4 13 8-3 4 5 4-8" fill={`url(#${gradientId})`} stroke={colors[2]} strokeWidth=".8" strokeLinejoin="round" />
      <path d="m28 23 4 13-8-3-4 5-4-8" fill={`url(#${gradientId})`} stroke={colors[2]} strokeWidth=".8" strokeLinejoin="round" />
      <circle cx="20" cy="17" r="11" fill={`url(#${gradientId})`} stroke={colors[0]} strokeWidth="1.2" />
      <circle cx="20" cy="17" r="8.2" stroke="#FFF9E8" strokeOpacity=".68" strokeWidth=".8" />
      <path d="m20 11.5 1.65 3.35 3.7.54-2.68 2.61.63 3.69L20 19.95l-3.3 1.74.63-3.69-2.68-2.61 3.7-.54L20 11.5Z" fill="#FFF9E8" fillOpacity=".9" />
    </svg>
  );
}

function formatContributor(address: string) {
  if (!address) return "Anonymous";
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

function rankContributors(ideas: LabsBasket[]): Contributor[] {
  const contributors = new Map<string, Contributor>();
  for (const idea of ideas) {
    const address = idea.createdBy || "";
    const existing = contributors.get(address);
    const votes = Math.max(0, idea.votes || 0);
    if (existing) existing.votes += votes;
    else contributors.set(address, { address, name: formatContributor(address), votes });
  }
  return [...contributors.values()].sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
}

export default function Leaderboard() {
  const [ideas, setIdeas] = useState<LabsBasket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void kairosApi.getLabsBaskets()
      .then(({ labsBaskets }) => {
        if (!active) return;
        setIdeas(labsBaskets);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "The contributor rankings could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const contributors = useMemo(() => rankContributors(ideas), [ideas]);
  const podium = [
    { contributor: contributors[1], rank: 2 },
    { contributor: contributors[0], rank: 1 },
    { contributor: contributors[2], rank: 3 },
  ].filter((entry): entry is { contributor: Contributor; rank: number } => Boolean(entry.contributor));

  return (
    <PageShell hideFooter contentTag="div">
      <main className="mx-auto block w-full max-w-5xl px-4 py-8 font-serif text-base leading-6 text-[#fdfdfd] sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-8">
          <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-sm">
            <Link
              to="/ideas"
              aria-label="Go back to Ideas"
              className="inline-flex size-8 items-center justify-center rounded-xl text-foreground/55 transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <ol className="flex items-center gap-1 text-foreground/50">
              <li><Link to="/ideas" className="transition-colors hover:text-foreground">Ideas</Link></li>
              <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
              <li><span className="font-medium text-foreground">Leaderboard</span></li>
            </ol>
          </nav>

          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-amber-200/25 shadow-[0_4px_18px_rgba(239,194,92,0.12)]" style={{ background: "radial-gradient(circle at 32% 22%, rgba(255,237,180,.2), rgba(170,111,36,.12) 48%, rgba(10,10,10,.5))" }}>
              <CrownIcon />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Leaderboard
              </h1>
              <p className="mt-0.5 text-sm text-foreground/60">Top contributors ranked by community votes</p>
            </div>
          </div>
        </div>

        {loadError && (
          <div role="alert" className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-foreground/75">
            {loadError}
          </div>
        )}

        {podium.length > 0 && (
          <section aria-label="Top three contributors" className="mx-auto mb-8 flex max-w-2xl items-end justify-center gap-3 sm:gap-4">
            {podium.map(({ contributor, rank }) => (
              <article
                key={contributor.address || "anonymous"}
                className={`relative flex w-1/3 flex-col items-center rounded-xl border border-border bg-surface px-2 py-5 transition-colors hover:bg-surface-elevated sm:px-6 sm:py-6 ${rank === 1 ? "min-h-[190px]" : "min-h-[168px]"}`}
              >
                <div className="mb-3 flex size-9 items-center justify-center"><RankMedal rank={rank} /></div>
                <div className={`mb-3 grid size-10 place-items-center rounded-full border font-mono text-xs font-semibold ${rank === 1 ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background text-foreground/75"}`}>
                  {contributor.name.slice(0, 2).toUpperCase()}
                </div>
                <p className="max-w-full truncate text-center text-xs font-semibold text-foreground sm:text-sm">{contributor.name}</p>
                <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">{contributor.votes}</p>
                <p className="text-[11px] text-foreground/45">{contributor.votes === 1 ? "vote" : "votes"}</p>
                <span className="absolute right-2 top-2 rounded-md border border-border/70 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-foreground/55">#{rank}</span>
              </article>
            ))}
          </section>
        )}

        <section aria-labelledby="ranking-table-title" className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-4 py-4 sm:px-5">
            <h2 id="ranking-table-title" className="font-display text-base font-semibold text-foreground">All contributors</h2>
          </div>
          <div className="grid gap-3 border-b border-border/70 bg-background/30 px-4 py-3 text-xs font-medium text-foreground/50 sm:px-5" style={{ gridTemplateColumns: "3.5rem minmax(0, 1fr) 5.625rem" }}>
            <span>Rank</span><span>Contributor</span><span className="text-right">Votes</span>
          </div>
          {loading ? (
            <div role="status" className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-foreground/50">
              <LoaderCircle className="size-4 animate-spin" /> Loading rankings
            </div>
          ) : loadError ? (
            <div className="px-5 py-10 text-center text-sm text-foreground/50">Rankings are temporarily unavailable.</div>
          ) : contributors.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-foreground/50">No contributors to rank yet. Share an idea or cast a vote to get started.</div>
          ) : (
            <ol>
              {contributors.map((contributor, index) => (
                <li
                  key={contributor.address || "anonymous"}
                  className="grid items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0 sm:px-5"
                  style={{ gridTemplateColumns: "3.5rem minmax(0, 1fr) 5.625rem" }}
                >
                  <span className="font-mono text-xs tabular-nums text-foreground/45">#{index + 1}</span>
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-background font-mono text-[10px] font-semibold text-foreground/75">{contributor.name.slice(0, 2).toUpperCase()}</span>
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">{contributor.name}</span>
                  </span>
                  <span className="text-right font-mono text-sm tabular-nums text-foreground/75">{contributor.votes}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </PageShell>
  );
}
