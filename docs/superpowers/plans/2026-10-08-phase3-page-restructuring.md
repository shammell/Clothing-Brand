# Phase 3: Page Restructuring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the modal/drawer-based flows in `frontend/app/page.tsx`
(auth, cart, checkout, order history) into real routes: `/shop`,
`/login`, `/register`, `/cart`, `/checkout`, `/checkout/payment`,
`/orders/[id]`, `/account`. Apply the spec's CSS-only micro-animation
guidelines while doing so.

**Architecture:** Extract shared logic into `lib/useAuthForm.ts` and a
`components/ProductCard.tsx`, both consumed by the new pages and the
shrunk `page.tsx`, so no behavior is duplicated across files. Every new
page is a client component following the existing
`app/products/[id]/page.tsx` precedent (`useParams` for route params,
`useSyncExternalStore` for localStorage-backed state, hand-written CSS
classes already in `globals.css` reused directly — no new styling
system).

**Tech Stack:** Next.js 16 App Router, TypeScript, existing
`lib/auth-store.ts` / `lib/shop-store.ts` / `lib/useAddToCart.ts`.

**Spec:** `docs/superpowers/specs/2026-10-08-site-expansion-design.md`
(sections: Frontend Changes, UI/UX & Micro-interaction Guidelines)

**Depends on:** Phase 2 (role-aware `auth-store.ts`) must be merged
first — `/orders/[id]` needs `isAdminRole`/the `role` snapshot to decide
which orders endpoint to call.

## Global Constraints

- No new frontend dependency (per spec: CSS-only animation, no Framer
  Motion or similar).
- Every new page reuses existing CSS classes from `globals.css` where
  one already fits (e.g. `.auth-modal`'s input/button styling, `.cart-item`,
  `.shipping-form`, `.orders-list`) — only page-layout wrapper classes and
  the micro-animation classes are new.
- `lib/shop-store.ts`, `lib/useAddToCart.ts` are not modified in this
  phase — their logic is already route-agnostic and correct.
- Every page that fetches data handles the loading/error/empty states
  the same way the existing `page.tsx`/`products/[id]/page.tsx` do
  (explicit `loading`/`error` state, never an unhandled promise).

## Review Focus

1. **`/checkout/payment` with no draft address.** If a user navigates
   directly to `/checkout/payment` (bookmarked URL, back button after
   clearing sessionStorage) with no address saved by `/checkout`, the
   page must redirect to `/checkout`, not render a payment form with no
   destination for the order.
2. **Luhn validation isn't a no-op.** An obviously-fake card number
   (e.g. `1111 1111 1111 1111`) must be rejected client-side before the
   "Pay" button is enabled — confirms the demo payment form behaves like
   a real one would, per spec Review Focus item 3.
3. **`/orders/[id]` for a non-existent or someone-else's order.** Must
   render a clear "Order not found" state, not a blank page, an
   unhandled fetch rejection, or a console error.
4. **`/cart` with an empty cart reached via direct navigation.** Must
   show the existing empty-state UI, with no "Proceed to checkout"
   action available.
5. **Already-authenticated user visiting `/login` or `/register`.** Must
   redirect to `/account` rather than showing a login form to someone
   already logged in.

---

### Task 1: Shared foundations — `ProductCard`, `useAuthForm`, `useInViewport`, animation CSS

**Files:**
- Create: `frontend/components/ProductCard.tsx`
- Create: `frontend/lib/useAuthForm.ts`
- Create: `frontend/lib/useInViewport.ts`
- Modify: `frontend/app/globals.css`

**Interfaces:**
- Produces: `<ProductCard product wishlist onToggleWishlist {...useAddToCart()} />`,
  `useAuthForm(mode, onSuccess)`, `useInViewport<T>()` — consumed by
  every task below.

- [ ] **Step 1: Extract `ProductCard`** from the existing grid markup in
  `frontend/app/page.tsx` (the `<article className="product-card">`
  block, lines 525-596 as it exists today):

