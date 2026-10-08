# Stock Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop customers from adding an out-of-stock product to the cart, on both the product grid and the product detail page, without affecting products whose stock is unknown (e.g. demo fallback data).

**Architecture:** Add a single `isOutOfStock = product.stock === 0` check (explicit equality, not truthiness — `undefined` must NOT count as out of stock) at the two places a customer can add to cart: the product grid card (`app/page.tsx`) and the product detail page (`app/products/[id]/page.tsx`). Both already share selection/add-to-cart state via `lib/useAddToCart.ts`, so the quantity-ceiling bug there is fixed once and both callers inherit it. No backend change — `backend/app/routes/orders.py` already rejects an order line when stock is insufficient (409), so this is a UX guard, not the system's only stock check.

**Tech Stack:** Next.js App Router, React (client components), plain CSS (`app/globals.css`). No test runner exists in `frontend/` today (confirmed: no test script in `package.json`, no `*.test.*`/`*.spec.*` files) — verification here is `tsc`/`next build` plus a manual check against the live API, not unit tests. Do not introduce a new test framework for this task.

**Spec:** This plan's spec is the gap identified in conversation: `backend/app/models/product.py` has `stock: int = Field(ge=0)` and the frontend already reads `product.stock` (`lib/shop-store.ts:41`) and even caps quantity by it (`lib/useAddToCart.ts:51`), but nothing disables "Add to bag" or shows an out-of-stock state when `stock === 0`.

## Global Constraints

- `product.stock` is `number | undefined` (`lib/shop-store.ts:15`). `undefined` means "unknown" (demo data, or any future caller that omits it) and must be treated as **in stock** — never add a new code path that blocks on falsy/zero-or-undefined conflation.
- Stock is tracked per product, not per size/color (`backend/app/routes/orders.py:68-69` comment) — do not add per-variant stock logic.
- Follow existing conventions: Tailwind is listed as a dependency but this codebase hand-writes plain CSS classes in `app/globals.css` (see `.quick-add`, `.badge`, `.size-chip`) — new styles go there in the same hand-written style, not as Tailwind utility classes.
- No comments explaining *what* code does — only *why*, matching the existing file style (see the comment blocks already in `useAddToCart.ts` and `orders.py`).

## Review Focus

- `stock === 0` exactly → "Add to bag" must be disabled and not add a line to the cart, on both the grid card and the detail page.
- `stock === undefined` (demo fallback products, or any API response missing the field) → must behave exactly as before this change (fully purchasable, no "Out of stock" badge).
- Quantity stepper on a zero-stock product must not let quantity climb to the old `MAX_QUANTITY` (20) fallback — today's ceiling bug (`product.stock && product.stock > 0 ? ... : MAX_QUANTITY`) treats `0` the same as `undefined` because `0` is falsy.
- A product that is in stock when the page loads but whose cart line can't actually be fulfilled at checkout time (stock changed in between) is **not** this plan's job — confirm (don't re-implement) that `checkout()` in `app/page.tsx` already surfaces the backend's 409 via `extractErrorMessage` instead of silently failing.
- Two product cards rendered at once, only one out of stock → the other card's selection/add-to-cart state must stay independent (already true structurally, since `useAddToCart` keys all state by `product.id`; add one assertion step confirming this isn't accidentally broken by the new code).

---

## Task 1: Fix the quantity ceiling for zero stock

**Files:**
- Modify: `frontend/lib/useAddToCart.ts:50-54`

**Interfaces:**
- Consumes: `Product.stock` (`frontend/lib/shop-store.ts:3-16`, type `number | undefined`)
- Produces: `setQuantity(product, quantity)` behavior relied on by Task 2 and Task 3 (unchanged signature)

- [ ] **Step 1: Read the current implementation**

```ts
const setQuantity = (product: Product, quantity: number) => {
  const ceiling = product.stock && product.stock > 0 ? Math.min(product.stock, MAX_QUANTITY) : MAX_QUANTITY;
  const clamped = Math.min(Math.max(1, Math.trunc(quantity) || 1), ceiling);
  setSelections((current) => ({ ...current, [product.id]: { ...getSelection(product), quantity: clamped } }));
};
```

The bug: `product.stock && product.stock > 0` is `false` for both `stock === 0` and `stock === undefined`, so a zero-stock product falls into the same `MAX_QUANTITY` (20) branch as a product with unknown stock. The grid/detail UI will stop this from being reachable after Task 2/3, but the ceiling itself should still be correct in isolation.

