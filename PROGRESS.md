# Progress

Updated 2026-10-14. Read this first when resuming.

## Live state (on `origin/main` + Vercel prod, last pushed `718dd3b`)

- Roles (customer/lister/admin), 15-route storefront, dummy payments, admin dashboard (tabs, charts, sortable tables), production-readiness plan (Resend email, password reset, contact endpoint, Sentry, Blob uploads, audit log).
- Premium store UI merged 2026-10-14 (`63154a9`): variant inventory, side cart, product surfaces, nav motion, assistant + Find my size, photo search, lookbook. Plan: `PREMIUM_STORE_UI_PLAN.md`. Prod DB already migrated (variants, companions).
- Security fixes `6ff3e97`: photo search rejects non-image bytes (magic-byte check) before spending the global budget; Redis-outage fallback in `consume_global` enforces the configured cap as well as the 5/minute ceiling.
- Verified before push: backend pytest 154 pass, `tsc`/eslint/`next build`/vitest clean, clean `npm ci` from lockfile. Prod smoke: `/`, `/admin`, `/api/products/` 200, junk photo upload 415.
- Auto-deploys on push to `origin/main`. Confirm with the user before any push.

## Done 2026-10-14 (pushed, last commit `718dd3b`)

- User set prod env vars in Vercel (`FRONTEND_URL`, `RESEND_API_KEY`, `SUPPORT_EMAIL`, `SENTRY_DSN`, `REDIS_URL`) and redeployed.
- Fixed: admin StatCard label/icon overlap, size radios select on arrow key, `<img>` eslint warnings silenced with reason, contact page shows real support email (`NEXT_PUBLIC_SUPPORT_EMAIL` overrides), merged local branch deleted.
- Prod verified: login rate limit 429 after 10, spoofed `X-Forwarded-For` does not bypass it. Playwright pass on prod: shop, product page, size arrow keys, side cart, checkout login redirect, mobile 390px, static pages, 404.

## Still to do

1. **Resend delivery unproven**: Logs showed only old 422s and no entry for the contact tests. Open a 422 row for the error body (suspect sender `Thread&Co <...>` or sandbox recipient rule). Confirm "Contact form: ..." mail reaches the inbox.
2. **Admin password**: shown in chat earlier. Reset via `/forgot-password` once email delivery is confirmed.
3. **Sentry**: confirm an event shows under Issues (no test-error route exists).
4. **Admin StatCard fix** not seen live (needs admin login). Check at a narrow width.
5. **`TRUSTED_PROXY_HOPS`** still unset. Spoof test passed, but verify the per-IP key is the real client IP and set it if not (try 1, then 2).
6. Confirm Redis is live: no "in-process memory storage" warning in Vercel logs after deploy.
7. Merchant review of placeholder size charts (`backend/app/data/size_charts.py`).
8. Route-decorator limits (per-IP, chat) still swap to 5/minute during a Redis outage (slowapi limitation).
9. Untracked planning docs `docs/superpowers/plans/2026-10-12-production-readiness*.md`: commit or delete.

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