```tsx
// frontend/components/ProductCard.tsx
"use client";

import Link from "next/link";
import { FALLBACK_IMAGE, type Product } from "@/lib/shop-store";
import type { useAddToCart } from "@/lib/useAddToCart";

type AddToCartApi = ReturnType<typeof useAddToCart>;

type ProductCardProps = AddToCartApi & {
  product: Product;
  wishlist: string[];
  onToggleWishlist: (productId: string) => void;
};

export function ProductCard({
  product,
  wishlist,
  onToggleWishlist,
  getSelection,
  selectSize,
  selectColor,
  setQuantity,
  addToCart,
  addStatus,
  sizeErrors,
}: ProductCardProps) {
  const selection = getSelection(product);
  return (
    <article className="product-card reveal">
      <div className="product-image">
        {product.badge && <span className="badge">{product.badge}</span>}
        <Link href={`/products/${product.id}`}>
          <img
            src={product.image}
            alt={product.name}
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = FALLBACK_IMAGE;
            }}
          />
        </Link>
        <button
          className={wishlist.includes(product.id) ? "heart active" : "heart"}
          aria-label={wishlist.includes(product.id) ? `Remove ${product.name} from saved` : `Save ${product.name}`}
          aria-pressed={wishlist.includes(product.id)}
          onClick={() => onToggleWishlist(product.id)}
        >
          {wishlist.includes(product.id) ? "♥" : "♡"}
        </button>
        <button
          className={addStatus[product.id] ? `quick-add ${addStatus[product.id]}` : "quick-add"}
          disabled={addStatus[product.id] === "adding"}
          onClick={() => addToCart(product)}
        >
          {addStatus[product.id] === "adding" ? "Adding..." : addStatus[product.id] === "added" ? "Added ✓" : <>Add to bag <span>+</span></>}
        </button>
      </div>
      <div className="product-info">
        <div>
          <h3><Link href={`/products/${product.id}`}>{product.name}</Link></h3>
          <p>{product.category}</p>
        </div>
        <strong>${product.price.toFixed(2)}</strong>
      </div>
      <div className="size-row">
        {product.sizes.map((size) => (
          <button
            key={size}
            type="button"
            className={selection.size === size ? "size-chip active" : "size-chip"}
            aria-pressed={selection.size === size}
            onClick={() => selectSize(product, size)}
          >
            {size}
          </button>
        ))}
      </div>
      {sizeErrors[product.id] && <p className="size-error">Select a size to add to bag</p>}
      <div className="product-meta">
        <span className="stars">★★★★★ <small>{product.rating}</small></span>
        <span className="swatches">
          {product.colors.map((color) => (
            <button
              key={color}
              type="button"
              className={selection.color === color ? "swatch active" : "swatch"}
              style={{ backgroundColor: color }}
              aria-label={`Select color ${color}`}
              aria-pressed={selection.color === color}
              onClick={() => selectColor(product, color)}
            />
          ))}
        </span>
      </div>
      <div className="quantity-row">
        <button type="button" aria-label={`Decrease quantity for ${product.name}`} onClick={() => setQuantity(product, selection.quantity - 1)}>−</button>
        <span>{selection.quantity}</span>
        <button type="button" aria-label={`Increase quantity for ${product.name}`} onClick={() => setQuantity(product, selection.quantity + 1)}>+</button>
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Create `useAuthForm`** (replaces the inline `submitAuth`
  logic currently in `page.tsx`, parameterized so `/login` and
  `/register` each use it without duplicating the fetch call):

```typescript
// frontend/lib/useAuthForm.ts
"use client";

import { useState } from "react";
import { extractErrorMessage, writeAuth } from "./auth-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export function useAuthForm(mode: "login" | "register", onSuccess: () => void) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setLoading(true);
    const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
    const body = mode === "login" ? { email, password } : { username: name, email, password };
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(extractErrorMessage(data, "Authentication failed."));
        return;
      }
      writeAuth(data.access_token, data.user.username, data.user.role ?? "customer");
      setPassword("");
      onSuccess();
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  return { name, setName, email, setEmail, password, setPassword, error, loading, submit };
}
```

- [ ] **Step 3: Create `useInViewport`**

```typescript
// frontend/lib/useInViewport.ts
"use client";

import { useEffect, useRef, useState } from "react";

// Scroll-reveal primitive: toggles isVisible once the element first
// intersects the viewport, then disconnects - a one-shot reveal, not a
// repeating show/hide on every scroll past the element.
export function useInViewport<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}
```

- [ ] **Step 4: Add micro-animation and page-layout CSS**

```css
/* Append to frontend/app/globals.css */

/* Micro-interactions (hover/press feedback) - applied via class, not
   copy-pasted per component. Kept to transform/box-shadow only so it
   never affects layout (no width/height/margin transitions). */
.interactive { transition: transform 150ms ease, box-shadow 150ms ease; }
.interactive:hover { transform: scale(1.02); }
.interactive:active { transform: scale(0.98); }

/* Scroll-reveal: starts hidden/offset, animates in once useInViewport
   flips isVisible. Elements above the fold never get this class, so
   nothing is invisible on first paint. */
.reveal { opacity: 0; transform: translateY(16px); transition: opacity 400ms ease, transform 400ms ease; }
.reveal.is-visible { opacity: 1; transform: translateY(0); }

/* One-shot cart icon feedback when an item is added - class is applied
   briefly then removed by the component, not a permanent state. */
@keyframes cart-bounce { 0%, 100% { transform: scale(1); } 30% { transform: scale(1.25); } 60% { transform: scale(0.95); } 80% { transform: scale(1.08); } }
.cart-button.bump b { animation: cart-bounce 420ms ease; }

/* Standalone page layout (login, register, cart, checkout, account,
   order detail) - narrower and simpler than the homepage's full-width
   sections, consistent with product-detail's existing precedent. */
.page-shell { padding: 60px 8vw 100px; max-width: 720px; margin: 0 auto; }
.page-shell h1 { font-size: clamp(30px, 4vw, 44px); margin: 0 0 28px; }

/* Inline loading spinner for submit buttons - replaces "just wait with
   no feedback" on /login, /register, /checkout, /checkout/payment. */
.spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin 600ms linear infinite; margin-right: 6px; vertical-align: -1px; }
@keyframes spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: Clean (these are new, unreferenced-yet files/CSS — nothing
should break).

- [ ] **Step 6: Commit**

```bash
git add frontend/components/ProductCard.tsx frontend/lib/useAuthForm.ts frontend/lib/useInViewport.ts frontend/app/globals.css
git commit -m "Add shared ProductCard, useAuthForm, useInViewport, and animation CSS"
```

---

### Task 2: `/shop` — full catalog page

**Files:**
- Create: `frontend/app/shop/page.tsx`