- [ ] **Step 2: Replace the ceiling calculation**

```ts
const setQuantity = (product: Product, quantity: number) => {
  const ceiling = typeof product.stock === "number" ? Math.max(0, Math.min(product.stock, MAX_QUANTITY)) : MAX_QUANTITY;
  const clamped = Math.min(Math.max(1, Math.trunc(quantity) || 1), ceiling);
  setSelections((current) => ({ ...current, [product.id]: { ...getSelection(product), quantity: clamped } }));
};
```

- [ ] **Step 3: Add a defense-in-depth guard in `addToCart`**

In the same file, find:

```ts
const addToCart = (product: Product) => {
  const selection = getSelection(product);
  if (!selection.size) {
    setSizeErrors((current) => ({ ...current, [product.id]: true }));
    return;
  }
```

Change to:

```ts
const addToCart = (product: Product) => {
  if (product.stock === 0) return;
  const selection = getSelection(product);
  if (!selection.size) {
    setSizeErrors((current) => ({ ...current, [product.id]: true }));
    return;
  }
```

This is a second line of defense in case a caller ever renders an enabled button for a zero-stock product by mistake — the UI-level disabling in Task 2/3 is the primary control.

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/useAddToCart.ts
git commit -m "fix: don't let zero stock fall back to the 20-unit quantity ceiling"
```

---

## Task 2: Out-of-stock state on the product grid card

**Files:**
- Modify: `frontend/app/page.tsx:513-585` (the `filteredProducts.map` card block)
- Modify: `frontend/app/globals.css` (new rules near the existing `.badge`/`.quick-add` rules, after line 67)

**Interfaces:**
- Consumes: `setQuantity`, `addToCart`, `getSelection`, `addStatus` from `useAddToCart()` (unchanged, already destructured at `app/page.tsx:194`)
- Produces: nothing new consumed elsewhere — this task is UI-only inside the card's own JSX block

- [ ] **Step 1: Read the current card block**

Already read in full — key lines: the badge (`app/page.tsx:516`), the quick-add button (`app/page.tsx:535-541`), the quantity row (`app/page.tsx:580-584`).

- [ ] **Step 2: Compute `isOutOfStock` per product inside the map**

In `app/page.tsx`, inside `{filteredProducts.map((product) => (` (line 513), right after the opening `<article>` tag's children begin — add before the existing `<div className="product-image">`:

```tsx
{filteredProducts.map((product) => {
  const isOutOfStock = product.stock === 0;
  return (
  <article className={isOutOfStock ? "product-card out-of-stock" : "product-card"} key={product.id}>
```

This changes the `.map((product) => (` arrow function to a block body (`=> { ... return (...) }`) so `isOutOfStock` can be computed once per card — update the closing of the map accordingly (`)})` instead of `))` at the end of the article, i.e. the existing `</article>` stays, but the map's closing changes from:

```tsx
            </article>
          ))}
```

to:

```tsx
            </article>
          );})}
```

- [ ] **Step 3: Swap the badge when out of stock**

Find:

```tsx
                {product.badge && <span className="badge">{product.badge}</span>}
```

Replace with:

```tsx
                {isOutOfStock ? (
                  <span className="badge out-of-stock">Out of stock</span>
                ) : (
                  product.badge && <span className="badge">{product.badge}</span>
                )}
```

(Out-of-stock badge takes priority over a promo badge like "Bestseller" — a product that can't be bought shouldn't be marketed as a bestseller front-and-center.)

- [ ] **Step 4: Disable the quick-add button**

Find:

```tsx
                <button
                  className={addStatus[product.id] ? `quick-add ${addStatus[product.id]}` : "quick-add"}
                  disabled={addStatus[product.id] === "adding"}
                  onClick={() => addToCart(product)}
                >
                  {addStatus[product.id] === "adding" ? "Adding..." : addStatus[product.id] === "added" ? "Added ✓" : <>Add to bag <span>+</span></>}
                </button>
