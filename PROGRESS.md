# Site Expansion — Progress Notes

Updated 2026-10-09. Read this first if picking the work back up.

## The goal

Full site expansion: three actor roles (Customer, Lister, Admin),
15-route professional storefront (replacing the old modal-heavy
3-route prototype), dummy payment UI (no Stripe), CSS-only
micro-animations.

- **Spec:** `docs/superpowers/specs/2026-10-08-site-expansion-design.md`
- **Plans:**
  1. `docs/superpowers/plans/2026-10-08-phase1-role-backend.md`
  2. `docs/superpowers/plans/2026-10-08-phase2-frontend-role-wiring.md`
  3. `docs/superpowers/plans/2026-10-08-phase3-page-restructuring.md`
  4. `docs/superpowers/plans/2026-10-08-phase4-lister-and-admin-users.md`
  5. `docs/superpowers/plans/2026-10-08-phase5-static-pages-and-cleanup.md`

## Where things stand

**All 5 phases are implemented and merged into local `main`.** Nothing
has been pushed to `origin`/Vercel — that is a deliberate pause for the
user to review and explicitly approve before any push or production
deploy.

| Phase | Status |
|---|---|
| 1 — Role/RBAC backend | ✅ merged |
| 2 — Frontend role wiring | ✅ merged |
| 3 — Page restructuring (modals → real routes) | ✅ merged |
| 4 — `/lister` dashboard + admin Users tab | ✅ merged |
| 5 — `/about`, `/contact`, `/policies`, dead-code sweep | ✅ merged |

All 15 routes from the spec exist and build cleanly: `/`, `/shop`,
`/products/[id]`, `/cart`, `/checkout`, `/checkout/payment`,
`/orders/[id]`, `/login`, `/register`, `/account`, `/admin`, `/lister`,
`/about`, `/contact`, `/policies`.

Real bugs found and fixed along the way (not just transcribed from the
plans — each task's given code was traced for correctness, not just
type-checked):
- Phase 1: JWT trusted role/admin claim without re-checking the DB on
  each request — a demoted/blocked user's old token kept working until
  expiry. Fixed in both the pre-Phase-1 `is_admin` model and the
  `role` model.
- Phase 3: an open-redirect vulnerability in the `?next=` login/register
  param (now guarded by `frontend/lib/safeNextPath.ts`), a post-login
  redirect race that silently discarded `?next=`, a 0-stock
  cart-quantity-ceiling bug, a hydration-timing race causing false
  redirects/message-flashes on hard reload (fixed with a one-tick
  `readyToRedirect`/`clientReady`/`hasHydrated` gate, applied
  consistently on `/checkout`, `/checkout/payment`, `/orders/[id]`,
  `/account`, and the homepage's cart-bump animation), and 5 real
  ESLint errors only caught by actually running `eslint` (not just
  `tsc`/`build`).
- Phases 2, 4, 5: clean — no extra bug-fix commits needed.

## Verification done so far

- `cd frontend && npx tsc --noEmit && npm run build && npx eslint app/ components/ lib/` — clean (0 errors) on merged `main`.
- `cd backend && python -m pytest -v` — 57/57 passing.
- End-to-end browser walkthrough (local throwaway MongoDB, never
  production Atlas) covering: register → shop → cart → checkout →
  payment → order confirmation (order persistence double-checked via a
  direct API call); admin dashboard (products/orders/users tabs);
  promoting a user to lister and using `/lister` to add a product;
  blocking a user and confirming their login is rejected; confirming an
  admin cannot self-demote; `/about`; `/contact` (empty-submit blocked,
  valid-submit confirms).

**Still open:** `/policies`' in-page anchor scroll (desktop + mobile
width) has not been manually verified yet — the one remaining item from
Phase 5's own Review Focus. Nothing else is outstanding before the
push/deploy decision.

One observed, non-reproducing hiccup: once, right after a successful
payment, client-side navigation briefly landed on `/cart` instead of
`/orders/[id]`, during the very first (cold) Turbopack compile of that
route in `next dev`. A careful retry on a warm route was stable. The
order was always correctly created server-side either way. Treated as a
dev-server-only artifact — `next build` (what actually runs in
production) pre-compiles every route, so this exact race window can't
exist there. Worth a second look only if it recurs.

## To resume

1. Verify `/policies`' anchor nav scrolls correctly at both desktop and
   mobile widths (last open item from Phase 5).
2. Nothing else is planned beyond that — next decision is whether/when
   to push to `origin` and deploy to Vercel. Confirm with the user
   first; this has been explicitly held back pending their go-ahead.

## Nothing is lost if this session ends

Everything above is committed to git on `main`. `git log --oneline` is
the source of truth over this summary if they ever disagree.