**Interfaces:**
- Consumes: `ProductCard`, `useAddToCart`, `productFromApi`,
  `getWishlistSnapshot`/`getWishlistServerSnapshot`, `toggleWishlist`
  (all existing/Task 1).

- [ ] **Step 1: Write the page** (category filter + search, same
  filtering logic as the existing `page.tsx`, fetching the live catalog
  the same way):

```tsx
// frontend/app/shop/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ProductCard } from "@/components/ProductCard";
import { subscribeToStorage } from "@/lib/auth-store";
import {
  type Product,
  getWishlistServerSnapshot,
  getWishlistSnapshot,
  productFromApi,
  toggleWishlist,
} from "@/lib/shop-store";
import { useAddToCart } from "@/lib/useAddToCart";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const CATEGORIES = ["All", "T-Shirts", "Jeans", "Dresses", "Hoodies", "Shoes", "Shirts"];

export default function ShopPage() {
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [query, setQuery] = useState("");
  const wishlist = useSyncExternalStore(subscribeToStorage, getWishlistSnapshot, getWishlistServerSnapshot);
  const addToCartApi = useAddToCart();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`${API_BASE}/products/`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Products unavailable"))))
      .then((data: Array<Record<string, unknown>>) => setCatalog(data.map(productFromApi)))
      .catch(() => setCatalog([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredProducts = useMemo(
    () =>
      catalog.filter(
        (product) =>
          (activeCategory === "All" || product.category === activeCategory) &&
          product.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [activeCategory, query, catalog],
  );

  return (
    <main className="store-shell">
      <nav className="navbar">
        <Link className="brand" href="/">THREAD<span>&</span>CO</Link>
        <Link href="/" className="back-link">← Back home</Link>
      </nav>

      <section className="category-strip">
        <label className="search-box">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products..." />
        </label>
        <div className="category-list">
          {CATEGORIES.map((category) => (
            <button
              className={activeCategory === category ? "category active interactive" : "category interactive"}
              key={category}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </section>

      <section className="products-section">
        <div className="section-heading">
          <div><p className="eyebrow">FULL COLLECTION</p><h2>Shop everything</h2></div>
          <span>{loading ? "Loading..." : `${filteredProducts.length} styles`}</span>
        </div>
        <div className="product-grid">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              wishlist={wishlist}
              onToggleWishlist={(id) => toggleWishlist(wishlist, id)}
              {...addToCartApi}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: Clean.

- [ ] **Step 3: Manual verification** — with the backend running, visit
  `/shop`, confirm the catalog loads, category filter and search both
  narrow the grid, and "Add to bag" works identically to the home page's
  current grid.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/shop/page.tsx
git commit -m "Add /shop full catalog page"
```

---

### Task 3: `/login` and `/register` pages

**Files:**
- Create: `frontend/app/login/page.tsx`
- Create: `frontend/app/register/page.tsx`

**Interfaces:**
- Consumes: `useAuthForm` (Task 1), `getCurrentUserSnapshot`/
  `getAuthServerSnapshot`/`subscribeToStorage` (existing).

- [ ] **Step 1: Write `/login`**

