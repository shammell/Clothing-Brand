# Admin dashboard + admin login — professional UI/UX pass

## Context
Admin (`frontend/app/admin/page.tsx`, 1015 lines, one file) works and is live, but feels "demo-grade": `window.confirm` popups, no success feedback, login is a bare card (no show-password, no forgot link, no session-expired notice), tabs not deep-linkable, orders hide the order id even though search uses it, and two honest data bugs:
- **Revenue counts cancelled orders** (`stats.revenue` sums every order).
- **Products KPI shows "—"** until the Products tab is opened (count only comes from `ProductManager` callback).

Goal: professional admin console end-to-end (login → shell → every tab), **frontend only, no backend change, no new npm deps**, keep light/indigo theme (user chose it in an earlier session). Scope = admin only; storefront and `/lister` page untouched (lister only inherits `ProductManager` improvements, which are shared).

Design direction (ui-ux-pro-max `--design-system`, density 8, motion 3): "Data-Dense Dashboard" — KPI cards, tight tables, row hover, visible focus, 4.5:1 contrast, reduced-motion. Rejected from its output: Fira fonts + GSAP (new deps/fonts, no value here), navy palette (keep indigo).

Standing rules: no raw `<h1>/<h2>` in admin (global Georgia style) — keep `<p role="heading" aria-level>`; no frontend route under `/api`; no push without user OK.

## Steps

### 1. Split the file (needed, not cosmetic)
Move into `frontend/app/admin/_components/`:
- `ui.tsx` — existing `Badge`, tone maps, class constants, icons (moved as-is) + `formatMoney` (`Intl.NumberFormat` USD), `formatRelative` (`Intl.RelativeTimeFormat`), `initials()`.
- `AdminLogin.tsx`, `OverviewTab.tsx`, `OrdersTab.tsx`, `UsersTab.tsx`, `AuditTab.tsx`.
- `ConfirmDialog.tsx`, `Toast.tsx` (step 3).
`page.tsx` keeps auth state, data loading functions (unchanged logic), and the shell. Underscore folder = not a route.

### 2. Admin login (`AdminLogin.tsx`)
- Split layout md+: left indigo brand panel (logo mark, "Thread&Co Admin", 3 short capability lines), right form. Mobile: form only.
- Email `autoComplete="email"` + `autoFocus`; password `autoComplete="current-password"` + show/hide toggle (icon button, `aria-pressed`, `aria-label`); Caps Lock hint on keyup.
- Error in `role="alert"` box linked via `aria-describedby`; 429 message already readable via `extractErrorMessage`.
- Button spinner + "Signing in…"; "Forgot password?" → `/forgot-password`; "← Back to store" → `/`.
- **Session-expired notice**: `logout(reason?)` in page.tsx sets `sessionNotice`; login screen shows amber "Your session expired, sign in again" instead of the error landing on a blank table.
- Non-admin state: proper card — avatar, "Signed in as X (role)", "No admin access", buttons "Switch account" (logout) + "Go to store".