```

Replace with:

```tsx
                <button
                  className={
                    isOutOfStock
                      ? "quick-add out-of-stock"
                      : addStatus[product.id]
                        ? `quick-add ${addStatus[product.id]}`
                        : "quick-add"
                  }
                  disabled={isOutOfStock || addStatus[product.id] === "adding"}
                  onClick={() => addToCart(product)}
                >
                  {isOutOfStock
                    ? "Out of stock"
                    : addStatus[product.id] === "adding"
                      ? "Adding..."
                      : addStatus[product.id] === "added"
                        ? "Added ✓"
                        : <>Add to bag <span>+</span></>}
                </button>
```

- [ ] **Step 5: Disable the quantity stepper**

Find:

```tsx
              <div className="quantity-row">
                <button type="button" aria-label={`Decrease quantity for ${product.name}`} onClick={() => setQuantity(product, getSelection(product).quantity - 1)}>−</button>
                <span>{getSelection(product).quantity}</span>
                <button type="button" aria-label={`Increase quantity for ${product.name}`} onClick={() => setQuantity(product, getSelection(product).quantity + 1)}>+</button>
              </div>
```

Replace with:

```tsx
              <div className="quantity-row">
                <button type="button" disabled={isOutOfStock} aria-label={`Decrease quantity for ${product.name}`} onClick={() => setQuantity(product, getSelection(product).quantity - 1)}>−</button>
                <span>{getSelection(product).quantity}</span>
                <button type="button" disabled={isOutOfStock} aria-label={`Increase quantity for ${product.name}`} onClick={() => setQuantity(product, getSelection(product).quantity + 1)}>+</button>
              </div>
```

- [ ] **Step 6: Add the CSS**

In `frontend/app/globals.css`, after the existing block ending at line 67 (`.quick-add.added { background:#3d6a4aeb; }`), add:

```css
.product-card.out-of-stock .product-image img { opacity:.45; }
.badge.out-of-stock { background:#25221f; color:white; }
.quick-add.out-of-stock { transform:translateY(0); background:#8a857d; cursor:not-allowed; }
.quantity-row button:disabled { opacity:.4; cursor:not-allowed; }
```

(`.quick-add.out-of-stock` forces the button visible via `transform:translateY(0)` — normally `.quick-add` only slides into view on card hover, per the comment at `globals.css:61-64`; an out-of-stock product should show that state without requiring hover.)

- [ ] **Step 7: Typecheck and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/page.tsx frontend/app/globals.css
git commit -m "feat: disable add-to-cart and show a badge for out-of-stock products in the grid"
```

---

## Task 3: Out-of-stock state on the product detail page

**Files:**
- Modify: `frontend/app/products/[id]/page.tsx:56-131`

**Interfaces:**
- Consumes: same `useAddToCart()` functions as Task 2 (already destructured at `app/products/[id]/page.tsx:26`); same `isOutOfStock` definition as Task 2 (`product.stock === 0`) — keep the two in sync, this is not a shared helper because each file already computes small per-render booleans inline (matching existing style, e.g. `selection` at line 44)

- [ ] **Step 1: Compute `isOutOfStock`**

Find:

```tsx
  const selection = product ? getSelection(product) : null;
```

Add immediately after:

```tsx
  const isOutOfStock = product?.stock === 0;
```

- [ ] **Step 2: Swap the badge**

Find:

```tsx
            {product.badge && <span className="badge">{product.badge}</span>}
```

Replace with:

```tsx
            {isOutOfStock ? (
              <span className="badge out-of-stock">Out of stock</span>
            ) : (
              product.badge && <span className="badge">{product.badge}</span>
            )}
```

- [ ] **Step 3: Disable the quantity stepper**

Find:

```tsx
            <div className="quantity-row">
              <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(product, selection.quantity - 1)}>−</button>
              <span>{selection.quantity}</span>
              <button type="button" aria-label="Increase quantity" onClick={() => setQuantity(product, selection.quantity + 1)}>+</button>
            </div>
```

Replace with:

```tsx
            <div className="quantity-row">
              <button type="button" disabled={isOutOfStock} aria-label="Decrease quantity" onClick={() => setQuantity(product, selection.quantity - 1)}>−</button>
              <span>{selection.quantity}</span>
              <button type="button" disabled={isOutOfStock} aria-label="Increase quantity" onClick={() => setQuantity(product, selection.quantity + 1)}>+</button>
            </div>
```

- [ ] **Step 4: Disable the primary add-to-bag button**

Find:

```tsx
              <button
                className={addStatus[product.id] ? `primary-button ${addStatus[product.id]}` : "primary-button"}
                disabled={addStatus[product.id] === "adding"}
                onClick={() => addToCart(product)}
              >
                {addStatus[product.id] === "adding" ? "Adding..." : addStatus[product.id] === "added" ? "Added ✓" : "Add to bag"}
              </button>
