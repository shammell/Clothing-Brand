# Progress

Updated 2026-10-14. Read this first when resuming.

## Live state (on `origin/main` + Vercel prod, last deploy `6ff3e97`)

- Roles (customer/lister/admin), 15-route storefront, dummy payments, admin dashboard (tabs, charts, sortable tables), production-readiness plan (Resend email, password reset, contact endpoint, Sentry, Blob uploads, audit log).
- Premium store UI merged 2026-10-14 (`63154a9`): variant inventory, side cart, product surfaces, nav motion, assistant + Find my size, photo search, lookbook. Plan: `PREMIUM_STORE_UI_PLAN.md`. Prod DB already migrated (variants, companions).
- Security fixes `6ff3e97`: photo search rejects non-image bytes (magic-byte check) before spending the global budget; Redis-outage fallback in `consume_global` enforces the configured cap as well as the 5/minute ceiling.
- Verified before push: backend pytest 154 pass, `tsc`/eslint/`next build`/vitest clean, clean `npm ci` from lockfile. Prod smoke: `/`, `/admin`, `/api/products/` 200, junk photo upload 415.
- Auto-deploys on push to `origin/main`. Confirm with the user before any push.

## Still to do

1. **Redis**: prod has no `REDIS_URL`, so "global" rate caps are per serverless instance. Add Upstash via Vercel Marketplace (user's account).
2. **`TRUSTED_PROXY_HOPS`** unset: per-IP limits may collapse to the Vercel proxy IP. Set it and check the real client IP live.
3. **Missing prod env vars**: `RESEND_API_KEY`, `SUPPORT_EMAIL`, `FRONTEND_URL` (defaults to `localhost:3000`, breaks reset links), `SENTRY_DSN`. Until set, forgot-password email, contact form and Sentry likely do nothing in prod.
4. Admin password was reset directly in Atlas on 2026-10-14 and shown in chat: user should change it (`/forgot-password` once email works).
5. Merchant review of placeholder size charts (`backend/app/data/size_charts.py`).
6. Route-decorator limits (per-IP, chat) still swap to 5/minute during a Redis outage (slowapi limitation).
7. Minor: size radios don't select on arrow key; 2 eslint `<img>` warnings.
8. Delete local branch `feat/premium-store-ui` when convenient (already merged).

## Local dev notes

- Backend tests/dev: system Python (`C:/Python315/python.exe`), not `backend/venv` (broken). Local Mongo: `C:\Users\USER\mongodb-portable\...\mongod.exe --dbpath ./data --bind_ip 127.0.0.1` (start manually; tests hang without it).
- Default `backend/.env` points at the **production Atlas DB**. Plain `uvicorn app.main:app --port 8000` therefore edits real data. For safe testing use `MONGODB_URL=mongodb://localhost:27017 DB_NAME=ui_dev` (that DB has no users, so admin login 401s there; seed one first).
- If `/admin` login shows "Invalid email or password" locally, check which DB the process on port 8000 uses (a stale override-started server caused this once).
- Frontend `npm run dev` reads `.env.local` (`NEXT_PUBLIC_API_URL=http://localhost:8000`); prod leaves it unset and uses `/api`.
- Playwright screenshots with a relative filename land in the repo root; delete after viewing.

## Known limitations

- Audit log capped at 200 entries, no pagination.
- No email verification at signup.
- Resend sender is `onboarding@resend.dev` (delivers only to the account owner until a domain is verified).
- Admin save can race a customer order (PUT replaces the document); per-variant stock adjustment endpoints would close it.
- Sentry production check and live `/api/upload` check were never done.

## Out of scope

Back-in-stock notifications, per-colour images/gallery, vector-based visual search, server-rendered product pages, custom domain, dark admin theme.
