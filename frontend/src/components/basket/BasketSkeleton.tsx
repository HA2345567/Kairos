import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function BasketCardSkeleton() {
  return (
    <div className="relative rounded-2xl bg-surface border border-border/30 overflow-hidden p-4 sm:p-5 flex flex-col justify-between min-h-[440px] animate-pulse">
      {/* Top Image Artwork Placeholder */}
      <div className="w-full aspect-[4/3] rounded-xl bg-foreground/[0.04] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/[0.03] to-transparent animate-shimmer" />
      </div>

      {/* Middle: Title & Description */}
      <div className="space-y-3 mt-4 flex-1">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-5 w-3/5 bg-foreground/[0.08] rounded-md" />
          <Skeleton className="h-5 w-14 bg-foreground/[0.06] rounded-full" />
        </div>
        <Skeleton className="h-3.5 w-full bg-foreground/[0.04] rounded" />
        <Skeleton className="h-3.5 w-4/5 bg-foreground/[0.04] rounded" />
      </div>

      {/* Bottom Row: Token Avatars & Return % */}
      <div className="pt-4 border-t border-border/30 flex items-center justify-between">
        <div className="flex -space-x-2">
          <Skeleton className="size-6 rounded-full bg-foreground/[0.08] border border-surface" />
          <Skeleton className="size-6 rounded-full bg-foreground/[0.07] border border-surface" />
          <Skeleton className="size-6 rounded-full bg-foreground/[0.06] border border-surface" />
        </div>
        <div className="flex flex-col items-end gap-1">
          <Skeleton className="h-2.5 w-12 bg-foreground/[0.04] rounded" />
          <Skeleton className="h-4 w-16 bg-foreground/[0.08] rounded" />
        </div>
      </div>
    </div>
  );
}

export function BasketRowSkeleton({ index = 1 }: { index?: number }) {
  return (
    <div className="flex items-center justify-between gap-3 sm:gap-6 bg-surface px-4 py-3.5 sm:px-6 sm:py-4 border-b border-border/20 animate-pulse">
      {/* Left: Index + Thumb + Titles */}
      <div className="flex items-center gap-3 sm:gap-5 min-w-0 flex-1">
        <span className="w-4 sm:w-5 font-mono text-xs text-muted-foreground/40">{index}</span>
        <Skeleton className="size-11 sm:size-12 rounded-xl bg-white/[0.05] shrink-0" />
        <div className="space-y-2 flex-1 max-w-xs">
          <Skeleton className="h-4 w-3/4 bg-white/[0.08] rounded" />
          <Skeleton className="h-3 w-1/2 bg-white/[0.04] rounded" />
        </div>
      </div>

      {/* Right: Sparkline + Return + Button */}
      <div className="flex items-center gap-4 sm:gap-8 shrink-0">
        <Skeleton className="hidden sm:block w-[140px] h-[38px] rounded-lg bg-white/[0.03]" />
        <div className="flex flex-col items-end gap-1 min-w-[70px]">
          <Skeleton className="h-4 w-14 bg-white/[0.08] rounded" />
          <Skeleton className="h-2.5 w-10 bg-white/[0.03] rounded" />
        </div>
        <Skeleton className="w-16 h-8 rounded-lg bg-white/[0.06]" />
      </div>
    </div>
  );
}

/**
 * Pixel-perfect skeleton matching MarketDetailpage.tsx layout exactly
 * to prevent Cumulative Layout Shift (CLS) on transition.
 */
