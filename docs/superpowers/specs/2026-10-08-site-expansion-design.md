# Site Expansion: Roles, Real Pages, Payment UI — Design Spec

**Date:** 2026-10-08
**Status:** Approved by user, pending implementation plan(s)

## Goal

Take Thread&Co from a 3-route, modal-heavy prototype to a 15-page
professional storefront with three real actors (Customer, Lister, Admin),
without integrating a real payment processor. Every flow a customer,
lister, or admin would expect from a real store must work end-to-end
against this codebase's own database — no mocked data, no dead UI.

## Non-Goals (explicitly out of scope)

- Real payment processing (Stripe or any other PSP). The checkout flow
  ends in a payment-looking UI that creates the order; no card data is
  ever transmitted or stored.
- Email/SMS notifications (order confirmation emails, etc.)
- Shipping carrier integration (label generation, tracking numbers from a
  real carrier API)
- Multi-currency / multi-language
- Per-lister product ownership tracking (every Lister can manage every
  product, same as Admin's product permissions today — decided explicitly
  during brainstorming, see rationale below)

## Actors & Permission Matrix

Replaces the current binary `is_admin: bool` with a three-value
`role: "customer" | "lister" | "admin"`.

| Capability                          | Customer | Lister | Admin |
|--------------------------------------|:--------:|:------:|:-----:|
| Browse/search/buy products           | ✅ | ✅ | ✅ |
| View own order history               | ✅ | ✅ | ✅ |
| Create/edit/delete products          | ❌ | ✅ | ✅ |
| View all orders                      | ❌ | ❌ | ✅ |
| Change order status                  | ❌ | ❌ | ✅ |
| View/manage users (promote/block)    | ❌ | ❌ | ✅ |

Rationale for "Lister = same product permissions as Admin, no ownership
scoping": confirmed with user during brainstorming — Lister is trusted
staff whose listings go live immediately (no approval queue), and the
only hard boundary requested is that Listers never touch orders or
customer data. Per-lister ownership was considered and explicitly
declined (adds a `listed_by` field, ownership-check middleware, and an
"Admin can override any Lister" escape hatch — complexity not asked for).

Lister accounts are never self-service. `/register` only ever creates a
`customer`. An Admin promotes a user to `lister` (or `admin`, or back to
`customer`) from the new Admin → Users tab.

## Data Model Changes

### `users` collection

