# Key Rotation — URGENT (Oct 7, 2026)

The repo is **public on GitHub** (`github.com/HA2345567/Kairos`) and commit `11441fa`
exposed two live secrets. Repo hygiene is DONE (below); **the actual rotation
must be done by you in the provider dashboards — do it today.**

## Exposed secrets

| Secret | Where it leaked | Status |
|---|---|---|
| **Helius API key** `15309047-0a65-…` | `shared/devnet-config.json` (tracked) + git history | removed from working tree; **revoke in dashboard** |
| **Privy App Secret** `privy_app_secret_3xEW…` | `frontend/.env.example` (tracked, committed!) + git history | removed from working tree; **rotate in dashboard** |

Not exposed: Privy App ID (`cmuivma9d00dl0dkwdd6j33as`) is a public client-side
identifier — fine to keep. `.env` files were never committed (gitignored).

## Your 2 dashboard actions (~10 min)

1. **Helius** — dashboard.helius.io → API Keys → **delete/revoke key** `15309047-0a65-4466-aa24-4e09d2c08f37` → create a new devnet key.
2. **Privy** — dashboard.privy.io → your app (`cmuivma9d00dl0dkwdd6j33as`) → Settings → **reset App Secret**. Client code never needs the secret (only the App ID).

Then paste the new values into the **gitignored** env files (never tracked files):
```
backend/.env   → HELIUS_API_KEY=…, PRIVY_APP_SECRET=…   (copy from backend/.env.example)
.env (root)    → PRIVY_APP_SECRET=…
```
The backend composes `https://devnet.helius-rpc.com/?api-key=<HELIUS_API_KEY>` at
runtime (`backend/src/config.ts`) — tracked configs contain no keys anymore.

## Git history (decide + do)

The secrets remain recoverable in git history (`11441fa`) until purged. Because
rotation revokes the leaked values, history purge is defense-in-depth, but for a
public repo do it anyway:

```bash
# one-time: pip install git-filter-repo
git filter-repo --force --invert-paths \
  --path frontend/.env.example --path shared/devnet-config.json \
  --replace-text <(echo "15309047-0a65-4466-aa24-4e09d2c08f37==>REDACTED"; echo "privy_app_secret_3xEWZZb5ZmMY8SCcFaaHHZwhcHQ26muidSJYnVzofK2bxeHkasiCqRdiUHuvwjwmWymWa6PBaMSKontEXJobYvgc==>REDACTED")
git push origin --force --all && git push origin --force --tags
```
This rewrites history — coordinate with anyone who has clones. After the push,
verify the secret is gone from GitHub's UI (old commits may persist in forks/caches —
that's why **rotation is the real fix**, purge is hygiene).

## What was already fixed in the working tree
- `frontend/.env.example` — real secret replaced with a placeholder + warning; `VITE_PRIVY_APP_SECRET` removed from `frontend/.env` entirely (a VITE_ var would be bundled into client JS).
- `shared/devnet-config.json` — Helius key removed; runtime-composed via env; program ID set to the real `ELfFsk…` (was a placeholder).
- `backend/.env.example` + `backend/.env` — created (gitignored) with `HELIUS_API_KEY` / `PRIVY_APP_SECRET` slots.
- `backend/src/config.ts` — fallback RPC composed from `HELIUS_API_KEY` env only.
