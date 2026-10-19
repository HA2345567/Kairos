# Kairos Demo Readiness

## What is demo-ready

The local presentation path is verified on Solana devnet-labelled data:

```bash
bun run seed:catalog
bun run demo
# in a second terminal
bun run check:demo
```

- Frontend: `http://127.0.0.1:8080`
- Backend: `http://127.0.0.1:3001`
- Screenshots: `target/demo/`
- Checked routes: `/`, `/markets`, `/portfolio`, `/labs`, `/admin`
- The catalog seed is explicitly marked as planned devnet preview data and does
  not fabricate market history.

## Recommended presentation flow

1. Start with the landing page and point out the non-custodial architecture.
2. Open Markets and show backend-sourced basket compositions and the explicit
   `NO DATA YET`/hypothetical-performance labels.
3. Open a basket detail page and show the published version/leg composition,
   quote disclosure, and wallet-signing language.
4. Open Portfolio to show the wallet-owned position surface, devnet labels,
   unavailable values where no verified price exists, and recovery controls.
5. Open Labs to show browser-local ideas and the explicit publishing boundary.
6. Open Admin to show the two-wallet publication flow and the backend online
   status. Do not claim a version was published unless a real registry
   transaction is visible and verified.

## Program-backed rebalance status

The program-backed close/rebalance path is locally implemented and checked:

- Source basket version is used for sell legs.
- Target basket version is used for buy legs.
- Rebalance fee is 10 bps per side by default.
- Close fee is 20 bps by default.
- Fee bps is encoded in the instruction and bounded by the on-chain global cap.
- User wallet signature remains required; the relayer only pays fees and
  partially signs.
- Builder output matches the local Anchor IDL and Rust instruction layout.

## Do not claim live completion yet

The following live checks remain blocked or unverified:

- Router program `3jWJZPdDou1h8UrT871Qi573yqQkFYYW8Jqiug9Pne5w` is not executable
  on devnet.
- Configured relayer `76ERXGuZsC2V8jzxGyuohW75UYfDLvPKyXGYSUEsn6UJ` has 0 SOL.
- The supplied Phantom address has 5 SOL, but a public address cannot sign a
  deployment or user transaction by itself.
- Devnet mint/treasury/pool setup has not completed, so no live investment,
  close, or rebalance receipt should be shown as successful.
- Pyth feed IDs/API credentials and a verified SOL benchmark are not configured;
  historical performance remains unavailable.

Use `bun run check:devnet AV38UtRWsV1nebfXW25rVLupXdd4hcEf26fy31Lgp7XH` to print
the current read-only deployment report without exposing secrets.

## Verification snapshot

- Backend: 63 passed, 3 devnet-only skipped.
- Frontend: 21 passed, 1 live-simulation skipped.
- Backend/frontend production build: passed.
- Rust `cargo check -p kairos-router`: passed with existing Anchor cfg/deprecation warnings.
- Rust `cargo test -p kairos-router --lib`: 2 passed.
- Program builder ↔ IDL check: passed.
- Browser demo smoke check: passed for all five routes.
- SBF artifact exists at `target/deploy/kairos_router.so`; the long-running
  build command was interrupted after producing the artifact, so its final
  process exit status is not claimed here.
