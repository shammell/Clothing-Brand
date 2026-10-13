# Progress

Updated 2026-10-14. Read this first when resuming.

## Live state (already on `origin/main` + Vercel prod)

- Roles (customer/lister/admin), 15-route storefront, dummy payments, admin dashboard (tabs, charts, sortable tables), production-readiness plan (Resend email, password reset, contact endpoint, Sentry, Blob uploads, audit log).
- Auto-deploys on push to `origin/main`. Confirm with the user before any push.

## In flight: `feat/premium-store-ui` (27 commits, local only, NOT pushed, NOT merged)

Plan: `PREMIUM_STORE_UI_PLAN.md` (untracked in repo root). All 28 tickets implemented.

| Sprint | Tickets | Status |
|---|---|---|
| 1 Variant inventory | DB-1..DB-5 | done |
| 2 Shell + side cart | UI-1..UI-5 | done |
| 3 Product surfaces | UI-6..UI-9 | done |
| 4 Navigation motion | UI-10..UI-12 | done (UI-13 QA pass incomplete, see below) |
| 5 Assistant + sizing | AI-1..AI-4 | done |
| 6 Photo search + lookbook | AI-5..AI-9 | done |

Verification at last run: backend `pytest` 151 pass, frontend `vitest` 84 pass, `tsc` + `eslint` + `npm run build` clean. `backend/app/models/user.py`, `routes/users.py`, `frontend/app/checkout/payment/` untouched.

### Decisions that differ from the plan

- Photo search takes a raw image body (not multipart): `python-multipart` is not installed and a dependency change once broke a prod install.
- Header has no search box; homepage search moved into its category strip; photo search lives on `/shop` (header camera icon links to `/shop?photo=1` and focuses the button).
- Chat global caps: `10/minute` and `300/day` (free Groq tier; real daily limits unverified).
- Drawer "Pairs well with" links to the product page instead of adding directly.
- `ViewTransition` goes through `components/ViewTransition.tsx` (falls back to passthrough where React lacks it, e.g. vitest).
- PUT with legacy `sizes/colors/stock` keeps per-variant stock if the total is unchanged; a changed total re-splits.
- Variant matrix capped: 15 sizes, 15 colors, 200 variants.

### Still to do

- Done 2026-10-14: variant migration run on prod (7 products), companions generated, Groq tool calling verified live, vision verified live (default vision model changed to `qwen/qwen3.8-27b`; the llama-4-scout default no longer exists; `max_tokens` 300 added because the model's output-token limit rejected the default).
- Merchant must review the placeholder size charts (`backend/app/data/size_charts.py`).
- Merge/push only after the user says so. Migration is already applied, so the push is safe.

## Local dev notes

- Backend tests/dev: system Python (`python`), not `backend/venv` (broken). Local Mongo: `C:\Users\USER\mongodb-portable\...\mongod.exe --dbpath ./data --bind_ip 127.0.0.1` (start manually; tests hang without it).
- For live testing never use the default `.env` DB: run `MONGODB_URL=mongodb://localhost:27017 DB_NAME=ui_dev` for `seed.py`, `generate_companions.py` and `uvicorn app.main:app --port 8000`; frontend `npm run dev` reads `.env.local` (`NEXT_PUBLIC_API_URL=http://localhost:8000`).
- Shell gotcha: long `python - <<'EOF'` heredocs sometimes fail to parse here; write a scratch `.py` with the Write tool and run it.
- Playwright screenshots with a relative filename land in the repo root; delete them after viewing.

## Known limitations carried over

- Audit log capped at 200 entries, no pagination.
- No email verification at signup.
- Resend sender is `onboarding@resend.dev` (delivers only to the account owner until a domain is verified).
- Admin save can race a customer order (PUT replaces the document); per-variant stock adjustment endpoints would close it.
- Sentry production check and live `/api/upload` check were never done.

## Follow-ups not in scope

Back-in-stock notifications, per-colour images/gallery, vector-based visual search, server-rendered product pages.