export function MarketDetailSkeleton() {
  return (
    <main className="page-layout animate-pulse">
      <div className="main-column space-y-6">
        {/* Breadcrumbs */}
        <div className="breadcrumbs">
          <Skeleton className="h-4 w-16 bg-white/[0.06] rounded" />
          <span>/</span>
          <Skeleton className="h-4 w-44 bg-white/[0.08] rounded" />
        </div>

        {/* Hero Card matching .tracker-hero.panel */}
        <section className="tracker-hero panel">
          <Skeleton className="size-20 rounded-2xl bg-white/[0.07] shrink-0" />
          <div className="hero-copy space-y-3 flex-1">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-64 bg-white/[0.09] rounded-lg" />
              <Skeleton className="h-6 w-16 bg-white/[0.06] rounded-full" />
            </div>
            <Skeleton className="h-4 w-44 bg-white/[0.05] rounded" />
            <Skeleton className="h-3.5 w-full max-w-lg bg-white/[0.04] rounded" />
          </div>
          <div className="hero-token-stack">
            <Skeleton className="size-7 rounded-full bg-white/[0.06]" />
            <Skeleton className="size-7 rounded-full bg-white/[0.06]" />
          </div>
        </section>

        {/* Tabs Capsule Bar */}
        <div className="tabs">
          <Skeleton className="h-[34px] w-20 rounded-full bg-[#c5ff4a]/20" />
          <Skeleton className="h-[34px] w-24 rounded-full bg-white/[0.04]" />
          <Skeleton className="h-[34px] w-24 rounded-full bg-white/[0.04]" />
          <Skeleton className="h-[34px] w-16 rounded-full bg-white/[0.04]" />
          <Skeleton className="h-[34px] w-20 rounded-full bg-white/[0.04]" />
        </div>

        {/* Allocation Box matching .allocation.panel */}
        <div className="allocation panel space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div>
              <Skeleton className="h-6 w-28 bg-white/[0.09] rounded" />
              <Skeleton className="h-3.5 w-64 bg-white/[0.04] rounded mt-1.5" />
            </div>
            <Skeleton className="h-7 w-36 rounded-full bg-white/[0.05]" />
          </div>

          <div className="allocation-visual flex items-center gap-8">
            <div className="relative size-[210px] shrink-0 flex items-center justify-center">
              <Skeleton className="size-[210px] rounded-full bg-white/[0.05]" />
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-1">
                <Skeleton className="h-6 w-8 bg-white/[0.1] rounded" />
                <Skeleton className="h-2.5 w-12 bg-white/[0.05] rounded" />
              </div>
            </div>
            <div className="allocation-legend space-y-3 flex-1">
              <Skeleton className="h-4 w-32 bg-white/[0.06] rounded" />
              <Skeleton className="h-4 w-28 bg-white/[0.06] rounded" />
            </div>
          </div>

          {/* Holdings Cards (2 columns matching real ConstituentTokenCards) */}
          <div className="holdings grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {[1, 2].map((i) => (
              <div key={i} className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-7 rounded-full bg-white/[0.08]" />
                    <Skeleton className="h-4 w-14 bg-white/[0.09] rounded" />
                  </div>
                  <Skeleton className="h-5 w-16 bg-white/[0.05] rounded-md" />
                </div>
                <div className="space-y-1 pt-1">
                  <Skeleton className="h-6 w-20 bg-white/[0.09] rounded" />
                  <Skeleton className="h-3 w-16 bg-white/[0.04] rounded" />
                </div>
                <Skeleton className="w-full h-9 rounded-lg bg-white/[0.03]" />
              </div>
            ))}
          </div>
        </div>

        {/* Strategy Rationale Box */}
        <div className="panel p-6 space-y-4">
          <Skeleton className="h-5 w-44 bg-white/[0.09] rounded" />
          <Skeleton className="h-3.5 w-full bg-white/[0.04] rounded" />
          <Skeleton className="h-3.5 w-5/6 bg-white/[0.04] rounded" />
        </div>
      </div>

      {/* Right Sticky Invest Sidebar matching .invest-panel.panel */}
      <aside className="invest-panel panel space-y-5">
        <Skeleton className="h-5 w-20 bg-white/[0.09] rounded" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28 bg-white/[0.05] rounded" />
          <Skeleton className="h-6 w-20 rounded-full bg-white/[0.05]" />
        </div>
        <Skeleton className="w-full h-14 rounded-xl bg-white/[0.04]" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((p) => (
            <Skeleton key={p} className="h-7 flex-1 rounded-lg bg-white/[0.04]" />
          ))}
        </div>
        <div className="space-y-2.5 pt-2">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-20 bg-white/[0.04] rounded" />
            <Skeleton className="h-3 w-16 bg-white/[0.06] rounded" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-3 w-24 bg-white/[0.04] rounded" />
            <Skeleton className="h-3 w-12 bg-white/[0.06] rounded" />
          </div>
        </div>
        <Skeleton className="w-full h-12 rounded-xl bg-white/[0.08]" />
      </aside>
    </main>
  );
}

/**
 * Pixel-perfect skeleton matching Portfolio.tsx layout
 */