```

Replace with:

```tsx
              <button
                className={
                  isOutOfStock
                    ? "primary-button out-of-stock"
                    : addStatus[product.id]
                      ? `primary-button ${addStatus[product.id]}`
                      : "primary-button"
                }
                disabled={isOutOfStock || addStatus[product.id] === "adding"}
                onClick={() => addToCart(product)}
              >
                {isOutOfStock
                  ? "Out of stock"
                  : addStatus[product.id] === "adding"
                    ? "Adding..."
                    : addStatus[product.id] === "added"
                      ? "Added ✓"
                      : "Add to bag"}
              </button>
```

- [ ] **Step 5: Add the one new CSS rule this page needs**

`.badge.out-of-stock` and `.quantity-row button:disabled` already added in Task 2 cover this page too (same global stylesheet). Add the one detail-page-specific rule to `frontend/app/globals.css`, right after the rules added in Task 2 Step 6:

```css
.primary-button.out-of-stock { background:#8a857d; cursor:not-allowed; }
```

- [ ] **Step 6: Typecheck and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "frontend/app/products/[id]/page.tsx" frontend/app/globals.css
git commit -m "feat: disable add-to-cart and show a badge for out-of-stock products on the detail page"
```

---

## Task 4: Manual verification against the live API

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Temporarily zero out one product's stock via the admin UI or API**

Either use the admin product edit page (`frontend/app/admin/page.tsx`), or:

```bash
curl -s -X PUT https://clothing-store-tan-nu.vercel.app/api/products/<product-id> \
  -H "Authorization: Bearer <admin-token>" -H "Content-Type: application/json" \
  -d '{"...": "...", "stock": 0}'
```

(Use an existing product's full current field set, just with `stock: 0` — the `PUT` route replaces the whole document.)

- [ ] **Step 2: Load the homepage in a real browser and confirm**

- The zeroed product shows an "Out of stock" badge instead of its usual promo badge (if any).
- Its "Add to bag" button reads "Out of stock", is greyed out, and does nothing when clicked.
- Its quantity +/- buttons are disabled.
- Every other product card is unaffected: normal badge, working "Add to bag", working quantity stepper.

- [ ] **Step 3: Load that product's detail page directly (`/products/<id>`) and confirm the same three things there.**

- [ ] **Step 4: Restore the product's original stock value** (undo Step 1 — don't leave a live product permanently zeroed from a test).

- [ ] **Step 5: Confirm demo/fallback behavior is unaffected**

With JavaScript briefly disabled, or by inspecting the initial server-rendered HTML (`curl -s https://clothing-store-tan-nu.vercel.app/ | grep -o "Out of stock"`), confirm the demo products (which have no `stock` field) show no "Out of stock" badge and render a normal, enabled "Add to bag" button in the pre-hydration HTML.

- [ ] **Step 6: Confirm two cards don't leak state into each other**

With the one zeroed product from Step 1 still zeroed, pick a different, in-stock product on the same grid and:
- Select a size/color and bump its quantity to 2+.
- Confirm the zeroed product's own selection/quantity row is untouched (still shows its own independent state, buttons still disabled) and the in-stock product's quantity actually changed and its "Add to bag" still works.

This isn't new code to verify — `useAddToCart`'s `selections`/`addStatus` are already keyed by `product.id` (`lib/useAddToCart.ts:23-25`) — the step exists to confirm this plan's changes didn't accidentally break that isolation (e.g. by capturing a stale `product` reference across cards).

- [ ] **Step 7: Confirm the pre-existing checkout stock race is still surfaced, not swallowed**

This plan does not touch `checkout()` — confirm it doesn't need to:

```bash
grep -n "409\|extractErrorMessage\|Could not place the order" frontend/app/page.tsx
```

Expected: `checkout()` (`app/page.tsx:390-450`) still calls `extractErrorMessage(data, "Could not place the order.")` and sets `checkoutError` on any non-OK response — including the backend's 409 "Not enough stock" (`backend/app/routes/orders.py:77-80`) for the rare case where stock hits 0 *after* this page's own check passed but *before* the order is placed. If this ever stops being true, that's a regression in `checkout()`, not something Task 1-3 introduced.
