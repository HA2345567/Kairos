import type { ReactNode } from "react";
import ArrowUpRight from "lucide-react/dist/esm/icons/arrow-up-right";
import BookOpen from "lucide-react/dist/esm/icons/book-open";
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check";
import CircleAlert from "lucide-react/dist/esm/icons/circle-alert";
import Code2 from "lucide-react/dist/esm/icons/code-2";
import Database from "lucide-react/dist/esm/icons/database";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import Layers from "lucide-react/dist/esm/icons/layers";
import LockKeyhole from "lucide-react/dist/esm/icons/lock-keyhole";
import Server from "lucide-react/dist/esm/icons/server";
import Wallet from "lucide-react/dist/esm/icons/wallet";
import { Link } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture" },
  { id: "execution", label: "Execution lifecycle" },
  { id: "catalog", label: "Catalog and baskets" },
  { id: "markets", label: "Markets and data" },
  { id: "api", label: "API surface" },
  { id: "persistence", label: "Persistence and workers" },
  { id: "development", label: "Local development" },
  { id: "configuration", label: "Configuration" },
  { id: "security", label: "Security model" },
  { id: "release-status", label: "Release status" },
  { id: "operations", label: "Operations and troubleshooting" },
  { id: "references", label: "References" },
];

const API_GROUPS = [
  { group: "Identity", routes: "POST /v1/auth/nonce · /verify · /refresh · /logout; GET /v1/auth/session" },
  { group: "Catalog", routes: "GET /v1/tokens · /v1/baskets · /v1/baskets/:slug and basket market, NAV, performance, registry, and annotation resources" },
  { group: "Trading", routes: "POST /v1/quotes · /v1/positions/prepare · /v1/positions/submit; execution status, retry, unwind, rebalance, and close resources" },
  { group: "Portfolio", routes: "GET /v1/positions · /v1/positions/:id · /v1/executions" },
  { group: "Labs and agents", routes: "Basket ideas, votes, comments, POST /v1/agent/compose-basket, and POST /v1/agent/simulate-graph" },
  { group: "Operations", routes: "GET /health · /healthz · /v1/config; notifications and event-snapshot stream resources" },
  { group: "Admin", routes: "Publishing proposals, token/basket controls, kill switch, eligibility, audit, fees, metrics, and relayer status" },
];

const CONFIG_GROUPS = [
  { name: "Runtime and network", keys: "PORT, HOST, SOLANA_NETWORK, SOLANA_RPC_URL, SOLANA_FALLBACK_RPC_URL" },
  { name: "Persistence", keys: "DATABASE_URL, KAIROS_DB_SCHEMA, KAIROS_DATA_DIR" },
  { name: "Signing and sessions", keys: "RELAYER_KEYPAIR, JWT_SECRET, KAIROS_ROUTER_PROGRAM_ID" },
  { name: "Pricing and composition", keys: "PYTH_API_KEY, PYTH_FEEDS_JSON, PYTH_HERMES_URL, PYTH_POLL_MS, PYTH_MAX_AGE_SEC, NVIDIA_NIM_API_KEY, NVIDIA_NIM_MODEL" },
  { name: "Fees and policy", keys: "PLATFORM_FEE_BPS, REBALANCE_FEE_BPS, MIN_LIQUIDITY_USD, RESTRICTED_REGIONS, AUDIT_RETENTION_DAYS" },
  { name: "Admin", keys: "ADMIN_TOKEN, ADMIN_ACTOR_ID, ADMIN_APPROVER_TOKEN, ADMIN_APPROVER_ID" },
  { name: "Client", keys: "VITE_API_URL, VITE_SOLANA_RPC_URL, VITE_PRIVY_APP_ID (public app ID only)" },
];