### 3. Feedback primitives (no deps)
- `ConfirmDialog.tsx`: native `<dialog>` + `showModal()` (same pattern as cart drawer), title, body, `tone="danger"` red confirm, initial focus on Cancel, Esc closes, promise-style hook `useConfirm()` returning `confirm({title, body, confirmLabel, tone}) => Promise<boolean>`. Replaces every `window.confirm` (role change, block/unblock, product delete) and **adds** a confirm when setting an order to `cancelled` (it restocks — consequential).
- `Toast.tsx`: `useToast()` + single `<Toaster>` region `aria-live="polite"`, success/error tone, auto-dismiss 4 s, `motion-reduce` no slide. Fire on: order status changed, role changed, user blocked/unblocked, product saved/deleted, image uploaded. Action *errors* keep the existing inline banners (already separated from list errors — don't regress that fix).
- `ProductManager` gets optional props `confirm?` and `notify?`; falls back to `window.confirm`/no-op so `/lister` keeps working unchanged.

### 4. Shell
- Deep-link tabs via URL hash (`#orders`), read on mount, `history.replaceState` on change — avoids `useSearchParams` Suspense requirement.
- Nav: `aria-current="page"`, `focus-visible` ring, count badge on Orders (open orders) and Users (blocked, only if >0).
- Sidebar footer: initials avatar + name + "Admin" badge, "View store ↗" link, Log out.
- Header: page title + one-line subtitle per tab, "Updated Xm ago" + single refresh button that reloads the current tab's data.
- Skip-to-content link; mobile tab bar kept, buttons ≥44 px tall.

### 5. Overview
- Fetch `/products/` on mount in page.tsx (fixes "—"); pass products down, `ProductManager` still refreshes it via `onProductsChange`.
- KPIs: **Revenue (excl. cancelled)**, Orders (sub: N open → click goes to Orders filtered open), Avg order value, Customers (sub: N blocked). `tabular-nums`, clickable cards are `<button>`s.
- Keep `RevenueChart` + `OrderStatusBreakdown` (chart excludes cancelled too — check `RevenueChart.tsx`, fix if it sums them).
- New "Needs attention" card: placed orders count, low-stock (<5) and out-of-stock products listed (max 5) → links to Products tab.
- Recent orders rows clickable → Orders tab with that order expanded.

### 6. Orders
- Status filter as pill segmented control with counts (All 12 · Placed 3 …), search + sort kept.
- Compact rows: `#` + last 6 of id (copy button, toast "Copied"), customer, relative date (absolute in `title`), item count, total, status badge + select.
- Row expand (`aria-expanded` button) shows items + full shipping address + phone. 
- "Show 25 more" client-side paging (avoid 200-card wall).
- Empty states with icon + text + "Clear filters" button when filtered.

### 7. Users
- Initials avatar, name + email stacked, "You" chip on own row (compare username); still don't pre-disable self-actions (backend 400 is surfaced — earlier decision).
- Role filter pills with counts; block button gets text label on md+ ("Block"/"Unblock") not icon-only.
- Confirm dialog wording states consequence ("They'll be signed out of protected actions immediately").

### 8. Products (`ProductManager.tsx`, shared)
- Form collapsed behind "Add product" primary button (opens inline panel; edit opens same panel, scrolls into view + focuses Name).
- Table: 40 px thumbnail, search box, low/out-of-stock badges kept.
- Upload: styled file button + image preview of `image_url`.

### 9. Audit log
- Relative time, action badges toned (role_change purple, block_change red), details humanised ("customer → lister", "blocked"), action filter select, note "Showing latest 200".

### 10. Polish sweep
`focus-visible:ring` on all interactive elements, error banners get "Retry" button, every list has a designed empty state, `motion-reduce:` on all transitions, check 390 px no horizontal scroll (tables in `overflow-x-auto`).

## Tests (vitest, alongside existing 20)
- `ConfirmDialog` resolves true/false, Esc = false.
- `Toast` renders in live region and auto-dismisses (fake timers).
- `AdminLogin`: show-password toggles type, error rendered as alert, forgot link present.
- `ui.tsx` formatters; revenue excludes cancelled (extract `computeStats` pure fn into `ui.tsx`).

## Verification
1. `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` in `frontend/`.
2. One Playwright pass at the end (per standing rule) on `next dev` with `window.fetch` mocked for `http://localhost:8000` (orders/users/products/audit fixtures incl. a cancelled order + low-stock product): login (error, show-password, session notice), non-admin card, every tab, confirm dialog, toast, order expand, hash deep link, mobile 390 px. **Real screenshots** for every claim, delete PNGs from repo root after.
3. Check `/lister` still loads and saves (shared ProductManager fallback).
4. Commit locally; ask user before push (push = prod deploy). Update PROGRESS.md with 2-3 lines only.
