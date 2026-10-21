# Devnet release checkpoint — 2026-10-20

## Implemented locally

- Persist hourly and daily public-market candles in PostgreSQL, so cold API instances can reuse history.
- Keep candle backfills alive with Vercel `waitUntil`.
- Retry chart queries after transient errors and periodically refresh completed chart queries.
- Allow rolling history windows to refresh when their point count decreases.
- Process accepted, wallet-signed Devnet executions in the HTTP deployment; authenticated status polling can resume due jobs.
- Scope request-triggered job processing to the requested execution. Respect read-only mode and the landing-worker switch.

## Verification and limits

- Focused backend cache and execution tests: 15 passed, zero failed.
- Backend typecheck includes `backend/api/index.ts` and passes.
- Tests use isolated storage, mocked provider responses, and simulated/mocked transaction settlement. They are not evidence of a real wallet transaction.
- The production `/health` endpoint still returned HTTP 500 during this checkpoint. Earlier runtime logs identified a missing relayer configuration in the deployed function; saved environment changes require a new deployment.
- `waitUntil` remains bounded by the platform function timeout. Delayed jobs require subsequent authenticated status polling or an always-on landing worker. Unattended recovery after a closed browser still needs a durable scheduled worker.

## Remaining release proof

1. Deploy with the saved Devnet environment and verify `/health`, catalog, market data and history endpoints.
2. Confirm chart persistence after refresh and on a fresh serverless instance, including partial coverage disclosures.
3. With explicit user authorization, prepare and sign a real Devnet investment through Phantom.
4. Check each transaction receipt, received SPL balances, SOL/fee movements, and backend execution records. Verify success only when all legs complete.
5. Verify the deployed function duration and unattended worker arrangement before describing recovery as production-ready.

Market-reference charts use public asset prices. They do not represent trading prices or liquidity of the app's Devnet test tokens. Historical basket charts are hypothetical simulations, not wallet performance.
