import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Layers, RefreshCw, Settings, ShieldCheck } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { AdminSkeleton } from "@/components/basket/BasketSkeleton";
import { useBaskets } from "@/lib/baskets-data";
import { kairosApi } from "@/lib/api-client";
import type { BasketPublishProposal, TokenRegistryItem } from "@/lib/api-types";

type Notice = { text: string; error: boolean };
type SignedPublish = { transaction: string; admin: string; approval: string; lastValidBlockHeight: number };

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export default function AdminPage() {
  const { publicKey, signTransaction } = useWallet();
  const { data: baskets = [] } = useBaskets();
  const { data: tokenRegistry } = useQuery({ queryKey: ["admin-token-registry"], queryFn: () => kairosApi.getTokens() });
  const registryTokens = tokenRegistry?.tokens ?? [];
  const [adminToken, setAdminToken] = useState("");
  const [approverToken, setApproverToken] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [proposals, setProposals] = useState<BasketPublishProposal[]>([]);
  const [approvalWallets, setApprovalWallets] = useState<Record<string, string>>({});
  const [signedPublishes, setSignedPublishes] = useState<Record<string, SignedPublish>>({});
  const [handoffTransactions, setHandoffTransactions] = useState<Record<string, string>>({});
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [draftLegs, setDraftLegs] = useState<Record<string, Array<{ mint: string; weightBps: number }>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const { data: health, isLoading } = useQuery({
    queryKey: ["server-health"],
    queryFn: () => kairosApi.health(),
    refetchInterval: 15_000,
  });

  const loadProposals = async () => {
    setBusy("queue");
    try {
      const { proposals } = await kairosApi.getBasketPublishProposals(approverToken);
      setProposals(proposals);
      setNotice({ text: `${proposals.length} pending proposal${proposals.length === 1 ? "" : "s"}.`, error: false });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Could not load proposals.", error: true });
    } finally {
      setBusy(null);
    }
  };

  const proposeVersion = async (basket: (typeof baskets)[number]) => {
    setBusy(basket.slug);
    try {
      const current = await kairosApi.getBasketBySlug(basket.slug);
      if (!current.activeVersion) throw new Error("Basket has no published composition.");
      const rationale = rationales[basket.slug]?.trim();
      if (!rationale) throw new Error("Add a rationale before proposing this version.");
      const draft = draftLegs[basket.slug];
      const legs = (draft ?? current.activeVersion.legs).map((leg) => {
        const currentLeg = current.activeVersion!.legs.find((item) => item.mint === leg.mint);
        const token = registryTokens.find((item) => item.mint === leg.mint);
        return {
          mint: leg.mint,
          weightBps: weights[`${basket.slug}:${leg.mint}`] ?? leg.weightBps,
          legType: currentLeg?.legType ?? token?.type ?? "spl",
          venueHint: currentLeg?.venueHint ?? "Kairos Router",
          slippageBps: currentLeg?.slippageBps ?? 50,
        };
      });
      if (legs.reduce((sum, leg) => sum + leg.weightBps, 0) !== 10_000) {
        throw new Error("Weights must total exactly 10,000 bps.");
      }
      const { proposal } = await kairosApi.proposeBasketVersion(
        basket.slug,
        current.activeVersion.version + 1,
        rationale,
        legs,
        adminToken
      );
      setProposals((current) => [proposal, ...current.filter((item) => item.id !== proposal.id)]);
      setNotice({ text: `Version ${current.activeVersion.version + 1} proposed for ${basket.name}.`, error: false });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Could not create proposal.", error: true });
    } finally {
      setBusy(null);
    }
  };

  const loadInfrastructureReferenceMix = (basket: (typeof baskets)[number]) => {
    const target = [
      ["CLOUD", 1060], ["BP", 1000], ["JUP", 900], ["JitoSOL", 800],
      ["SOL", 800], ["mSOL", 800], ["KMNO", 800], ["RAY", 800],
      ["ORCA", 800], ["MET", 800], ["ARX", 800], ["JTO", 640],
    ] as const;
    const bySymbol = new Map(registryTokens.map((token) => [
      token.symbol.replace(/^t(?=[A-Z])/, "").toUpperCase(), token,
    ]));
    const missing = target.map(([symbol]) => symbol).filter((symbol) => !bySymbol.has(symbol.toUpperCase()));
    if (missing.length) {
      setNotice({ text: `Token registry is missing: ${missing.join(", ")}. Run the devnet asset setup and refresh this page.`, error: true });
      return;
    }
    const next = target.map(([symbol, weightBps]) => ({ mint: bySymbol.get(symbol.toUpperCase())!.mint, weightBps }));
    setDraftLegs((current) => ({ ...current, [basket.slug]: next }));
    setWeights((current) => {
      const updated = { ...current };
      next.forEach((leg) => { updated[`${basket.slug}:${leg.mint}`] = leg.weightBps; });
      return updated;
    });
    setRationales((current) => ({
      ...current,
      [basket.slug]: "Expanded Solana Infrastructure to the requested 12-asset mix with the reference weights.",
    }));
    setNotice({ text: "Loaded all 12 requested assets and their reference allocations.", error: false });
  };

  const loadSigmaReferenceMix = (basket: (typeof baskets)[number]) => {
    const target = [["PYTH", 3500], ["JUP", 2500], ["KMNO", 2000], ["RENDER", 2000]] as const;
    const bySymbol = new Map(registryTokens.map((token) => [
      token.symbol.replace(/^t(?=[A-Z])/, "").toUpperCase(), token,
    ]));
    const missing = target.map(([symbol]) => symbol).filter((symbol) => !bySymbol.has(symbol));
    if (missing.length) {
      setNotice({ text: `Token registry is missing: ${missing.join(", ")}. Run the devnet asset setup and refresh this page.`, error: true });
      return;
    }
    const next = target.map(([symbol, weightBps]) => ({ mint: bySymbol.get(symbol)!.mint, weightBps }));
    setDraftLegs((current) => ({ ...current, [basket.slug]: next }));
    setWeights((current) => {
      const updated = { ...current };
      next.forEach((leg) => { updated[`${basket.slug}:${leg.mint}`] = leg.weightBps; });
      return updated;
    });
    setRationales((current) => ({
      ...current,
      [basket.slug]: "Set Solana Sigma to the requested PYTH, JUP, KMNO, and RENDER allocation mix.",
    }));
    setNotice({ text: "Loaded the requested Solana Sigma assets and allocations. Propose the version to start the existing approval flow.", error: false });
  };

  const loadCultureReferenceMix = (basket: (typeof baskets)[number]) => {
    const target = [["BONK", 3600], ["TRUMP", 2700], ["PENGU", 2700], ["WIF", 500], ["FARTCOIN", 500]] as const;
    const bySymbol = new Map(registryTokens.map((token) => [
      token.symbol.replace(/^t(?=[A-Z])/, "").toUpperCase(), token,
    ]));
    const missing = target.map(([symbol]) => symbol).filter((symbol) => !bySymbol.has(symbol));
    if (missing.length) {
      setNotice({ text: `Token registry is missing: ${missing.join(", ")}. Run the devnet asset setup and refresh this page.`, error: true });
      return;
    }
    const next = target.map(([symbol, weightBps]) => ({ mint: bySymbol.get(symbol)!.mint, weightBps }));
    setDraftLegs((current) => ({ ...current, [basket.slug]: next }));
    setWeights((current) => {
      const updated = { ...current };
      next.forEach((leg) => { updated[`${basket.slug}:${leg.mint}`] = leg.weightBps; });
      return updated;
    });
    setRationales((current) => ({
      ...current,
      [basket.slug]: "Expanded Solana Culture & Memes with BONK, TRUMP, PENGU, WIF, and FARTCOIN.",
    }));
    setNotice({ text: "Loaded the requested culture tokens and additional Solana meme assets. Propose the version to start the approval flow.", error: false });
  };

  const loadAiComputeMix = (basket: (typeof baskets)[number]) => {
    const target = [["RENDER", 2500], ["NOS", 2500], ["IO", 2500], ["ARX", 2500]] as const;
    const bySymbol = new Map(registryTokens.map((token) => [
      token.symbol.replace(/^t(?=[A-Z])/, "").toUpperCase(), token,
    ]));
    const missing = target.map(([symbol]) => symbol).filter((symbol) => !bySymbol.has(symbol));
    if (missing.length) {
      setNotice({ text: `Token registry is missing: ${missing.join(", ")}. Run the devnet asset setup and refresh this page.`, error: true });
      return;
    }
    const next = target.map(([symbol, weightBps]) => ({ mint: bySymbol.get(symbol)!.mint, weightBps }));
    setDraftLegs((current) => ({ ...current, [basket.slug]: next }));
    setWeights((current) => {
      const updated = { ...current };
      next.forEach((leg) => { updated[`${basket.slug}:${leg.mint}`] = leg.weightBps; });
      return updated;
    });
    setRationales((current) => ({
      ...current,
      [basket.slug]: "Added Nosana and io.net compute networks alongside Render and Arcium.",
    }));
    setNotice({ text: "Loaded the Solana AI & Compute mix. Propose the version to start the approval flow.", error: false });
  };

  const loadDepinMix = (basket: (typeof baskets)[number]) => {
    const target = [["HNT", 2000], ["MOBILE", 2000], ["IOT", 2000], ["HONEY", 2000], ["RENDER", 2000]] as const;
    const bySymbol = new Map(registryTokens.map((token) => [
      token.symbol.replace(/^t(?=[A-Z])/, "").toUpperCase(), token,
    ]));
    const missing = target.map(([symbol]) => symbol).filter((symbol) => !bySymbol.has(symbol));
    if (missing.length) {
      setNotice({ text: `Token registry is missing: ${missing.join(", ")}. Run the devnet asset setup and refresh this page.`, error: true });
      return;
    }
    const next = target.map(([symbol, weightBps]) => ({ mint: bySymbol.get(symbol)!.mint, weightBps }));
    setDraftLegs((current) => ({ ...current, [basket.slug]: next }));
    setWeights((current) => {
      const updated = { ...current };
      next.forEach((leg) => { updated[`${basket.slug}:${leg.mint}`] = leg.weightBps; });
      return updated;
    });
    setRationales((current) => ({
      ...current,
      [basket.slug]: "Expanded Solana DePIN coverage across Helium, Hivemapper, and Render Network infrastructure.",
    }));
    setNotice({ text: "Loaded the researched Solana DePIN mix. Propose the version to start the approval flow.", error: false });
  };

  const loadRwaMix = (basket: (typeof baskets)[number]) => {
    const target = [["USDY", 2000], ["OUSG", 2000], ["BUIDL", 2000], ["SPYX", 2000], ["XAUM", 2000]] as const;
    const bySymbol = new Map(registryTokens.map((token) => [
      token.symbol.replace(/^t(?=[A-Z])/, "").toUpperCase(), token,
    ]));
    const missing = target.map(([symbol]) => symbol).filter((symbol) => !bySymbol.has(symbol));
    if (missing.length) {
      setNotice({ text: `Token registry is missing: ${missing.join(", ")}. Run the devnet asset setup and refresh this page.`, error: true });
      return;
    }
    const next = target.map(([symbol, weightBps]) => ({ mint: bySymbol.get(symbol)!.mint, weightBps }));
    setDraftLegs((current) => ({ ...current, [basket.slug]: next }));
    setWeights((current) => {
      const updated = { ...current };
      next.forEach((leg) => { updated[`${basket.slug}:${leg.mint}`] = leg.weightBps; });
      return updated;
    });
    setRationales((current) => ({
      ...current,
      [basket.slug]: "Diversified Solana RWA exposure across Ondo Treasury products, BlackRock's institutional liquidity fund, an S&P 500 xStock, and tokenized gold.",
    }));
    setNotice({ text: "Loaded the Solana RWA preview mix. These are devnet preview mints; propose the version to send it through approvals.", error: false });
  };

  const signAsAdmin = async (proposal: BasketPublishProposal) => {
    const approvalAddress = approvalWallets[proposal.id]?.trim();
    setBusy(proposal.id);
    try {
      if (!publicKey || !signTransaction) throw new Error("Connect the basket admin wallet first.");
      if (!approvalAddress) throw new Error("Enter the second authorized wallet address.");
      const build = await kairosApi.prepareBasketPublishTransaction(proposal.id, adminToken, approvalAddress);
      if (!publicKey.equals(new PublicKey(build.admin))) {
        throw new Error(`Connect the on-chain basket admin wallet (${build.admin}) to sign first.`);
      }
      const unsigned = VersionedTransaction.deserialize(decodeBase64(build.transaction));
      const partial = await signTransaction(unsigned);
      const signed = { ...build, transaction: encodeBase64(partial.serialize()) };
      setSignedPublishes((current) => ({ ...current, [proposal.id]: signed }));
      setHandoffTransactions((current) => ({ ...current, [proposal.id]: signed.transaction }));
      setNotice({ text: `Admin signature saved. Connect ${approvalAddress} to finish publication.`, error: false });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Could not sign proposal.", error: true });
    } finally {
      setBusy(null);
    }
  };

  const approveProposal = async (proposal: BasketPublishProposal) => {
    const pending = signedPublishes[proposal.id];
    const signedTransaction = pending?.transaction ?? handoffTransactions[proposal.id]?.trim();
    const approvalAddress = pending?.approval ?? approvalWallets[proposal.id]?.trim();
    setBusy(proposal.id);
    try {
      if (!signedTransaction) throw new Error("Paste the admin-signed transaction from the proposer first.");
      if (!approvalAddress) throw new Error("Enter the authorized approver wallet address.");
      if (!publicKey || !signTransaction) throw new Error("Connect the authorized approver wallet.");
      if (!publicKey.equals(new PublicKey(approvalAddress))) {
        throw new Error(`Connect the selected approver wallet (${approvalAddress}).`);
      }
      const partial = VersionedTransaction.deserialize(decodeBase64(signedTransaction));
      const fullySigned = await signTransaction(partial);
      const result = await kairosApi.approveBasketPublishProposal(
        proposal.id,
        approverToken,
        encodeBase64(fullySigned.serialize()),
        approvalAddress,
        approvalNote
      );
      setProposals((pending) => pending.filter((item) => item.id !== proposal.id));
      setSignedPublishes((current) => {
        const { [proposal.id]: _removed, ...rest } = current;
        return rest;
      });
      setHandoffTransactions((current) => {
        const { [proposal.id]: _removed, ...rest } = current;
        return rest;
      });
      setNotice({ text: `Version ${result.version.version} published on Solana and verified.`, error: false });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Could not approve proposal.", error: true });
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <PageShell><AdminSkeleton /></PageShell>;

  return (
    <PageShell>
      <main className="mx-auto max-w-6xl space-y-7 px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/30 pb-6">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><Settings className="size-3.5" /> INTERNAL CONFIGURATION</div>
            <h1 className="text-3xl font-extrabold tracking-tight">Basket Governance</h1>
            <p className="mt-1 text-sm text-muted-foreground">Propose immutable versions and approve them in a separate admin step.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border/30 bg-surface px-3 py-2 text-xs">
            <span className={`size-2 rounded-full ${health?.status === "ok" ? "bg-emerald-500" : "bg-rose-500"}`} />
            Backend: {health?.status === "ok" ? "Online" : "Offline"}
          </div>
        </header>

        {notice && <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-surface p-4" role="status">
          {notice.error ? <AlertCircle className="size-5 shrink-0 text-rose-500" /> : <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />}
          <span className="text-xs">{notice.text}</span>
        </div>}

        <section className="space-y-4 rounded-2xl border border-border/30 bg-surface p-5">
          <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-emerald-700" /><h2 className="text-lg font-bold">Separate admin steps</h2></div>
          <p className="text-xs text-muted-foreground">The basket admin signs the registry transaction first. A different authorized wallet signs and submits it; the catalog updates only after chain verification.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs text-muted-foreground">Proposer credential
              <input type="password" autoComplete="off" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-foreground" />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">Approver credential
              <input type="password" autoComplete="off" value={approverToken} onChange={(event) => setApproverToken(event.target.value)} className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-foreground" />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1 space-y-1 text-xs text-muted-foreground">Approval note
              <input value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-foreground" />
            </label>
            <button type="button" onClick={loadProposals} disabled={busy !== null || !approverToken} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
              <RefreshCw className={`size-3.5 ${busy === "queue" ? "animate-spin" : ""}`} /> Load approvals
            </button>
          </div>
          {proposals.map((proposal) => <div key={proposal.id} className="space-y-3 rounded-xl border border-border/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs"><b>{proposal.basketSlug}</b> · version {proposal.versionData.version}<div className="text-muted-foreground">Proposed by {proposal.proposedBy} · {proposal.versionData.changelog}</div></div>
            </div>
            <label className="block space-y-1 text-xs text-muted-foreground">Second authorized wallet address
              <input value={approvalWallets[proposal.id] ?? ""} onChange={(event) => {
                const value = event.target.value;
                setApprovalWallets((current) => ({ ...current, [proposal.id]: value }));
                setSignedPublishes((current) => {
                  if (current[proposal.id]?.approval === value.trim()) return current;
                  const { [proposal.id]: _removed, ...rest } = current;
                  return rest;
                });
                setHandoffTransactions((current) => {
                  const { [proposal.id]: _removed, ...rest } = current;
                  return rest;
                });
              }} className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 font-mono text-foreground" />
            </label>
            <label className="block space-y-1 text-xs text-muted-foreground">Admin-signed transaction handoff
              <textarea
                value={handoffTransactions[proposal.id] ?? ""}
                onChange={(event) => setHandoffTransactions((current) => ({ ...current, [proposal.id]: event.target.value }))}
                rows={3}
                placeholder="Paste the admin-signed transaction here when approving from another browser. It expires after a short blockhash window."
                className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 font-mono text-[10px] text-foreground"
              />
            </label>
            {signedPublishes[proposal.id] && <button type="button" onClick={() => {
              const clipboard = navigator.clipboard;
              if (!clipboard) {
                setNotice({ text: "Clipboard access is unavailable. Select and copy the transaction from the field.", error: true });
                return;
              }
              void clipboard.writeText(signedPublishes[proposal.id].transaction)
                .then(() => setNotice({ text: "Signed transaction copied. Share it promptly with the approver.", error: false }))
                .catch(() => setNotice({ text: "Copy was blocked. Select and copy the transaction from the field.", error: true }));
            }} className="rounded-lg border border-border/40 px-3 py-2 text-xs font-semibold">Copy signed transaction</button>}
            <div className="flex flex-wrap items-center gap-3">
              {!signedPublishes[proposal.id] && <button type="button" onClick={() => void signAsAdmin(proposal)} disabled={busy !== null || !adminToken || !approvalWallets[proposal.id]} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                {busy === proposal.id ? "Preparing…" : "Sign as basket admin"}
              </button>}
              {signedPublishes[proposal.id] && <>
                <span className="text-xs text-emerald-700">Admin signature ready; valid through block {signedPublishes[proposal.id].lastValidBlockHeight}.</span>
                <button type="button" onClick={() => void signAsAdmin(proposal)} disabled={busy !== null || !adminToken} className="rounded-lg border border-border/40 px-3 py-2 text-xs font-semibold disabled:opacity-50">
                  Rebuild with a fresh blockhash
                </button>
              </>}
              {(signedPublishes[proposal.id] || handoffTransactions[proposal.id]) && <button type="button" onClick={() => void approveProposal(proposal)} disabled={busy !== null || !approverToken} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {busy === proposal.id ? "Submitting…" : "Sign as approver and publish"}
              </button>}
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {proposal.versionData.legs.map((leg) => {
                const token = baskets.find((basket) => basket.slug === proposal.basketSlug)?.tokens.find((item) => item.mint === leg.mint);
                const symbol = token?.symbol ?? `${leg.mint.slice(0, 4)}…${leg.mint.slice(-4)}`;
                const oldWeight = token ? `${(token.weightBps / 100).toFixed(1)}% → ` : "";
                return <span key={leg.mint} className="rounded-md bg-foreground/[0.04] px-2 py-1">{symbol}: {oldWeight}{(leg.weightBps / 100).toFixed(1)}%</span>;
              })}
            </div>
          </div>)}
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2"><Layers className="size-4 text-muted-foreground" /><h2 className="text-lg font-bold">Catalog baskets ({baskets.length})</h2></div>
          {baskets.map((basket) => {
            const legs = draftLegs[basket.slug] ?? basket.tokens.map((token) => ({ mint: token.mint, weightBps: token.weightBps }));
            const totalWeight = legs.reduce((sum, leg) => sum + (weights[`${basket.slug}:${leg.mint}`] ?? leg.weightBps), 0);
            return <article key={basket.id} className="space-y-4 rounded-2xl border border-border/30 bg-surface p-5">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/20 pb-3">
                <div><h3 className="font-bold">{basket.name}</h3><p className="text-xs text-muted-foreground">{basket.slug} · {basket.category}</p></div>
                <div className="flex items-center gap-3 text-xs">
                  <span className={totalWeight === 10_000 ? "text-emerald-700" : "text-rose-600"}>Total: {totalWeight} bps</span>
                  <button type="button" onClick={() => proposeVersion(basket)} disabled={busy !== null || !adminToken || totalWeight !== 10_000} className="rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-50">
                    {busy === basket.slug ? "Submitting…" : "Propose version"}
                  </button>
                </div>
              </header>
              <label className="block space-y-1 text-xs text-muted-foreground">Version rationale
                <input value={rationales[basket.slug] ?? ""} onChange={(event) => setRationales((current) => ({ ...current, [basket.slug]: event.target.value }))} className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-foreground" />
              </label>
              {basket.slug === "solana-infrastructure" && <div className="space-y-2">
                <button type="button" onClick={() => loadInfrastructureReferenceMix(basket)} disabled={registryTokens.length === 0} className="rounded-lg border border-border/40 px-3 py-2 text-xs font-semibold disabled:opacity-50">
                  Load requested 12-asset mix
                </button>
                <p className="text-xs text-muted-foreground">Loads CLOUD, BP, JUP, JitoSOL, SOL, mSOL, KMNO, RAY, ORCA, MET, ARX, and JTO with the allocations from your screenshots.</p>
              </div>}
              {basket.slug === "solana-sigma-basket" && <div className="space-y-2">
                <button type="button" onClick={() => loadSigmaReferenceMix(basket)} disabled={registryTokens.length === 0} className="rounded-lg border border-border/40 px-3 py-2 text-xs font-semibold disabled:opacity-50">
                  Load requested Sigma mix
                </button>
                <p className="text-xs text-muted-foreground">Loads PYTH 35%, JUP 25%, KMNO 20%, and RENDER 20%. Propose the version to send it through the approval flow.</p>
              </div>}
              {basket.slug === "solana-culture-memes" && <div className="space-y-2">
                <button type="button" onClick={() => loadCultureReferenceMix(basket)} disabled={registryTokens.length === 0} className="rounded-lg border border-border/40 px-3 py-2 text-xs font-semibold disabled:opacity-50">
                  Load culture &amp; memes mix
                </button>
                <p className="text-xs text-muted-foreground">Keeps the screenshot's BONK/TRUMP/PENGU split proportional, with 5% each for WIF and FARTCOIN.</p>
              </div>}
              {basket.slug === "solana-ai-compute" && <div className="space-y-2">
                <button type="button" onClick={() => loadAiComputeMix(basket)} disabled={registryTokens.length === 0} className="rounded-lg border border-border/40 px-3 py-2 text-xs font-semibold disabled:opacity-50">
                  Load AI &amp; compute mix
                </button>
                <p className="text-xs text-muted-foreground">RENDER, NOS, IO, and ARX at 25% each. Propose the version to send it through approvals.</p>
              </div>}
              {basket.slug === "solana-depin-infrastructure" && <div className="space-y-2">
                <button type="button" onClick={() => loadDepinMix(basket)} disabled={registryTokens.length === 0} className="rounded-lg border border-border/40 px-3 py-2 text-xs font-semibold disabled:opacity-50">
                  Load researched DePIN mix
                </button>
                <p className="text-xs text-muted-foreground">HNT, MOBILE, IOT, HONEY, and RENDER at 20% each. Propose the version to send it through approvals.</p>
              </div>}
              {basket.slug === "solana-real-world-assets" && <div className="space-y-2">
                <button type="button" onClick={() => loadRwaMix(basket)} disabled={registryTokens.length === 0} className="rounded-lg border border-border/40 px-3 py-2 text-xs font-semibold disabled:opacity-50">
                  Load researched RWA mix
                </button>
                <p className="text-xs text-muted-foreground">USDY, OUSG, BUIDL, SPYx, and XAUm at 20% each. These are devnet preview mints with illustrative prices.</p>
              </div>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {legs.map((leg) => {
                  const token = basket.tokens.find((item) => item.mint === leg.mint) ?? registryTokens.find((item) => item.mint === leg.mint);
                  const symbol = token?.symbol ?? `${leg.mint.slice(0, 4)}…${leg.mint.slice(-4)}`;
                  return (
                    <label key={leg.mint} className="flex items-center justify-between gap-2 rounded-xl border border-border/20 bg-foreground/[0.03] p-2 text-xs">
                      <span>{symbol}</span>
                      <input type="number" min={1} max={10_000} value={weights[`${basket.slug}:${leg.mint}`] ?? leg.weightBps} onChange={(event) => setWeights((current) => ({ ...current, [`${basket.slug}:${leg.mint}`]: Number(event.target.value) }))} className="w-20 rounded border border-border/30 bg-background px-1 py-1 text-right font-mono" aria-label={`${basket.name} ${symbol} weight in basis points`} />
                    </label>
                  );
                })}
              </div>
            </article>;
          })}
        </section>
      </main>
    </PageShell>
  );
}