```tsx
// frontend/app/login/page.tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { getAuthServerSnapshot, getCurrentUserSnapshot, subscribeToStorage } from "@/lib/auth-store";
import { useAuthForm } from "@/lib/useAuthForm";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);
  const next = searchParams.get("next") || "/account";
  const { email, setEmail, password, setPassword, error, loading, submit } = useAuthForm("login", () => router.push(next));

  useEffect(() => {
    if (currentUser) router.replace("/account");
  }, [currentUser, router]);

  if (currentUser) return null;

  return (
    <main className="page-shell">
      <Link href="/" className="back-link">← Back home</Link>
      <h1>Welcome back.</h1>
      <form
        className="auth-modal"
        style={{ margin: 0, width: "100%", boxShadow: "none", padding: 0 }}
        onSubmit={(event) => { event.preventDefault(); submit(); }}
      >
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" />
        <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-submit interactive" type="submit" disabled={loading}>
          {loading && <span className="spinner" />}
          {loading ? "Signing in..." : "Log in"}
        </button>
        <Link href={`/register${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`} className="auth-switch">
          Need an account? Sign up
        </Link>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Write `/register`** (same structure, register mode and
  the extra name field):

```tsx
// frontend/app/register/page.tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { getAuthServerSnapshot, getCurrentUserSnapshot, subscribeToStorage } from "@/lib/auth-store";
import { useAuthForm } from "@/lib/useAuthForm";

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);
  const next = searchParams.get("next") || "/account";
  const { name, setName, email, setEmail, password, setPassword, error, loading, submit } = useAuthForm("register", () => router.push(next));

  useEffect(() => {
    if (currentUser) router.replace("/account");
  }, [currentUser, router]);

  if (currentUser) return null;

  return (
    <main className="page-shell">
      <Link href="/" className="back-link">← Back home</Link>
      <h1>Create your account.</h1>
      <form
        className="auth-modal"
        style={{ margin: 0, width: "100%", boxShadow: "none", padding: 0 }}
        onSubmit={(event) => { event.preventDefault(); submit(); }}
      >
        <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" />
        <input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password (min 8 characters)" />
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-submit interactive" type="submit" disabled={loading}>
          {loading && <span className="spinner" />}
          {loading ? "Creating account..." : "Create account"}
        </button>
        <Link href={`/login${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`} className="auth-switch">
          Already have an account? Log in
        </Link>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: Clean.

- [ ] **Step 4: Manual verification** — visit `/login` while logged out,
  log in, confirm redirect to `/account` (will 404 until Task 8 lands —
  acceptable at this point in the plan, note it and continue); visit
  `/login?next=/cart`, log in, confirm redirect to `/cart`; visit
  `/login` while already logged in, confirm immediate redirect.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/login/page.tsx frontend/app/register/page.tsx
git commit -m "Add dedicated /login and /register pages"
```

---

### Task 4: `/cart` page

**Files:**
- Create: `frontend/app/cart/page.tsx`

**Interfaces:**
- Consumes: `getCartSnapshot`/`getCartServerSnapshot`/`writeCart`
  (existing `shop-store.ts`), `getCurrentUserSnapshot` (existing
  `auth-store.ts`).

- [ ] **Step 1: Write the page** (cart item list + quantity controls
  extracted from the existing cart drawer, minus the shipping form and
  checkout button, which move to `/checkout`):

```tsx
// frontend/app/cart/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { getAuthServerSnapshot, getCurrentUserSnapshot, subscribeToStorage } from "@/lib/auth-store";
import { FALLBACK_IMAGE, getCartServerSnapshot, getCartSnapshot, writeCart } from "@/lib/shop-store";

export default function CartPage() {
  const router = useRouter();
  const cart = useSyncExternalStore(subscribeToStorage, getCartSnapshot, getCartServerSnapshot);
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);

  const removeFromCart = (index: number) => {
    writeCart(cart.filter((_, cartIndex) => cartIndex !== index));
  };

  const updateCartQuantity = (index: number, delta: number) => {
    const line = cart[index];
    if (!line) return;
    const nextQuantity = line.quantity + delta;
    if (nextQuantity <= 0) {
      removeFromCart(index);
      return;
    }
    const ceiling = line.stock && line.stock > 0 ? Math.min(line.stock, 20) : 20;
    writeCart(cart.map((item, cartIndex) => (cartIndex === index ? { ...item, quantity: Math.min(nextQuantity, ceiling) } : item)));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const goToCheckout = () => {
    if (!currentUser) {
      router.push("/login?next=/checkout");
      return;
    }
    router.push("/checkout");
  };

  return (
    <main className="page-shell">
      <Link href="/" className="back-link">← Continue shopping</Link>
      <h1>Your bag {cartCount > 0 && <span style={{ color: "var(--accent)", fontSize: 16 }}>({cartCount})</span>}</h1>

      {cart.length === 0 ? (
        <div className="empty-state" style={{ marginTop: "10vh" }}>
          <span>♧</span>
          <p>Your bag is waiting</p>
          <small>Add something you love.</small>
        </div>
      ) : (
        <>
          {cart.map((item, index) => (
            <div className="cart-item" key={`${item.id}-${item.size}-${item.color}-${index}`}>
              <img src={item.image} alt="" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_IMAGE; }} />
              <div>
                <b>{item.name}</b>
                <small>{item.category} · {item.size}{item.color ? ` · ${item.color}` : ""}</small>
                <div className="cart-item-qty">
                  <button type="button" aria-label={`Decrease quantity for ${item.name}`} onClick={() => updateCartQuantity(index, -1)}>−</button>
                  <span>{item.quantity}</span>
                  <button type="button" aria-label={`Increase quantity for ${item.name}`} onClick={() => updateCartQuantity(index, 1)}>+</button>
                </div>
                <strong>${(item.price * item.quantity).toFixed(2)}</strong>
              </div>
              <button className="cart-item-remove" aria-label={`Remove ${item.name} from bag`} onClick={() => removeFromCart(index)}>×</button>
            </div>
          ))}
          <button className="checkout interactive" onClick={goToCheckout}>
            Proceed to checkout <span>${cartTotal.toFixed(2)}</span>
          </button>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`

- [ ] **Step 3: Manual verification** — add items via `/shop`, visit
  `/cart`, adjust quantity/remove a line, confirm totals update; with an
  empty cart confirm the empty state and no checkout button; click
  "Proceed to checkout" while logged out, confirm redirect to
  `/login?next=/checkout`.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/cart/page.tsx
git commit -m "Add /cart page"
```

---

### Task 5: `/checkout` page

**Files:**
- Create: `frontend/app/checkout/page.tsx`

**Interfaces:**
- Produces: `sessionStorage["threadco_checkout_address"]` (JSON-encoded
  `ShippingAddressForm`) — consumed by Task 6.
- Consumes: `getCartSnapshot`/`getCartServerSnapshot` (existing).

- [ ] **Step 1: Write the page**

```tsx
// frontend/app/checkout/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, useState } from "react";
import { getAuthServerSnapshot, getAuthTokenSnapshot, subscribeToStorage } from "@/lib/auth-store";
import { getCartServerSnapshot, getCartSnapshot } from "@/lib/shop-store";

export const CHECKOUT_ADDRESS_KEY = "threadco_checkout_address";

type ShippingAddressForm = {
  fullName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
};

const EMPTY_SHIPPING_ADDRESS: ShippingAddressForm = {
  fullName: "", addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "", phone: "",
};
const REQUIRED_FIELDS: Array<keyof ShippingAddressForm> = ["fullName", "addressLine1", "city", "state", "postalCode", "country"];

export default function CheckoutPage() {
  const router = useRouter();
  const cart = useSyncExternalStore(subscribeToStorage, getCartSnapshot, getCartServerSnapshot);
  const authToken = useSyncExternalStore(subscribeToStorage, getAuthTokenSnapshot, getAuthServerSnapshot);
  const [address, setAddress] = useState<ShippingAddressForm>(EMPTY_SHIPPING_ADDRESS);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!authToken) router.replace("/login?next=/checkout");
    else if (cart.length === 0) router.replace("/cart");
  }, [authToken, cart.length, router]);

  const updateField = (field: keyof ShippingAddressForm, value: string) => {
    setAddress((current) => ({ ...current, [field]: value }));
  };

  const continueToPayment = () => {
    const missingField = REQUIRED_FIELDS.find((field) => !address[field].trim());
    if (missingField) {
      setFormError("Please fill in your shipping address before continuing.");
      return;
    }
    setFormError("");
    sessionStorage.setItem(CHECKOUT_ADDRESS_KEY, JSON.stringify(address));
    router.push("/checkout/payment");
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (!authToken || cart.length === 0) return null;

  return (
    <main className="page-shell">
      <Link href="/cart" className="back-link">← Back to bag</Link>
      <h1>Checkout</h1>

      <div className="shipping-form" style={{ borderTop: "none", paddingTop: 0 }}>
        <p className="eyebrow">Shipping address</p>
        <input placeholder="Full name" value={address.fullName} onChange={(event) => updateField("fullName", event.target.value)} />
        <input placeholder="Address line 1" value={address.addressLine1} onChange={(event) => updateField("addressLine1", event.target.value)} />
        <input placeholder="Address line 2 (optional)" value={address.addressLine2} onChange={(event) => updateField("addressLine2", event.target.value)} />
        <div className="shipping-form-row">
          <input placeholder="City" value={address.city} onChange={(event) => updateField("city", event.target.value)} />
          <input placeholder="State" value={address.state} onChange={(event) => updateField("state", event.target.value)} />
        </div>
        <div className="shipping-form-row">
          <input placeholder="Postal code" value={address.postalCode} onChange={(event) => updateField("postalCode", event.target.value)} />
          <input placeholder="Country" value={address.country} onChange={(event) => updateField("country", event.target.value)} />
        </div>
        <input placeholder="Phone (optional)" value={address.phone} onChange={(event) => updateField("phone", event.target.value)} />
      </div>
      {formError && <p className="auth-error">{formError}</p>}
      <button className="checkout interactive" onClick={continueToPayment}>
        Continue to payment <span>${cartTotal.toFixed(2)}</span>
      </button>
    </main>
  );
}
```

- [ ] **Step 2: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`

- [ ] **Step 3: Manual verification** — with items in the cart and
  logged in, visit `/checkout`, submit with missing fields (see the
  error), fill it in, confirm navigation to `/checkout/payment`; visit
  `/checkout` with an empty cart, confirm redirect to `/cart`; visit
  `/checkout` logged out, confirm redirect to `/login?next=/checkout`.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/checkout/page.tsx
git commit -m "Add /checkout shipping address page"
```

---

### Task 6: `/checkout/payment` page

**Files:**
- Create: `frontend/app/checkout/payment/page.tsx`

**Interfaces:**
- Consumes: `CHECKOUT_ADDRESS_KEY` (Task 5), `authenticatedFetch`/
  `extractErrorMessage`/`getAuthTokenSnapshot` (existing `auth-store.ts`),
  `getCartSnapshot`/`writeCart` (existing `shop-store.ts`).
- Produces: the order via the existing `POST /orders/` endpoint
  (idempotency-key pattern moved here from `page.tsx`).

- [ ] **Step 1: Write the failing-state check manually first** — this
  page has no backend logic to unit test (it's a client-side form that
  calls an already-tested endpoint), so verification is manual per the
  spec's Testing Strategy. Write the page directly:

```tsx
// frontend/app/checkout/payment/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { authenticatedFetch, extractErrorMessage, getAuthServerSnapshot, getAuthTokenSnapshot, subscribeToStorage } from "@/lib/auth-store";
import { getCartServerSnapshot, getCartSnapshot, writeCart } from "@/lib/shop-store";
import { CHECKOUT_ADDRESS_KEY } from "../page";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

function isValidCardNumber(raw: string): boolean {
  const digits = raw.replace(/\s+/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export default function PaymentPage() {
  const router = useRouter();
  const authToken = useSyncExternalStore(subscribeToStorage, getAuthTokenSnapshot, getAuthServerSnapshot);
  const cart = useSyncExternalStore(subscribeToStorage, getCartSnapshot, getCartServerSnapshot);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authToken || !sessionStorage.getItem(CHECKOUT_ADDRESS_KEY)) {
      router.replace("/checkout");
    }
  }, [authToken, router]);

  const cardValid = isValidCardNumber(cardNumber);
  const expiryValid = /^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry);
  const cvcValid = /^\d{3,4}$/.test(cvc);
  const canPay = cardValid && expiryValid && cvcValid && !loading;

  const pay = async () => {
    const draft = sessionStorage.getItem(CHECKOUT_ADDRESS_KEY);
    if (!draft || !authToken) {
      router.replace("/checkout");
      return;
    }
    const address = JSON.parse(draft);
    setError("");
    setLoading(true);
    try {
      if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
      const response = await authenticatedFetch(`${API_BASE}/orders/`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKeyRef.current },
        body: JSON.stringify({
          items: cart.map((item) => ({ product_id: item.id, quantity: item.quantity, size: item.size, color: item.color })),
          shipping_address: {
            full_name: address.fullName.trim(),
            address_line1: address.addressLine1.trim(),
            address_line2: address.addressLine2.trim() || null,
            city: address.city.trim(),
            state: address.state.trim(),
            postal_code: address.postalCode.trim(),
            country: address.country.trim(),
            phone: address.phone.trim() || null,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(extractErrorMessage(data, "Could not place the order."));
        return;
      }
      writeCart([]);
      sessionStorage.removeItem(CHECKOUT_ADDRESS_KEY);
      idempotencyKeyRef.current = null;
      router.push(`/orders/${data.id}`);
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  if (!authToken) return null;

  return (
    <main className="page-shell">
      <Link href="/checkout" className="back-link">← Back to shipping</Link>
      <h1>Payment</h1>
      <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 20 }}>
        Demo payment — no real charge is made and no card data is transmitted or stored.
      </p>

      <div className="shipping-form" style={{ borderTop: "none", paddingTop: 0 }}>
        <input placeholder="Card number" value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} maxLength={19} />
        {cardNumber && !cardValid && <p className="size-error">Enter a valid card number</p>}
        <div className="shipping-form-row">
          <input placeholder="MM/YY" value={expiry} onChange={(event) => setExpiry(event.target.value)} maxLength={5} />
          <input placeholder="CVC" value={cvc} onChange={(event) => setCvc(event.target.value)} maxLength={4} />
        </div>
      </div>
      {error && <p className="auth-error">{error}</p>}
      <button className="checkout interactive" disabled={!canPay} onClick={pay}>
        {loading && <span className="spinner" />}
        {loading ? "Placing order..." : "Pay now"}
      </button>
    </main>
  );
}
```

- [ ] **Step 2: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`

- [ ] **Step 3: Manual verification** — complete `/checkout`, land on
  `/checkout/payment`; try `1111 1111 1111 1111` and confirm "Pay now"
  stays disabled with the validation message; enter a Luhn-valid test
  number (e.g. `4242 4242 4242 4242`) with a valid expiry/CVC, confirm
  "Pay now" enables and submitting creates the order and redirects to
  `/orders/[id]` (will 404 until Task 7 lands — note and continue);
  confirm the cart is now empty; navigate directly to
  `/checkout/payment` with no draft address in a fresh tab, confirm
  redirect to `/checkout`.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/checkout/payment/page.tsx
git commit -m "Add /checkout/payment dummy payment page"
```

---

### Task 7: `/orders/[id]` page

**Files:**
- Create: `frontend/app/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `getRoleSnapshot`/`isAdminRole` (Phase 2),
  `authenticatedFetch`/`extractErrorMessage` (existing).

- [ ] **Step 1: Write the page** (fetches `/orders/me` for a customer,
  `/orders/` for an admin — same `OrderTracker` rendering currently in
  `page.tsx`, moved here):

```tsx
// frontend/app/orders/[id]/page.tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { authenticatedFetch, extractErrorMessage, getAuthServerSnapshot, getAuthTokenSnapshot, getRoleServerSnapshot, getRoleSnapshot, isAdminRole, subscribeToStorage } from "@/lib/auth-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const ORDER_STEPS = ["placed", "processing", "shipped", "delivered"] as const;

type OrderItem = { product_id: string; name: string; price: number; quantity: number; subtotal: number; size: string; color: string };
type ShippingAddress = { full_name: string; address_line1: string; address_line2?: string | null; city: string; state: string; postal_code: string; country: string; phone?: string | null };
type Order = { id: string; items: OrderItem[]; total: number; status: string; created_at: string; shipping_address?: ShippingAddress | null };

function OrderTracker({ status }: { status: string }) {
  if (status === "cancelled") return <p className="order-tracker-cancelled">Cancelled</p>;
  const currentIndex = ORDER_STEPS.indexOf(status as (typeof ORDER_STEPS)[number]);
  return (
    <div className="order-tracker">
      {ORDER_STEPS.map((step, index) => (
        <div key={step} className={index <= currentIndex ? "order-step done" : "order-step"}>
          <span className="order-step-dot" />
          <small>{step}</small>
        </div>
      ))}
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const authToken = useSyncExternalStore(subscribeToStorage, getAuthTokenSnapshot, getAuthServerSnapshot);
  const role = useSyncExternalStore(subscribeToStorage, getRoleSnapshot, getRoleServerSnapshot);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!authToken || !orderId) return;
    const endpoint = isAdminRole(role) ? "/orders/" : "/orders/me";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setNotFound(false);
    authenticatedFetch(`${API_BASE}${endpoint}`, authToken)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Could not load orders"))))
      .then((orders: Order[]) => {
        const match = orders.find((candidate) => candidate.id === orderId);
        if (!match) {
          setNotFound(true);
          return;
        }
        setOrder(match);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [authToken, orderId, role]);

  if (!authToken) {
    return (
      <main className="page-shell">
        <p>Please <Link href={`/login?next=/orders/${orderId}`}>log in</Link> to view this order.</p>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <Link href="/account" className="back-link">← Back to your orders</Link>
      <h1>Order detail</h1>

      {loading && <p className="detail-status">Loading...</p>}
      {!loading && notFound && <p className="detail-status">We couldn&apos;t find that order.</p>}

      {!loading && !notFound && order && (
        <div className="order-card" style={{ padding: 24 }}>
          <div className="order-card-head">
            <span>{new Date(order.created_at).toLocaleString()}</span>
            <span>#{order.id.slice(-6).toUpperCase()}</span>
          </div>
          <OrderTracker status={order.status} />
          {order.items.map((item) => (
            <div className="order-line" key={`${item.product_id}-${item.size}-${item.color}`}>
              <span>{item.quantity}× {item.name}{item.size && <small> ({item.size}{item.color ? `, ${item.color}` : ""})</small>}</span>
              <span>${item.subtotal.toFixed(2)}</span>
            </div>
          ))}
          <div className="order-card-total"><span>Total</span><span>${order.total.toFixed(2)}</span></div>
          {order.shipping_address && (
            <div style={{ marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
              <p className="eyebrow">Shipping to</p>
              <p>{order.shipping_address.full_name}</p>
              <p>{order.shipping_address.address_line1}{order.shipping_address.address_line2 ? `, ${order.shipping_address.address_line2}` : ""}</p>
              <p>{order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postal_code}</p>
              <p>{order.shipping_address.country}</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`

- [ ] **Step 3: Manual verification** — place an order via checkout,
  confirm landing on `/orders/[id]` with correct details; visit
  `/orders/000000000000000000000000` (a well-formed but non-existent id),
  confirm the "couldn't find that order" state, not a crash; log out and
  visit an order URL directly, confirm the log-in prompt.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/orders/[id]/page.tsx
git commit -m "Add /orders/[id] order detail page"
```

---

### Task 8: `/account` page

**Files:**
- Create: `frontend/app/account/page.tsx`

**Interfaces:**
- Consumes: `authenticatedFetch`/`extractErrorMessage`/`writeAuth`/
  `getCurrentUserSnapshot`/`getAuthTokenSnapshot` (existing).

- [ ] **Step 1: Write the page** (profile header + order history list,
  moved from `page.tsx`'s order-history drawer; each order links to
  `/orders/[id]`):

```tsx
// frontend/app/account/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { authenticatedFetch, extractErrorMessage, getAuthServerSnapshot, getAuthTokenSnapshot, getCurrentUserSnapshot, subscribeToStorage, writeAuth } from "@/lib/auth-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type OrderSummary = { id: string; total: number; status: string; created_at: string };

export default function AccountPage() {
  const router = useRouter();
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);
  const authToken = useSyncExternalStore(subscribeToStorage, getAuthTokenSnapshot, getAuthServerSnapshot);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authToken) {
      router.replace("/login?next=/account");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    authenticatedFetch(`${API_BASE}/orders/me`, authToken)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Could not load orders"))))
      .then((data: OrderSummary[]) => setOrders(data))
      .catch(() => setError("Could not load your orders."))
      .finally(() => setLoading(false));
  }, [authToken, router]);

  const logout = () => {
    writeAuth("", "");
    router.push("/");
  };

  if (!authToken) return null;

  return (
    <main className="page-shell">
      <Link href="/" className="back-link">← Back home</Link>
      <h1>Your account</h1>
      <p style={{ marginBottom: 24 }}>Signed in as <b>{currentUser}</b></p>

      <h2 style={{ fontSize: 20, marginBottom: 16 }}>Order history</h2>
      {loading && <p className="orders-status">Loading your orders...</p>}
      {!loading && error && <p className="auth-error">{error}</p>}
      {!loading && !error && orders.length === 0 && (
        <div className="empty-state"><span>♧</span><p>No orders yet</p><small>Your past purchases will show up here.</small></div>
      )}
      {!loading && !error && orders.length > 0 && (
        <div className="orders-list" style={{ maxHeight: "none" }}>
          {orders.map((order) => (
            <Link href={`/orders/${order.id}`} key={order.id} className="order-card interactive" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
              <div className="order-card-head">
                <span>{new Date(order.created_at).toLocaleDateString()}</span>
                <span>#{order.id.slice(-6).toUpperCase()}</span>
              </div>
              <div className="order-card-total"><span>{order.status}</span><span>${order.total.toFixed(2)}</span></div>
            </Link>
          ))}
        </div>
      )}

      <button className="auth-switch" onClick={logout} style={{ marginTop: 24 }}>Log out</button>
    </main>
  );
}
```

- [ ] **Step 2: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`

- [ ] **Step 3: Manual verification** — visit `/account` logged out,
  confirm redirect to `/login?next=/account`; log in, confirm order list
  renders and each order links correctly to `/orders/[id]`; log out from
  this page, confirm redirect home and cleared auth state.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/account/page.tsx
git commit -m "Add /account profile and order history page"
```

---

### Task 9: Trim `page.tsx` — remove modals/drawers, wire nav to new routes

**Files:**
- Modify: `frontend/app/page.tsx`

**Interfaces:**
- Consumes: `ProductCard`, `useInViewport` (Task 1).

- [ ] **Step 1: Add the two new imports this task needs**, alongside
  the existing import block:

```tsx
import { ProductCard } from "@/components/ProductCard";
import { useInViewport } from "@/lib/useInViewport";
```

- [ ] **Step 2: Remove the auth modal, cart drawer, and orders drawer**
  JSX blocks (lines 615, 616-673, 674-712 as they exist today) and the
  state/handlers that only existed to support them: `cartOpen`,
  `authOpen`, `authMode`, `authName`, `authEmail`, `authPassword`,
  `authError`, `shippingAddress`, `checkoutError`, `checkoutLoading`,
  `ordersOpen`, `orders`, `ordersLoading`, `ordersError`,
  `orderConfirmation`, `checkoutIdempotencyKeyRef`, and the functions
  `removeFromCart`, `updateCartQuantity`, `updateShippingField`,
  `submitAuth`, `fetchOrders`, `openOrders`, `closeCart`, `checkout`
  (all now live in `/cart`, `/checkout`, `/checkout/payment`, `/account`,
  `/login`, `/register`). Keep `cart` (for the header badge count),
  `wishlist`, `catalog`/`isLiveCatalog` fetching, `useAddToCart`, the chat
  widget state, and `currentUser`/`logout`.

  Also delete the module-level declarations that existed only to support
  those removed blocks — leaving any of these in place would be dead
  code the moment this step lands, not something deferred to a later
  cleanup pass: the `OrderItem`/`Order`/`ShippingAddressForm` types, the
  `EMPTY_SHIPPING_ADDRESS` and `REQUIRED_SHIPPING_FIELDS` constants, the
  `ORDER_STEPS` constant, and the `OrderTracker` function (lines 27-73
  and 169-186 as they exist today — all three of these now live only in
  `frontend/app/orders/[id]/page.tsx`, written in Task 7).

- [ ] **Step 3: Update the nav** — replace the account/cart icon buttons'
  `onClick` handlers with real links, and point "Shop" at `/shop`:

```tsx
// Replace the nav-links block
<div className="nav-links">
  <Link href="/shop">Shop</Link>
  <a href="#new">New arrivals</a>
  <a href="#about">Our story</a>
</div>
```

```tsx
// Replace the nav-actions account/cart buttons
<Link
  href={currentUser ? "/account" : "/login"}
  className="icon-button interactive"
  aria-label={currentUser ? "Your account" : "Open account"}
  title={currentUser ? `Signed in as ${currentUser}` : "Log in"}
>
  {currentUser ? currentUser[0].toUpperCase() : "♙"}
</Link>
<Link href="/cart" className={`icon-button cart-button interactive${cartBumped ? " bump" : ""}`} aria-label="Open cart">
  ♧ <b>{cartCount}</b>
</Link>
```

Add the cart-bump tracking referenced above (one-shot animation when an
item is added, not on every render):

```tsx
// Add near the other useState/useEffect declarations
const previousCartCountRef = useRef(0);
const [cartBumped, setCartBumped] = useState(false);

useEffect(() => {
  if (cartCount > previousCartCountRef.current) {
    setCartBumped(true);
    const timeout = setTimeout(() => setCartBumped(false), 420);
    previousCartCountRef.current = cartCount;
    return () => clearTimeout(timeout);
  }
  previousCartCountRef.current = cartCount;
}, [cartCount]);
```

(`cartCount` is already derived from `cart` earlier in the file — this
reads it, it doesn't duplicate its computation.)

- [ ] **Step 4: Replace the full product grid with `ProductCard` and a
  "Shop all" link**, keeping only a featured slice on the home page
  (the full grid now lives at `/shop`):

```tsx
// Replace the .product-grid block inside the products-section
<div className="product-grid">
  {filteredProducts.slice(0, 6).map((product) => (
    <ProductCard
      key={product.id}
      product={product}
      wishlist={wishlist}
      onToggleWishlist={(id) => toggleWishlist(wishlist, id)}
      {...addToCartApi}
    />
  ))}
</div>
<div style={{ textAlign: "center", marginTop: 40 }}>
  <Link href="/shop" className="primary-button interactive" style={{ display: "inline-block" }}>
    Shop all <span>→</span>
  </Link>
</div>
```

(Keep the category/search filtering above the grid as-is — it still
usefully narrows the 6-item preview; `filteredProducts` and
`addToCartApi` already exist from the current file, just renamed from
the destructured `useAddToCart()` call to a named variable so it can be
spread: `const addToCartApi = useAddToCart();` replacing the current
destructuring assignment.)

- [ ] **Step 5: Apply scroll-reveal to the two story banners** (the
  `.story-banner` sections under `id="new"` and `id="about"` — good
  below-the-fold candidates):

```tsx
// Add above the return statement
const newBanner = useInViewport<HTMLDivElement>();
const aboutBanner = useInViewport<HTMLDivElement>();
```

```tsx
// Wrap each story-banner section's className
<section ref={newBanner.ref} className={`story-banner reveal${newBanner.isVisible ? " is-visible" : ""}`} id="new">
```
(same pattern for the `id="about"` section with `aboutBanner`)

- [ ] **Step 6: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: Clean — this is the largest single diff in the phase, so
check the build output carefully for unused-variable warnings left over
from the removed state (`eslint` would catch these; fix any that
appear).

- [ ] **Step 7: Manual verification** — full click-through: home page
  loads with 6 featured products and a working "Shop all" link; header
  account icon links to `/login` (logged out) or `/account` (logged in);
  cart icon links to `/cart` and bumps once when an item is added; the
  two story banners fade in on scroll; chat widget still works unchanged.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "Trim homepage to hero/featured/chat, route auth/cart/orders to real pages"
```

---

## Phase 3 Completion Check

- [ ] `cd frontend && npx tsc --noEmit && npm run build` — clean
- [ ] Full manual click-through of every new route against a locally
  running backend (Phase 1 + Phase 2 already deployed)
- [ ] `git log --oneline -9` shows all 9 commits from this phase