export function PortfolioSkeleton() {
  return (
    <div className="space-y-10 animate-pulse">
      {/* Top Header */}
      <section className="border-b border-border/60">
        <div className="container py-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-28 bg-white/[0.06] rounded" />
                <Skeleton className="h-5 w-24 bg-white/[0.08] rounded-full" />
              </div>
              <Skeleton className="h-9 w-44 bg-white/[0.09] rounded-lg" />
              <Skeleton className="h-4 w-80 max-w-full bg-white/[0.04] rounded" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-24 rounded-md bg-white/[0.05]" />
              <Skeleton className="h-9 w-32 rounded-md bg-white/[0.08]" />
            </div>
          </div>

          {/* 4 Big Stat Cards */}
          <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-surface p-6 space-y-2">
                <Skeleton className="h-3 w-20 bg-white/[0.04] rounded" />
                <Skeleton className="h-8 w-28 bg-white/[0.09] rounded" />
                <Skeleton className="h-3 w-16 bg-white/[0.03] rounded" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Body */}
      <div className="container space-y-12">
        {/* Active Holdings Box */}
        <div className="space-y-4">
          <Skeleton className="h-6 w-48 bg-white/[0.08] rounded" />
          <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-xl bg-white/[0.06]" />
                <div className="space-y-1.5">
                  <Skeleton className="h-5 w-40 bg-white/[0.08] rounded" />
                  <Skeleton className="h-3.5 w-24 bg-white/[0.04] rounded" />
                </div>
              </div>
              <Skeleton className="h-8 w-24 rounded-lg bg-white/[0.06]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Skeleton className="h-20 rounded-xl bg-white/[0.03]" />
              <Skeleton className="h-20 rounded-xl bg-white/[0.03]" />
            </div>
          </div>
        </div>

        {/* Token Balances Table */}
        <div className="space-y-4">
          <Skeleton className="h-6 w-36 bg-white/[0.08] rounded" />
          <div className="rounded-2xl border border-border bg-surface divide-y divide-white/5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-8 rounded-full bg-white/[0.06]" />
                  <Skeleton className="h-4 w-20 bg-white/[0.08] rounded" />
                </div>
                <Skeleton className="h-4 w-24 bg-white/[0.06] rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Pixel-perfect skeleton matching Admin.tsx layout
 */
export function AdminSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8 animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32 bg-white/[0.05] rounded" />
          <Skeleton className="h-8 w-64 bg-white/[0.09] rounded-lg" />
          <Skeleton className="h-4 w-96 max-w-full bg-white/[0.04] rounded" />
        </div>
        <Skeleton className="h-10 w-44 rounded-xl bg-white/[0.08]" />
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] space-y-2">
            <Skeleton className="h-3.5 w-24 bg-white/[0.04] rounded" />
            <Skeleton className="h-7 w-32 bg-white/[0.08] rounded" />
          </div>
        ))}
      </div>

      {/* Registry Table */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
        <Skeleton className="h-5 w-44 bg-white/[0.08] rounded" />
        <div className="divide-y divide-white/5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-xl bg-white/[0.06]" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-36 bg-white/[0.08] rounded" />
                  <Skeleton className="h-3 w-20 bg-white/[0.04] rounded" />
                </div>
              </div>
              <Skeleton className="h-6 w-20 rounded-full bg-white/[0.05]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Pixel-perfect skeleton matching CreateBasket.tsx layout
 */
export function CreateBasketSkeleton() {
  return (
    <div className="container py-8 lg:py-12 space-y-8 animate-pulse">
      <Skeleton className="h-4 w-32 bg-white/[0.05] rounded" />
      <div className="space-y-2 pb-2 border-b border-border/40">
        <Skeleton className="h-5 w-48 rounded-full bg-white/[0.05]" />
        <Skeleton className="h-9 w-64 bg-white/[0.09] rounded-lg" />
        <Skeleton className="h-4 w-96 max-w-full bg-white/[0.04] rounded" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
            <Skeleton className="h-6 w-36 bg-white/[0.08] rounded" />
            <Skeleton className="w-full h-11 rounded-xl bg-white/[0.04]" />
            <Skeleton className="w-full h-24 rounded-xl bg-white/[0.04]" />
          </div>
          <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
            <Skeleton className="h-6 w-44 bg-white/[0.08] rounded" />
            <div className="space-y-3">
              <Skeleton className="w-full h-16 rounded-xl bg-white/[0.04]" />
              <Skeleton className="w-full h-16 rounded-xl bg-white/[0.04]" />
            </div>
          </div>
        </div>
        <div className="lg:col-span-5 space-y-4">
          <Skeleton className="h-5 w-32 bg-white/[0.06] rounded" />
          <Skeleton className="w-full h-[380px] rounded-2xl bg-white/[0.04]" />
        </div>
      </div>
    </div>
  );
}
