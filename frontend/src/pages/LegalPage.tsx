import { Link, useLocation } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";

/**
 * §13.1 compliance surface: draft Terms of Service and Privacy Policy plus the
 * devnet, hypothetical-performance and age-gate disclosures the PRD requires
 * before anything resembling real value exists. These are drafts to be reviewed
 * by counsel before mainnet (gate G4) — the page says so rather than implying
 * legal sign-off.
 */

const DRAFT_BANNER =
  "Draft for the devnet build. Not legally reviewed — counsel sign-off is a mainnet readiness gate (G4).";

function Terms() {
  return (
    <>
      <h2 className="font-display text-xl font-bold text-foreground">Terms of Use (draft)</h2>
      <p>
        Kairos is a non-custodial interface. You sign every transaction with your own wallet; Kairos never holds your
        keys or your assets. The backend builds unsigned transactions, verifies signed bytes, and pays network fees
        from an operational relayer.
      </p>
      <h3 className="font-semibold text-foreground">Devnet only</h3>
      <p>
        This deployment runs on Solana devnet with test assets. Test USDC and test tokens have no monetary value, may
        be reset by the network, and are provided for evaluation only. Do not send real assets to any address shown
        here.
      </p>
      <h3 className="font-semibold text-foreground">Age</h3>
      <p>
        Investing requires an 18+ attestation. The attestation is recorded against your wallet account and is a
        prerequisite for preparing any investment transaction.
      </p>
      <h3 className="font-semibold text-foreground">Fees</h3>
      <p>
        Platform fees are disclosed in every preview before you sign and are charged per confirmed leg only. A leg that
        fails on-chain charges no fee.
      </p>
      <h3 className="font-semibold text-foreground">No advice</h3>
      <p>
        Basket compositions, backtests and simulations are informational. All historical series are hypothetical,
        exclude execution costs and liquidity, and are not a promise of future results.
      </p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <h2 className="font-display text-xl font-bold text-foreground">Privacy Policy (draft)</h2>
      <h3 className="font-semibold text-foreground">What we store</h3>
      <p>
        A wallet address, its signature-verified session, basket positions derived from on-chain balances, execution
        records (amounts, hashes, signatures), and a delivery record for notifications. No private keys are ever
        received or stored.
      </p>
      <h3 className="font-semibold text-foreground">Analytics</h3>
      <p>
        Page-view analytics are anonymized: the event name, a route path with identifiers removed, and a salted hash of
        the session. No IP address, user agent, or wallet address is stored, and you can switch analytics off in
        Settings. Analytics rows are deleted after 30 days.
      </p>
      <h3 className="font-semibold text-foreground">Retention</h3>
      <p>
        Session nonces and expired refresh tokens are purged by a scheduled sweep. Audit-log entries are retained for
        the configured compliance window (default seven years). See NFR-10 in the project audit for the current
        settings.
      </p>
      <h3 className="font-semibold text-foreground">Your controls</h3>
      <p>
        Revoke your session from Settings at any time. Notification channels and event classes are user-controlled
        there as well. Deleting your data before mainnet is handled by support; PII is purged within 30 days of a
        deletion request.
      </p>
    </>
  );
}

export default function LegalPage() {
  const { pathname } = useLocation();
  const isPrivacy = pathname.includes("privacy");

  return (
    <PageShell>
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-12 sm:px-6 lg:px-8">
        <p className="rounded-xl border border-border/60 bg-surface/80 px-4 py-3 text-xs text-text-secondary" role="note">
          {DRAFT_BANNER}
        </p>
        <article className="space-y-4 text-sm leading-relaxed text-text-secondary">
          {isPrivacy ? <Privacy /> : <Terms />}
        </article>
        <p className="text-xs text-text-secondary">
          {isPrivacy ? <Link to="/terms" className="underline underline-offset-4">Terms of Use</Link> : <Link to="/privacy" className="underline underline-offset-4">Privacy Policy</Link>}
          {" · "}
          <Link to="/markets" className="underline underline-offset-4">Back to markets</Link>
        </p>
      </div>
    </PageShell>
  );
}