function DocSection({ id, title, eyebrow, children }: { id: string; title: string; eyebrow?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-b border-white/[0.08] py-10 first:pt-0 sm:py-12">
      {eyebrow && <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#14F195]">{eyebrow}</p>}
      <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h2>
      <div className="mt-5 space-y-4 text-sm leading-7 text-muted-foreground sm:text-[15px]">{children}</div>
    </section>
  );
}

function Callout({ kind = "note", title, children }: { kind?: "note" | "warning"; title: string; children: ReactNode }) {
  const warning = kind === "warning";
  const Icon = warning ? CircleAlert : CheckCircle2;
  return (
    <aside className={`my-5 flex gap-3 rounded-2xl border p-4 sm:p-5 ${warning ? "border-amber-300/20 bg-amber-300/[0.045]" : "border-[#14F195]/15 bg-[#14F195]/[0.035]"}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${warning ? "text-amber-200" : "text-[#14F195]"}`} aria-hidden="true" />
      <div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        <div className="mt-1 text-xs leading-6 text-muted-foreground sm:text-sm">{children}</div>
      </div>
    </aside>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  return <pre className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#101211] p-4 font-mono text-xs leading-6 text-white/75 sm:p-5"><code>{children}</code></pre>;
}

export default function DocsPage() {
  return (
    <PageShell hideFooter={false} contentTag="div">
        <main id="top" className="relative isolate min-h-[70vh] overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(ellipse_at_50%_0%,rgba(20,241,149,0.075),transparent_62%)]" />

        <header className="border-b border-white/[0.07]">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
              <BookOpen className="size-3.5 text-[#14F195]" aria-hidden="true" /> Kairos documentation
              <span className="mx-1 h-3 w-px bg-white/15" />
              <span className="rounded-full border border-[#14F195]/20 bg-[#14F195]/[0.06] px-2.5 py-1 text-[#14F195]">Solana devnet</span>
            </div>
            <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <h1 className="max-w-4xl font-display text-4xl font-semibold leading-[1.04] tracking-[-0.05em] text-foreground sm:text-5xl lg:text-6xl">
                  Build with the system.<br className="hidden sm:block" /> Understand its boundaries.
                </h1>
                <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Product, architecture, local development, API boundaries, transaction safety, and the release limitations of Kairos—all in one maintained guide.
                </p>
              </div>
              <Link to="/" className="inline-flex h-10 items-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.035] px-4 text-xs font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/[0.07] lg:self-end">
                Back to Kairos <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-2">
              {[
                { icon: Layers, label: "React · Vite · TypeScript" },
                { icon: Server, label: "Bun API and workers" },
                { icon: Database, label: "PostgreSQL" },
                { icon: Wallet, label: "Wallet-signed Solana" },
              ].map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[11px] font-medium text-white/55">
                  <Icon className="size-3.5 text-white/35" aria-hidden="true" /> {label}
                </span>
              ))}
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14 lg:px-8 lg:py-14">
          <aside className="lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)] lg:self-start">
            <p className="hidden px-3 pb-3 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-white/30 lg:block">On this page</p>
            <nav aria-label="Documentation sections" className="flex gap-1 overflow-x-auto pb-2 lg:block lg:space-y-0.5 lg:overflow-visible lg:pb-0">
              {SECTIONS.map((section) => (
                <a key={section.id} href={`#${section.id}`} className="block shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-white/50 transition hover:bg-white/[0.045] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14F195] lg:py-2.5">
                  {section.label}
                </a>
              ))}
              <a href="#references" className="mt-4 hidden items-center gap-2 border-t border-white/[0.08] px-3 pt-4 text-xs text-white/40 transition hover:text-white lg:flex">
                <ExternalLink className="size-3.5" aria-hidden="true" /> Source documents
              </a>
            </nav>
          </aside>

          <article className="min-w-0 max-w-4xl">
            <DocSection id="overview" title="Overview" eyebrow="01 · Product contract">
              <p>Kairos is a non-custodial thematic basket application for Solana. Investors select a published basket, review a quote and its data provenance, approve transaction(s) in their wallet, and receive constituent SPL tokens in their own token accounts when execution succeeds.</p>
              <p>The browser provides the product UI and wallet boundary. The API validates requests and coordinates execution. PostgreSQL records Kairos workflow state; Solana account and transaction state remains authoritative for token ownership and settlement.</p>
              <Callout title="Release scope: devnet only">
                Mainnet is not a supported deployment target. A successful local build or test run is not evidence of a live devnet transaction, production readiness, or investment performance.
              </Callout>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/35">Asset custody</p><p className="mt-2 text-sm font-semibold text-foreground">Investor wallet</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Kairos stores workflow records; it is not the investor’s wallet or source of token balances.</p></div>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/35">System shape</p><p className="mt-2 text-sm font-semibold text-foreground">Modular monolith</p><p className="mt-1 text-xs leading-5 text-muted-foreground">One TypeScript backend codebase with independently runnable API and worker roles.</p></div>
              </div>
            </DocSection>

            <DocSection id="architecture" title="Architecture" eyebrow="02 · System boundaries">
              <p>The current design keeps the API, domain services, and worker processes in a modular backend. Provider adapters isolate database, price, and Solana integrations. The web client calls the API through typed clients and delegates signing to the connected wallet.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { title: "Web client", icon: Layers, body: "React 18 + Vite SPA. Catalog, markets, basket detail, Labs, portfolio, admin, and wallet interaction." },
                  { title: "API and domain", icon: Code2, body: "Bun + TypeScript HTTP server. Routes handle transport; services own quote, execution, recovery, catalog, and portfolio rules." },
                  { title: "Durable state", icon: Database, body: "PostgreSQL stores identity/session state, catalog versions, quotes, executions, legs, positions, jobs, audit, and outbox records." },
                  { title: "Settlement and providers", icon: Wallet, body: "Solana devnet RPC, Anchor router, SPL token programs, configured swap builder, and optional Pyth Hermes snapshots." },
                ].map(({ title, icon: Icon, body }) => (
                  <div key={title} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
                    <Icon className="size-4 text-[#14F195]" aria-hidden="true" />
                    <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
                    <p className="mt-1.5 text-xs leading-6 text-muted-foreground">{body}</p>
                  </div>
                ))}
              </div>
              <details className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101211]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold text-white/70 marker:hidden sm:px-5">
                  View the full system architecture diagram
                  <span className="text-[#14F195] transition group-open:rotate-90">›</span>
                </summary>
                <div className="border-t border-white/[0.08] p-2 sm:p-4">
                  <img src="/docs/kairos-architecture-diagram.png" alt="Kairos architecture: users, web client, modular API, domain services, PostgreSQL, workers, providers, and Solana devnet" loading="lazy" className="mx-auto h-auto max-h-[1100px] w-full rounded-xl object-contain object-top" />
                </div>
              </details>
              <p className="text-xs text-white/40">Repository map: <code>frontend/src</code> · <code>backend/src/routes</code> · <code>backend/src/services</code> · <code>backend/src/db</code> · <code>backend/src/chain</code> · <code>backend/src/workers</code> · <code>programs/kairos-router</code>.</p>
            </DocSection>

            <DocSection id="execution" title="Execution lifecycle" eyebrow="03 · Prepare to settlement">
              <p>Execution is a durable state machine, not a front-end-only modal. A quote is time-bound, and the API binds the prepared transaction to its wallet, basket version, message hash, and idempotency key.</p>
              <ol className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Prepare", "The API validates the basket and quote, builds and simulates transaction(s), and persists the execution before returning the wallet-readable preview."],
                  ["Sign", "The user reviews the transaction(s) and signs with the connected wallet. Depending on wallet support and leg count, signing may require one or more wallet approvals."],
                  ["Submit", "The client sends signed bytes with the execution ID. The API verifies the prepared message, required signer, expiry, authorization, and idempotency before queuing work."],
                  ["Land", "A worker broadcasts the stored signed bytes, checks signature history, confirms each leg, and records receipt-derived outputs and fees."],
                ].map(([title, body], index) => (
                  <li key={title} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
                    <p className="font-mono text-[10px] font-semibold tracking-[0.15em] text-[#14F195]">0{index + 1} / {title.toUpperCase()}</p>
                    <p className="mt-2 text-xs leading-6 text-muted-foreground">{body}</p>
                  </li>
                ))}
              </ol>
              <p>Execution states: <code>PREPARED → SUBMITTED → LANDING → COMPLETED</code>, with terminal outcomes <code>PARTIALLY_COMPLETED</code>, <code>FAILED</code>, or <code>EXPIRED</code> where appropriate. The status UI reports each leg; a quote estimate is never substituted for a missing confirmed receipt.</p>
              <Callout kind="warning" title="Partial completion is explicit">
                A multi-leg execution can complete only some legs. Retry and unwind are separate wallet-authorized recovery executions; never assume a failed leg moved funds or that a submitted transaction can be cancelled.
              </Callout>
            </DocSection>

            <DocSection id="catalog" title="Catalog and basket lifecycle" eyebrow="04 · Data integrity">
              <ul className="list-disc space-y-2 pl-5 marker:text-[#14F195]">
                <li>A basket is a named strategy with one or more versioned token allocations.</li>
                <li>Published versions are append-only; edits produce a new version rather than mutating the historical composition.</li>
                <li>Allocation weights use integer basis points and must sum to <code>10,000</code> (100%).</li>
                <li>Catalog and quote paths validate token status and configured allowlists; execution inputs are revalidated server-side.</li>
                <li>Admin publishing and operational controls are separate API actions, with audit records and dual-approver settings for publish flows.</li>
              </ul>
              <p>For user-submitted Labs ideas, treat titles, descriptions, and allocations as untrusted input. A community idea is not automatically a verified or tradable catalog basket.</p>
            </DocSection>

            <DocSection id="markets" title="Markets, pricing, and performance data" eyebrow="05 · Provenance first">
              <p>Price and history are provider data, not settlement truth. When configured, the backend can ingest Pyth Hermes snapshots for explicitly mapped mint/feed pairs. Registry or seeded devnet values are distinct fallback data and must remain labelled as such.</p>
              <ul className="list-disc space-y-2 pl-5 marker:text-[#14F195]">
                <li>Execution quotes must use fresh, supported inputs; stale or unavailable market data should block unsafe quote paths.</li>
                <li>Market and NAV history may be incomplete. The UI should show source and freshness status and must not fabricate missing periods.</li>
                <li>Backtests and simulated returns are hypothetical, not realized investor returns or a promise of future performance.</li>
                <li>Price impact may be unavailable when the selected route or pool cannot provide a verified estimate.</li>
              </ul>
              <Callout title="Data labels are part of the contract">
                Keep timestamps, source, and hypothetical/devnet labels attached to displayed data. Do not convert registry defaults or demo values into “live price” claims.
              </Callout>
            </DocSection>

            <DocSection id="api" title="API surface" eyebrow="06 · Backend contracts">
              <p>The API is implemented as a custom TypeScript HTTP server under <code>backend/src</code>. The list below groups the current route surface by responsibility; the route handlers and typed frontend client are the source of truth for request and response schemas.</p>
              <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-white/[0.04] text-[9px] uppercase tracking-[0.16em] text-white/40"><tr><th className="px-4 py-3 font-semibold">Area</th><th className="px-4 py-3 font-semibold">Routes and responsibilities</th></tr></thead>
                  <tbody>{API_GROUPS.map((item) => <tr key={item.group} className="border-t border-white/[0.07] align-top"><th scope="row" className="whitespace-nowrap px-4 py-3 font-semibold text-white/75">{item.group}</th><td className="px-4 py-3 leading-6 text-muted-foreground">{item.routes}</td></tr>)}</tbody>
                </table>
              </div>
              <p>Every API response uses the current route contract. Use <code>X-Request-Id</code> for support correlation and the API’s documented <code>Idempotency-Key</code> behavior for money-changing requests. Do not retry an execution with a new key until you have checked its durable status.</p>
            </DocSection>

            <DocSection id="persistence" title="Persistence and background workers" eyebrow="07 · Reliability">
              <p>PostgreSQL is the system of record for Kairos workflow state. The database is not the authority for wallet balances; confirmed Solana account and receipt observations are used to reconcile positions.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><h3 className="text-sm font-semibold text-foreground">Persisted domains</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">Wallet sessions, eligibility, tokens, basket versions, quotes, executions and legs, positions, recovery reservations, fee ledger, jobs, audit log, settings, notifications outbox, and Labs records.</p></div>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><h3 className="text-sm font-semibold text-foreground">Worker lanes</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">Landing and confirmation, portfolio reconciliation, Pyth price snapshots, and outbox delivery. Jobs use database-backed leases and retry state rather than an external queue broker.</p></div>
              </div>
              <p>API startup applies database migrations before serving traffic. A read-only API mode disables background workers and refuses unsafe mutations. Worker replicas must preserve lease/idempotency behavior; they are not independent sources of execution truth.</p>
            </DocSection>

            <DocSection id="development" title="Local development" eyebrow="08 · Get running">
              <p>Use the pinned Bun version from <code>.bun-version</code>. Rust, Solana CLI, and Anchor are only needed for on-chain program workflows; Docker is optional for local UI/API work.</p>
              <CodeBlock>{`bun --version
bun install --frozen-lockfile

# Copy templates; fill in local values where needed.
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Terminal 1
bun run start:backend

# Terminal 2
bun run start:frontend`}</CodeBlock>
              <p>Set a valid <code>DATABASE_URL</code>, base58-encoded 64-byte <code>RELAYER_KEYPAIR</code>, and a random <code>JWT_SECRET</code> of at least 32 bytes in <code>backend/.env</code> before starting the API. The frontend Vite proxy forwards API and health paths to the backend in local development.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><p className="text-xs font-semibold text-foreground">Local checks</p><code className="mt-2 block text-xs text-[#14F195]">make test<br />bun run build</code></div>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><p className="text-xs font-semibold text-foreground">Health endpoints</p><code className="mt-2 block text-xs text-[#14F195]">GET /health<br />GET /healthz</code></div>
              </div>
              <p>Offline tests use PGlite and do not prove live RPC, pool, relayer, or router behavior. For the demo seed and devnet setup commands, see the root README and <code>backend/scripts/devnet-setup.ts</code>.</p>
            </DocSection>

            <DocSection id="configuration" title="Configuration and secrets" eyebrow="09 · Environment">
              <p>Use <code>backend/.env.example</code> and <code>frontend/.env.example</code> as the exhaustive, versioned templates. Keep real environment files out of Git. The backend loads server secrets; only intentionally public <code>VITE_*</code> values may enter the browser bundle.</p>
              <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-white/[0.04] text-[9px] uppercase tracking-[0.16em] text-white/40"><tr><th className="px-4 py-3 font-semibold">Configuration area</th><th className="px-4 py-3 font-semibold">Variables to review</th></tr></thead>
                  <tbody>{CONFIG_GROUPS.map((item) => <tr key={item.name} className="border-t border-white/[0.07] align-top"><th scope="row" className="whitespace-nowrap px-4 py-3 font-semibold text-white/75">{item.name}</th><td className="px-4 py-3 leading-6 text-muted-foreground">{item.keys}</td></tr>)}</tbody>
                </table>
              </div>
              <Callout kind="warning" title="Never expose backend credentials in the SPA">
                Do not put <code>PRIVY_APP_SECRET</code>, <code>RELAYER_KEYPAIR</code>, database credentials, admin tokens, or <code>JWT_SECRET</code> in <code>VITE_*</code> variables, committed files, Docker build arguments, browser storage, or logs. Rotate any credential that has been exposed.
              </Callout>
            </DocSection>

            <DocSection id="security" title="Security model" eyebrow="10 · Trust and authority">
              <ul className="list-disc space-y-2 pl-5 marker:text-[#14F195]">
                <li><strong className="text-foreground">Wallet boundary:</strong> wallet adapters hold user signing keys; the API receives signatures/transaction bytes, not seed phrases.</li>
                <li><strong className="text-foreground">Transaction validation:</strong> quote expiry, wallet, prepared message, signer, configured program/mint allowlists, and idempotency are checked before execution is queued.</li>
                <li><strong className="text-foreground">Relayer boundary:</strong> <code>RELAYER_KEYPAIR</code> is a server-side operational secret. Fund it only for the configured role and monitor its balance.</li>
                <li><strong className="text-foreground">Admin boundary:</strong> admin APIs require configured credentials; publishing uses distinct approver credentials when enabled. Do not expose the admin console publicly without deployment-level access controls.</li>
                <li><strong className="text-foreground">Emergency controls:</strong> the kill switch blocks configured buy-side paths while safe exit paths remain available according to service policy.</li>
                <li><strong className="text-foreground">Data handling:</strong> treat wallet addresses, user content, RPC results, and provider data as sensitive or untrusted input; avoid logging secrets or full signed payloads.</li>
              </ul>
              <p>These controls reduce specific application risks; they do not constitute a third-party audit, mainnet security certification, or guarantee against wallet, provider, RPC, or smart-contract failure.</p>
            </DocSection>

            <DocSection id="release-status" title="Release status and supported behavior" eyebrow="11 · Audit notes">
              <p>The latest checked-in coverage review is <code>docs/PRD_V4_COVERAGE_AUDIT.md</code> (audit date 2026-10-18). Read it alongside the code before using any capability as a release claim; requirements can be partial even when code paths and local tests exist.</p>
              <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-white/[0.04] text-[9px] uppercase tracking-[0.16em] text-white/40"><tr><th className="px-4 py-3 font-semibold">Area</th><th className="px-4 py-3 font-semibold">Documented boundary</th></tr></thead>
                  <tbody>
                    <tr className="border-t border-white/[0.07] align-top"><th className="px-4 py-3 font-semibold text-white/75">Network</th><td className="px-4 py-3 leading-6 text-muted-foreground">Devnet is the only supported release target. No mainnet acceptance is claimed.</td></tr>
                    <tr className="border-t border-white/[0.07] align-top"><th className="px-4 py-3 font-semibold text-white/75">Live settlement</th><td className="px-4 py-3 leading-6 text-muted-foreground">The checked-in audit records no live devnet acceptance run; relayer funding, router deployment/initialization, pools, RPC, and operator signing are external prerequisites.</td></tr>
                    <tr className="border-t border-white/[0.07] align-top"><th className="px-4 py-3 font-semibold text-white/75">Wallets</th><td className="px-4 py-3 leading-6 text-muted-foreground">Phantom, Solflare, and Backpack adapters are registered. The embedded-wallet provider is an injectable seam; the Privy runtime is not registered by the current app entrypoint.</td></tr>
                    <tr className="border-t border-white/[0.07] align-top"><th className="px-4 py-3 font-semibold text-white/75">Prices</th><td className="px-4 py-3 leading-6 text-muted-foreground">Pyth needs an API key and explicit feed mapping. Without configured feeds, the UI must preserve source/fallback status and avoid claiming verified live history.</td></tr>
                    <tr className="border-t border-white/[0.07] align-top"><th className="px-4 py-3 font-semibold text-white/75">Labs and analytics</th><td className="px-4 py-3 leading-6 text-muted-foreground">Ideas, simulation, and chart surfaces can include hypothetical or incomplete data; they are not investment advice or proven performance records.</td></tr>
                  </tbody>
                </table>
              </div>
            </DocSection>

            <DocSection id="operations" title="Operations and troubleshooting" eyebrow="12 · Run safely">
              <div className="space-y-3">
                {[
                  ["API does not start", "Check that the example values were replaced, DATABASE_URL is reachable, RELAYER_KEYPAIR decodes to a 64-byte base58 secret key, and JWT_SECRET has at least 32 bytes."],
                  ["Devnet catalog is missing", "The API logs when backend/data/devnet-state.json is absent. Run the backend setup and seed scripts with funded devnet operator prerequisites; read routes may still work with fallback registry data."],
                  ["Prepare returns a service error", "Check GET /healthz for cluster, initialized state, Pyth feed count, relayer funding, and kill-switch state. Also inspect the response code and X-Request-Id; do not bypass the server-side gate."],
                  ["Execution appears stuck", "Use the execution ID and per-leg status. Check the corresponding Solana signature history before retrying; use the application’s retry/unwind flow so idempotency and recovery ancestry remain intact."],
                  ["Price chart has gaps", "Check configured PYTH_FEEDS_JSON, feed age limits, provider availability, and the displayed source label. Missing history is an explicit unavailable-data state, not zero return."],
                ].map(([title, body]) => (
                  <details key={title} className="group rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 sm:px-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-foreground marker:hidden">{title}<span className="text-[#14F195] transition group-open:rotate-90">›</span></summary>
                    <p className="mt-3 border-t border-white/[0.07] pt-3 text-xs leading-6 text-muted-foreground">{body}</p>
                  </details>
                ))}
              </div>
              <p>Operational truth comes from health endpoints and current worker/database/RPC state. A green local build is not a deployment health check.</p>
            </DocSection>

            <DocSection id="references" title="References and ownership" eyebrow="13 · Sources of truth">
              <p>When these docs disagree, prefer the current implementation for what runs, the PRD for intended product requirements, and the coverage audit for the last recorded gap assessment. Reconcile discrepancies rather than silently treating planned behavior as shipped.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["Product contract", "docs/PRD_V4.md", "Scope, requirements, invariants, and acceptance criteria."],
                  ["System architecture", "docs/ARCHITECTURE.md", "Containers, boundaries, critical flows, reliability, and security decisions."],
                  ["Coverage audit", "docs/PRD_V4_COVERAGE_AUDIT.md", "Implementation coverage, known gaps, and devnet acceptance status."],
                  ["Backend delivery", "docs/BACKEND_DELIVERY.md", "Backend implementation notes and current delivery status."],
                  ["Configuration templates", "backend/.env.example and frontend/.env.example", "Versioned environment templates; secrets must remain server-side."],
                ].map(([title, path, description]) => (
                  <div key={title} className="flex items-start gap-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
                    <span className="min-w-0"><span className="block text-xs font-semibold text-foreground">{title}</span><span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{description}</span><code className="mt-2 block break-all text-[10px] text-white/35">{path}</code></span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-xs text-white/45">
                <LockKeyhole className="size-4 shrink-0 text-[#14F195]" aria-hidden="true" />
                Documentation is maintained with the code. Re-check setup and release status after changing providers, program IDs, fee policy, or wallet integrations.
              </div>
            </DocSection>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-8 text-[11px] text-white/35">
              <span>Kairos developer documentation · Solana devnet scope</span>
              <a href="#top" className="inline-flex items-center gap-1.5 transition hover:text-white/70">Back to top <ArrowUpRight className="size-3" aria-hidden="true" /></a>
            </div>
          </article>
        </div>
      </main>
    </PageShell>
  );
}