- Add `role: str` (`"customer" | "lister" | "admin"`), replacing
  `is_admin: bool` entirely — not kept alongside it. This app has no real
  customers yet (5 rows in production today per last session's check), so
  a clean break is cheaper than a compatibility shim nobody needs.
- Add `is_blocked: bool` (default `False`). A blocked user can no longer
  log in (existing JWTs still work until they expire — 30 minutes — which
  is an accepted gap, not something this phase fixes).
- Add `created_at: datetime` at registration (currently missing — needed
  so Admin's Users tab can show "member since").

**One-time production migration** (run once, by hand, against the Atlas
database, documented as a task in the implementation plan — not an
automatic startup migration, since this is a single manual cutover for a
handful of existing rows):

```python
# Pseudocode for the one-off migration task
await db["users"].update_many({"is_admin": True}, {"$set": {"role": "admin"}})
await db["users"].update_many({"is_admin": {"$ne": True}}, {"$set": {"role": "customer"}})
await db["users"].update_many({}, {"$unset": {"is_admin": ""}}, {"$set": {"is_blocked": False}})
await db["users"].update_many({"created_at": {"$exists": False}}, {"$set": {"created_at": datetime.now(timezone.utc)}})
```

### `products` collection

No schema change. Lister and Admin share the exact same create/update/
delete permission check.

### `orders` collection

No schema change beyond what idempotency already added.

## Backend Changes

### `app/models/user.py`

- `UserRegister`: unchanged (still just username/email/password — no role
  field, so a crafted request body can't self-grant `lister`/`admin`).
- `UserResponse`: `is_admin: bool` field removed, replaced with
  `role: Literal["customer", "lister", "admin"]`.
- New `UserSummary` model for the Admin Users list: `id`, `username`,
  `email`, `role`, `is_blocked`, `created_at`.
- New `UserRoleUpdate` model: `role: Literal["customer", "lister", "admin"]`.
- New `UserBlockUpdate` model: `is_blocked: bool`.

### `app/services/auth_service.py`

- `CurrentUser` TypedDict: `is_admin: bool` → `role: str`.
- `create_access_token` callers now embed `"role"` instead of `"is_admin"`
  in the JWT payload.
- `get_current_user`: reads `payload.get("role", "customer")` instead of
  `is_admin`.
- `require_admin`: checks `current_user["role"] == "admin"` (same
  behavior, just reading the new field).
- New `require_role(*roles: str)` dependency factory:
  ```python
  def require_role(*roles: str):
      def _check(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
          if current_user["role"] not in roles:
              raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
          return current_user
      return _check
  ```
  `require_admin` can be expressed as `require_role("admin")` but is kept
  as its own named function (existing routes already import it by name;
  no value in a mechanical rename).

### `app/routes/auth.py`

- `register`: stores `"role": "customer"`, `"is_blocked": False`,
  `"created_at": datetime.now(timezone.utc)` instead of `"is_admin": False`.
  Token and `UserResponse` carry `role="customer"`.
- `login`: after verifying the password, check `existing.get("is_blocked", False)`
  — if blocked, `403 "Your account has been blocked. Contact support."`
  (checked *after* password verification, so a wrong password on a
  blocked account still reports "Invalid email or password", not leaking
  block status to someone who doesn't already know the password).
  Reads `existing.get("role", "customer")` for the token/response.

### `app/routes/products.py`

- `create_product`, `update_product`, `delete_product`: dependency
  changes from `Depends(require_admin)` to
  `Depends(require_role("admin", "lister"))`.

### `app/routes/users.py` (new file)

Admin-only user management, mirroring the existing route style in
`orders.py`:

```python
router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/", response_model=list[UserSummary])
async def list_users(_: CurrentUser = Depends(require_admin)): ...
# returns every user, serialized like serialize_order (drop _id, add id)

@router.patch("/{user_id}/role", response_model=UserSummary)
async def update_user_role(user_id: str, update: UserRoleUpdate, current_user: CurrentUser = Depends(require_admin)): ...
# 400 if user_id resolves to current_user["user_id"] and update.role != "admin"
# (an admin can't demote/lock themselves out — the one guard this route needs)

@router.patch("/{user_id}/block", response_model=UserSummary)
async def update_user_block(user_id: str, update: UserBlockUpdate, current_user: CurrentUser = Depends(require_admin)): ...
# same self-block guard: 400 if user_id == current_user["user_id"]
```

Registered in `app/main.py` alongside the other routers.

### Tests

`backend/tests/conftest.py`:
- `make_admin` fixture: `{"$set": {"is_admin": True}}` →
  `{"$set": {"role": "admin"}}`.
- New `make_lister` fixture, same shape, setting `role="lister"`.
- `seed_product`/`register_user` fixtures need no change.

New `backend/tests/test_users.py` covering: list requires admin,
lister/customer get 403, promote customer→lister, promote→admin, demote
admin→customer, block/unblock, blocked user can't log in (but gets the
*same* 401 message for wrong password — a blocked user with the *right*
password gets 403), admin can't block/demote themselves.

Existing `test_auth.py`, `test_products.py`, `test_orders.py`: update any
assertions reading `is_admin` in response bodies to read `role` instead.

## Frontend Changes

### Route Map (final)

| Path                   | New or existing | Auth required      | Replaces |
|-------------------------|-----------------|---------------------|----------|
| `/`                     | existing        | none                 | — |
| `/shop`                 | **new**         | none                 | catalog grid section of `/` |
| `/products/[id]`        | existing        | none                 | — |
| `/cart`                 | **new**         | none (guest cart)    | cart drawer in `page.tsx` |
| `/checkout`             | **new**         | customer login       | checkout modal in `page.tsx` |
| `/checkout/payment`     | **new**         | customer login       | — (new step) |
| `/orders/[id]`          | **new**         | owner or admin       | — |
| `/login`                | **new**         | guest-only            | auth modal (login tab) |
| `/register`             | **new**         | guest-only            | auth modal (register tab) |
| `/account`              | **new**         | customer login        | order-history section of `/` |
| `/admin`                | existing, extended | admin role         | — (adds Users tab) |
| `/lister`               | **new**         | lister or admin role  | — |
| `/about`                | **new**         | none                  | — |
| `/contact`              | **new**         | none                  | — |
| `/policies`             | **new**         | none                  | — |

### State/logic reuse (no rewrite of working logic)

- `lib/shop-store.ts` (cart/wishlist localStorage + `Product`/`CartLine`
  types) stays as-is and is imported by `/cart`, `/checkout`, and the
  product grid on `/` and `/shop` — it is already route-agnostic.
- `lib/auth-store.ts`: `getIsAdminSnapshot`/`getIsAdminServerSnapshot`/
  `AUTH_IS_ADMIN_KEY` are renamed to `getRoleSnapshot`/
  `getRoleServerSnapshot`/`AUTH_ROLE_KEY` (string role, default
  `"customer"` instead of a boolean). `writeAuth(token, user, role)`
  replaces the `isAdmin` boolean parameter with the role string. Add two
  pure helpers, `isAdminRole(role)` and `isListerOrAdminRole(role)`, so
  call sites read as intent rather than re-deriving string comparisons
  inline.
- `lib/useAddToCart.ts`: unchanged logic, reused by `/shop`,
  `/products/[id]`, and the home page's featured section.
- `frontend/app/page.tsx` (currently 700+ lines holding hero + grid +
  cart drawer + checkout + auth modal + order history + chat widget):
  strip out the cart drawer, checkout modal, auth modal, and order-history
  section — each becomes the page it's listed as above. `page.tsx` keeps
  the hero, featured-products section, and chat widget, and shrinks
  substantially as a direct result (this *is* the dead-weight reduction
  flagged in the earlier PhD-level review, achieved as a side effect of
  giving each flow its own route rather than as a separate cleanup pass).
- Existing is_admin call sites, both currently reading
  `Boolean(data.user.is_admin)`:
  - `frontend/app/admin/page.tsx:247`
  - `frontend/app/page.tsx:329`

  both become `String(data.user.role ?? "customer")`, passed to the
  updated `writeAuth`.
- `frontend/app/admin/page.tsx:125,217,228,231,361`: `isAdmin` boolean
  becomes `role` string read via `getRoleSnapshot`; gate checks become
  `isAdminRole(role)`.

### New pages, behavior detail

- **`/shop`**: full product grid (reuses `productFromApi`, `useAddToCart`)
  plus category filter and a text search box — filtering client-side
  over the already-fetched catalog (the backend's `GET /products/?category=`
  already supports server-side category filtering; search stays
  client-side since there's no backend search endpoint and adding one is
  not required to meet this page's purpose).
- **`/cart`**: reads `getCartSnapshot`/`writeCart` directly; quantity
  stepper per line, remove-line button, subtotal, "Proceed to Checkout"
  button disabled when cart is empty or when not logged in (shows a
  "Log in to checkout" prompt linking to `/login?next=/checkout`).
- **`/checkout`**: shipping address form (same fields as the existing
  `ShippingAddress` model) + order summary; "Continue to Payment" stores
  the draft address in a short-lived `sessionStorage` key (not
  localStorage — a checkout-in-progress address shouldn't survive past
  the browser session) and navigates to `/checkout/payment`.
- **`/checkout/payment`**: a card-shaped form (card number, expiry, CVC —
  client-side format validation only, Luhn-checked so obviously-fake
  input is still rejected the way a real form would, but **never sent
  anywhere**) with a prominent "Demo payment — no real charge is made"
  notice. Submitting calls the existing `POST /orders/` with the
  `Idempotency-Key` pattern already implemented, using the address drafted
  in `/checkout`. On success: clear cart, clear the sessionStorage draft,
  redirect to `/orders/[id]`.
- **`/orders/[id]`**: fetches `GET /orders/me` (existing endpoint) and
  finds the matching id client-side (no new backend endpoint needed — the
  existing one already returns everything a customer is allowed to see,
  and adding a single-order endpoint purely to avoid one client-side
  `.find()` is not justified). Shows status, items, address, total.
  Admins reaching this URL for an order that isn't theirs: existing
  `GET /orders/me` is owner-scoped, so for an admin this page instead
  calls `GET /orders/` (existing admin-only endpoint) and finds it there —
  the page checks `role` client-side to pick which list to query.
- **`/login`**, **`/register`**: the existing modal's form JSX moved
  verbatim into dedicated pages; `?next=` query param support so `/cart`
  and `/checkout` can send the user back to where they started.
- **`/account`**: profile header (username/email, read-only) + order
  history list (reuses the same `GET /orders/me` call and rendering
  currently in `page.tsx`'s order-history section).
- **`/lister`**: same product CRUD table/form UI as `/admin`'s Products
  tab, extracted into a shared component (`components/ProductManager.tsx`)
  used by both `/admin` and `/lister`, so the two don't duplicate the form
  logic. `/lister` renders only that component; `/admin` renders it plus
  Orders and Users tabs.
- **Admin Users tab**: table of `GET /users/`, a role `<select>` per row
  (customer/lister/admin) calling `PATCH /users/{id}/role`, and a
  block/unblock toggle calling `PATCH /users/{id}/block`. Disabled for the
  row matching the logged-in admin's own id (backend already rejects it;
  disabling client-side avoids a pointless round trip and an error toast
  for an action that can never succeed).
- **`/about`**: static copy — Thread&Co's story, mission, a values
  section. Editable sample copy, not a CMS.
- **`/contact`**: static contact details (support email, hours) + a
  contact form that `POST`s to... **nothing new**: there's no backend
  support-ticket system in scope, so the form collects name/email/message
  and shows a "Thanks, we'll get back to you" confirmation without
  actually sending anywhere. This is flagged explicitly so it's never
  mistaken for a wired-up feature later: a one-line code comment on the
  submit handler says why it's a no-op.
- **`/policies`**: three sections on one page (Privacy Policy, Terms of
  Service, Returns & Refunds), anchor-linked from a small in-page nav.
  Static sample legal copy — explicitly not reviewed by an actual lawyer,
  which the plan should not need to say twice but is worth saying once:
  this is placeholder legal text suitable for a demo, not a real store.

### `next/` version note

This repo runs Next.js 16.3.8, which long ago made `params` and
`searchParams` async (`Promise<...>`, not plain objects) — the existing
`app/products/[id]/page.tsx` already follows this correctly and is the
pattern to copy for `app/orders/[id]/page.tsx`. Per
`frontend/AGENTS.md`, consult `node_modules/next/dist/docs/01-app/` for
any App Router API this spec doesn't already pin down.

## Testing Strategy

- Backend: TDD per existing convention (see `test_orders.py` for style).
  Every new/changed route gets request-level tests in the matching
  `test_*.py` file, run against local MongoDB via the existing
  `conftest.py` fixtures.
- Frontend: this repo has no frontend test framework (confirmed last
  session — no test runner in `package.json`). Verification for frontend
  tasks is `tsc --noEmit`, `npm run build`, and a manual click-through of
  the new route against the local backend — consistent with how the
  idempotency-key frontend change was verified. Adding a frontend test
  framework is out of scope for this spec (it's a standalone
  infrastructure decision, not required by any of the pages above).

## Review Focus (carried into the implementation plan)

1. A customer who is promoted to `lister` mid-session is still holding an
   old JWT with `role: "customer"` — `/lister` must redirect rather than
   blank-render until they log out/in again.
2. Blocking a user who is mid-checkout (valid JWT, not yet expired) must
   not let `POST /orders/` through — `get_current_user` doesn't check
   `is_blocked` today (only `login` would), so a blocked user's existing
   token keeps working for up to 30 minutes. Decide and document this
   gap rather than silently shipping it (acceptable short-term: documented
   as a known limitation, same tier as the existing no-revocation JWT
   design).
3. `/checkout/payment`'s Luhn check must reject obviously-invalid card
   numbers even though nothing is transmitted — an empty/no-op validator
   would make the "demo" feel broken rather than deliberate.
4. Admin demoting the *last* remaining admin (other than themselves) to
   customer/lister is allowed by the spec as written (only self-demotion
   is blocked) — worth a test that confirms this is intentional, not an
   oversight, since it can lock everyone out of `/admin`.
5. `/orders/[id]` for an order id that doesn't belong to the viewer and
   isn't found in either `/orders/me` or (for admins) `/orders/` must
   show a real "not found" state, not a blank page or unhandled fetch
   error.

## Rollout Order

1. Backend role model + permission changes + Users API (foundation —
   nothing else can be built against roles until this lands).
2. Frontend auth-store rename + admin page's `is_admin` → `role` fixes
   (keeps `/admin` working the moment step 1 ships — not deferred, since
   leaving it broken between steps would be shipping a regression).
3. Page restructuring: `/login`, `/register`, `/cart`, `/checkout`,
   `/checkout/payment`, `/orders/[id]`, `/account`, `/shop` (the bulk of
   the frontend work, and the part users actually feel).
4. `/lister` page + Admin Users tab (depends on step 1's API and step 3's
   established page patterns).
5. `/about`, `/contact`, `/policies` + final dead-code pass over
   `page.tsx` now that steps 2-3 have already shrunk it.

Each step is its own implementation plan document and its own set of
commits — consistent with "commit as you go, never lose work" from the
start of this session.
