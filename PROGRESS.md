# Progress

Updated 2026-10-15. Read this first when resuming.

## Live state (on `origin/main` + Vercel prod, last pushed `399b9a3`)

- Roles (customer/lister/admin), 15-route storefront, dummy payments, admin dashboard, Resend email, password reset, contact endpoint, Sentry, Blob uploads, audit log, premium store UI (variants, side cart, assistant, Find my size, photo search, lookbook). Plan: `PREMIUM_STORE_UI_PLAN.md`. Flow diagrams of everything: `ARCHITECTURE.md`.
- Auto-deploys on push to `origin/main`. Confirm with the user before any push.

## Done 2026-10-14 (all pushed)

- User set prod env vars in Vercel (`FRONTEND_URL`, `RESEND_API_KEY`, `SUPPORT_EMAIL`, `SENTRY_DSN`, `REDIS_URL`) and redeployed.
- Code fixes: admin StatCard overlap, size radios select on arrow key, `<img>` eslint warnings, contact page shows `shameelalvi.skycodein@gmail.com` (override with `NEXT_PUBLIC_SUPPORT_EMAIL`).
- Image upload bug: Next handler lived at `/api/upload`, but `vercel.json` sends all `/api/*` to FastAPI (404). Moved to `/blob-upload` (`399b9a3`). Rule: never put frontend route handlers under `/api`.
- Blob store `clothing-store-images` created through the Vercel MCP and connected to the project (`BLOB_READ_WRITE_TOKEN` in all envs), redeployed. Prod `/blob-upload` with a bad token now answers `Not authenticated`.
- Prod verified: login rate limit 429 after 10, spoofed `X-Forwarded-For` no bypass. Playwright on prod: shop, product page, size arrow keys, side cart, checkout login redirect, mobile 390px, static pages, 404, no stray 401 (the 401 users see is just a wrong-password login or an expired 30 min token).
- Vercel MCP is authorized for the personal scope only: store creation and redeploy work, runtime logs return 403 (team scope).

## Local commits, NOT pushed (8 ahead of origin/main; push = prod deploy, ask user first)

- `924fc8d` admin UI/UX pass (plan `docs/superpowers/plans/2026-10-14-admin-ui-ux.md`): `frontend/app/admin/_components/*`, confirm dialog, toasts, hash tabs, revenue excludes cancelled, Products KPI loads on mount.
- `cc3416f` review fixes 1-5: cancelled orders are terminal + atomic stock release, stock rollback on any checkout failure, bcrypt 72-byte truncation, unique `users.email` index (startup only warns if existing duplicates block it: check Vercel logs after push), `authenticatedFetch` clears login on 401.
- `dd4992e` review fixes 6-8: `/products/` skip/limit (max 200) + `fetchAllProducts` helper, `GET /orders/{id}`, `/products/looks` single companion query (still capped at 100 looks, `MAX_LOOKS`).
- Shortening done: ProductManager reuses `IconRefresh`, `chat_tools._parse_object_id`, companions keep stored order, Badge shows "Out of stock". Not done: `useAdminResource` hook.
- Tests: backend 171, frontend 105, tsc/lint/build clean. Admin UI checked in Playwright with mocked API only; real backend and `/lister` live save NOT checked; order detail page not browser-checked.

## Still to do

1. **Resend delivery unproven**: dashboard Logs show only old 422s and no entry for the contact tests. Need the error body of a 422 row from the user (suspect `Thread&Co <onboarding@resend.dev>` sender or sandbox recipient rule). Confirm "Contact form: ..." mail reaches the inbox.
2. **Admin password**: was shown in chat. Reset via `/forgot-password` once email works.
3. **Real image upload** by an admin or lister never tested end to end (needs login).
5. **Admin StatCard fix** not seen live (needs admin login), check at a narrow width.
6. **`TRUSTED_PROXY_HOPS`** unset. Spoof test passed, but confirm the per-IP key is the real client IP (try 1, then 2).
7. Confirm Redis is live: no "in-process memory storage" warning in Vercel logs.
8. Merchant review of placeholder size charts (`backend/app/data/size_charts.py`).
9. Route-decorator limits (per-IP, chat) still swap to 5/minute during a Redis outage (slowapi limitation).

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
- Sentry production check and a live image upload check (`/blob-upload`) were never done.

## Out of scope

Back-in-stock notifications, per-colour images/gallery, vector-based visual search, server-rendered product pages, custom domain, dark admin theme.
