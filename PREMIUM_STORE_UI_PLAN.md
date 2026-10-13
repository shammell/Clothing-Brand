# PREMIUM_STORE_UI_PLAN.md

Thread&Co: single-store premium boutique. Frontend motion, three AI features, variant-level inventory.

## 1. Vision and design principles

Thread&Co is one independent store with a small, curated catalog. The interface should feel like a well-run boutique: calm, fast, and exact about what is available.

**Principles**

1. **Restraint.** Motion explains a change (a bag opened, a size sold out, a page changed). Nothing moves for decoration. One easing family, three durations.
2. **Honest availability.** A shopper never selects a size and colour that cannot ship. Stock is known per variant and shown before the click.
3. **No dead time.** Every wait shows the shape of what is coming (skeletons), and every action answers within 150 ms.
4. **Continuity.** The product image a shopper taps is the same image that lands on the product page. The bag is reachable from every page without leaving it.
5. **Grounded help.** The assistant only recommends products, sizes, and pairings that exist in the catalog and are in stock.
6. **Accessible by default.** Keyboard reachable, focus managed, `prefers-reduced-motion` honoured, 44 px touch targets on controls a shopper must hit.

**Non-goals**

- No multi-tenancy, multi-merchant, or mall features. One store, one catalog, one admin team.
- No payment or billing work. Existing checkout routes are linked to and otherwise left alone.
- No change to the `users` collection, `backend/app/models/user.py`, or `backend/app/routes/users.py`.
- No new npm dependencies for motion (see section 4).

## 2. Current-state audit

| Area | Today | File | Gap this plan closes |
|---|---|---|---|
| Header | Eight pages each render their own `<nav className="navbar">`; only the homepage shows the bag icon | `frontend/app/page.tsx`, `shop/page.tsx`, `products/[id]/page.tsx`, `about`, `contact`, `policies`, `error.tsx`, `not-found.tsx` | One shared header mounted in the layout |
| Bag | Full page only; quantity and remove logic lives inside the page component | `frontend/app/cart/page.tsx` | Side drawer sharing one cart hook |
| Bag state | `localStorage` through `useSyncExternalStore` | `frontend/lib/shop-store.ts` | Kept as is; drawer reuses it |
| Add to bag | Adding → added button states with timed feedback | `frontend/lib/useAddToCart.ts` | Opens the drawer; quantity ceiling per variant |
| Size buttons | `.size-chip` buttons, always enabled, 10 px text with 4 px padding | `frontend/components/ProductCard.tsx`, `products/[id]/page.tsx` | Availability per colour, low-stock hint, larger targets |
| Loading | "Loading..." text on shop, product, and order pages; a 12 px spinner for route loading | `frontend/app/loading.tsx` | Storefront skeletons |
| Motion | `.interactive` hover scale, `.reveal` on scroll, bag badge bounce. No reduced-motion handling | `frontend/app/globals.css` | Token set, page transitions, reduced-motion block |
| Leftover CSS | `.drawer-backdrop`, `.cart-drawer`, `.drawer-heading` are defined but unused | `frontend/app/globals.css` lines 133-136 | Reused by the new drawer |
| Inventory | One `stock` integer per product; every size and colour draws from the same pool | `backend/app/models/product.py`, `backend/app/routes/orders.py` | Variant SKUs |
| Assistant | Chat markup inlined in the homepage only; backend forwards text to Groq with no catalog access | `frontend/app/page.tsx` line 286, `backend/app/services/chat_services.py` | Catalog tools, product cards, available on every page |
| Images | Plain `<img>`; card height fixed in px, product page image absolutely positioned | `globals.css` `.product-image`, `.product-detail-image` | Aspect-ratio boxes and load fade |

Styling note: the storefront uses hand-written classes in `globals.css`. Tailwind utilities are used only in the admin (`components/TableSkeleton.tsx`, `ProductManager.tsx`). New storefront work follows the hand-written class convention.

## 3. Benchmarks

| Capability | What leading stores do | Source | Thread&Co target |
|---|---|---|---|
| Size selection control | Buttons, not dropdowns. Baymard found dropdown size selectors are easy to miss, and 28% of benchmarked desktop sites with size variations still use them | [Baymard: use buttons for size selection](https://baymard.com/research-articles/use-buttons-for-size-selection) | Buttons, with unavailable sizes visibly marked (UI-7) |
| Sizing information | 94% of apparel sites fail to provide sufficient sizing information | [Baymard: apparel UX research](https://baymard.com/blog/apparel-ecommerce-ux-research-launch) | Size chart plus a recommendation on every product page (AI-2, AI-4) |
| Size recommendation | ASOS Fit Assistant asks height, weight, and preferred fit, then suggests a size | [FashionUnited](https://fashionunited.uk/news/fashion/asos-improves-sizing-assistance-with-ai-technology/2018112940243) | Same three inputs, deterministic chart, saved on the device (AI-2) |
| Visual search | ASOS Style Match searches the catalog from an uploaded photo | [FashionNetwork](https://ae.fashionnetwork.com/news/Asos-deploys-style-match-visual-search-tool-internationally,955605.html) | Photo → attributes → ranked catalog (AI-5, AI-6) |
| AI stylist | ASOS launched an AI Stylist in its app and inside ChatGPT for outfit discovery | [Retail Gazette](https://www.retailgazette.co.uk/blog/2026/05/asos-launches-ai-stylist-app-in-chatgpt/) | Grounded assistant with product cards and lookbooks (AI-1, AI-3, AI-8) |
| Assistant grounded in catalog | Amazon's shopping assistant uses models combined with catalog, reviews, and Q&A data | [About Amazon](https://aboutamazon.com/news/retail/amazon-rufus-ai-assistant-personalized-shopping-features) | Tool calls into the product collection (AI-1) |
| Try-on and sizing together | Vendor guidance: try-on shows how it looks, sizing answers which size to buy. Vendor-reported figures, not independent | [Kleep](https://kleep.ai/blog/complete-guide-virtual-try-on-ecommerce) | Sizing first. Try-on is out of scope |
| Shared-element page transitions | Next.js documents thumbnail-to-hero morphing with React `<ViewTransition>` | `frontend/node_modules/next/dist/docs/01-app/02-guides/view-transitions.md` | Card image morphs into product page image (UI-11) |
| Zara, SSENSE interaction details | Unverified. Searches returned no reliable description of their current product page or drawer behaviour | none | Not used as a baseline |

## 4. Motion system

### 4.1 Technology choice

| Option | Verdict | Reason |
|---|---|---|
| CSS transitions and keyframes plus React `<ViewTransition>` | **Chosen** | Zero new dependencies. `<ViewTransition>` ships with the App Router in the installed Next.js 16.3 with no configuration. Covers drawers, skeletons, button states, and route transitions |
| Motion (Framer Motion) | Rejected | Adds a dependency and bundle weight for effects CSS already covers. A dependency change has already broken a production install once |
| GSAP | Rejected | Timeline tooling is more than UI state changes need |

Two facts from the bundled Next.js guide shape the tickets:

- `<ViewTransition>` animates only updates inside a Transition, `<Suspense>`, or `useDeferredValue`. A plain `setState` does not trigger it. Route navigations are Transitions already.
- A shared-element morph pairs only when the destination renders in the same commit as the navigation. The product page currently fetches in an effect, so its image arrives late. UI-11 fixes this with a product cache.

Browsers without View Transitions support show the same pages with no animation. That is the accepted fallback.

### 4.2 Tokens (add to `:root` in `globals.css`)

```css
--dur-fast: 150ms;      /* hover, press, chip select */
--dur-base: 250ms;      /* drawer, fades, list changes */
--dur-slow: 400ms;      /* page and shared-element transitions */
--ease-out: cubic-bezier(.22, 1, .36, 1);     /* things entering */
--ease-in-out: cubic-bezier(.65, 0, .35, 1);  /* things moving */
```

### 4.3 Rules

- Animate `transform` and `opacity` only. Skeleton shimmer may animate `background-position`.
- No animation changes layout. Image boxes reserve space with `aspect-ratio`.
- Entering elements use `--ease-out`. Exits run at `--dur-fast` so the interface never waits on a leaving element.
- One global block disables non-essential motion:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
  .reveal { opacity: 1; transform: none; }
}
```

### 4.4 Choreography

| Component | Trigger | Motion | Duration |
|---|---|---|---|
| Cart drawer | Open | Panel slides in from the right (`translateX(100%)` → `0`), scrim fades in | base |
| Cart drawer | Close | Reverse | fast |
| Drawer line | Added | Fades and rises 8 px into place | base |
| Drawer line | Removed | Fades out, then the list closes the gap | fast |
| Bag badge | Count increases | Existing `cart-bounce` keyframe, reused | 420 ms (existing) |
| Size button | Select | Background and border colour change, 0.96 press scale | fast |
| Size button | Colour changed | Availability state cross-fades | fast |
| Skeleton | While loading | Shimmer sweep, 1.4 s loop; static under reduced motion | loop |
| Image | Loaded | Opacity 0 → 1 over the skeleton tone | base |
| Page | Navigation | Cross-fade of main content; header stays fixed | base |
| Product image | Card → product page | Shared-element morph | slow |
| Product grid | Filter or search | Leaving cards fade, remaining cards reposition, new cards fade in | base |
| Assistant panel | Open | Rises 12 px and fades in from the launcher button | base |

## 5. Variant SKU data model

### 5.1 Schema

Variants are embedded in the product document.

```jsonc
{
  "_id": ObjectId("..."),
  "name": "Classic Cotton Tee",
  "price": 29.99,
  "category": "T-Shirts",
  "brand": "Thread&Co",
  "image_url": "/products/cotton-tshirt.jpg",
  "rating": 4.5,
  "variants": [
    { "sku": "A1B2C3-S-BLACK", "size": "S", "color": "Black", "stock": 5 },
    { "sku": "A1B2C3-S-WHITE", "size": "S", "color": "White", "stock": 4 },
    { "sku": "A1B2C3-M-BLACK", "size": "M", "color": "Black", "stock": 0 }
  ],
  // Derived on every write. Kept so existing readers keep working.
  "sizes":  ["S", "M", "L", "XL"],
  "colors": ["Black", "White", "Navy"],
  "stock":  50,
  // Added in sprint 6
  "companions": ["<productId>", "<productId>"]
}
```

| Option | Verdict | Reason |
|---|---|---|
| Embedded `variants` array | **Chosen** | One atomic single-document update per order line. No transactions needed. Catalog is small, documents stay tiny |
| Separate `variants` collection | Rejected | Keeping product totals and variant rows consistent needs multi-document transactions |
| Nested map `stock_by[size][color]` | Rejected | Keys containing spaces or dots are awkward in update paths; harder to list and index |

**Invariants**

- `(size, color)` is unique within a product.
- `stock == sum(variants[].stock)`, `sizes` and `colors` are the ordered unique values from `variants`. The server computes all three; clients never send them as the source of truth once they send `variants`.
- `sku` is `{last 6 of product id}-{SIZE}-{COLOR}`, upper-cased, non-alphanumerics replaced with `-`. Assigned by the server.

### 5.2 Atomic stock updates

Reserve (order placed), one update per order line:

```python
result = await products.update_one(
    {"_id": object_id,
     "variants": {"$elemMatch": {"size": size, "color": color, "stock": {"$gte": quantity}}}},
    {"$inc": {"variants.$.stock": -quantity, "stock": -quantity}},
)
# modified_count == 0  ->  409 "Not enough stock for {name} in {size} / {color}"
```

Release (compensation on failure, or order cancelled): same filter without the `stock` condition, `$inc` by `+quantity`.

The existing flow in `backend/app/routes/orders.py` is kept: idempotency-key lookup, validation, decrement, compensation list, duplicate-key handling. The compensation list changes from `(product_id, qty)` to `(product_id, size, color, qty)`.

### 5.3 Migration and compatibility

- **Script:** `backend/scripts/migrate_product_variants.py`, modelled on `backend/scripts/migrate_user_roles.py`. Selects only `{"variants": {"$exists": false}}`, so it is safe to rerun. `--dry-run` prints the planned split per product.
- **Split rule:** existing `stock` is divided evenly across `sizes × colors`; the remainder is handed out one unit at a time from the first variant. The total is preserved exactly.
- **Deploy order does not matter:** a helper `ensure_variants(product)` synthesises variants in memory for any un-migrated product on read, and the order route persists them with a guarded `$set` (`variants: {$exists: false}`) before decrementing.
- **Orders:** order items already store `size` and `color`. No order migration.
- **Users:** untouched.
- **Saved bags:** `CartLine` gains only an optional field, so `isValidCartLine` in `frontend/lib/shop-store.ts` still accepts bags saved before the change.
- **Rollback:** the derived `stock`, `sizes`, and `colors` stay accurate, so the previous backend build keeps working against migrated documents. It would decrement only the total, so rerun a recompute of variant totals if a rollback is ever followed by a roll-forward.

Known limitation carried over: `PUT /products/{id}` replaces the document, so an admin save racing a customer order can overwrite a decrement. DB-4 narrows this by sending variant stock as explicit values the admin just reviewed; closing it fully needs per-variant stock adjustment endpoints and is listed as a follow-up.

## 6. AI feature specs

All three features run on the existing backend and reuse `backend/app/core/limiter.py`. Every AI route keeps a per-IP limit plus the two global caps already used by `/chat/`.

### 6.0 Provider constraint: Groq free tier

The store runs on a **free-tier Groq API key**. The configured model is `GROQ_MODEL=openai/gpt-oss-20b` (`backend/.env`, default in `backend/app/core/config.py`). Every AI feature in this plan must work inside free-tier limits; no paid plan is assumed.

**Limits (verify in the Groq console before sprint 5; third-party sources disagree on the daily numbers)**

| Limit | Reported value | Source |
|---|---|---|
| Requests per minute | 30, consistent across sources | [klymentiev.com](https://klymentiev.com/blog/groq-api-free-tier), [eesel.ai](https://eesel.ai/blog/groq-pricing) |
| Requests per day, `gpt-oss-20b` | Between 1,000 and 14,400 depending on the source | same |
| Tokens per day, `gpt-oss-20b` | Between 100,000 and 500,000 depending on the source | same |
| Vision candidate `meta-llama/llama-4-scout-17b-16e-instruct` | Reported 30 requests per minute, about 1,000 per day | same |
| Scope | Limits are per organisation, so chat, visual search, and scripts share one pool, and extra keys do not add capacity | same |

Tool-calling support on `gpt-oss-20b` is not confirmed by any source found. It stays the first step of AI-1.

**Design consequences**

1. **The current chat cap is above the provider limit.** `CHAT_GLOBAL_BURST_RATE_LIMIT` defaults to `40/minute`, but Groq allows 30 calls per minute, and a tool-using message makes several calls. With a 3-call ceiling per message, set the burst cap to `10/minute` so the store never exceeds 30 provider calls per minute. Set `CHAT_GLOBAL_SUSTAINED_RATE_LIMIT` from the verified daily request limit divided by 3.
2. **Fewer tool rounds.** At most 2 tool rounds per message (3 provider calls), not more.
3. **Small prompts.** Tool results return at most 6 products with short fields; history sent to the model is trimmed to the last 6 messages when tools are in use, to protect the daily token budget.
4. **No model call where code will do.** Size recommendation is deterministic and has its own endpoint, so "Find my size" on the product page costs zero provider calls. Companion matching is rule-based by default; `--rank-with-llm` is optional, runs offline, and sleeps between calls to stay under 30 per minute.
5. **Visual search is the scarcest feature.** It gets its own tight caps (default `5/minute` global, daily cap from the verified limit) and the UI says "Photo search is busy, try again shortly" when they are hit.
6. **429 from Groq is an expected state, not an error page.** The backend maps a provider 429 to HTTP 503 with a `Retry-After` header; the assistant shows "I'm helping a lot of people right now" with a retry button, and the rest of the store is unaffected.
7. **Cache repeats.** Identical `search_products` tool arguments are cached in process for 60 seconds, and companion and size-guide responses never touch the provider.
8. **Upgrade path.** If traffic outgrows the free tier, only the rate-limit settings change; no code in this plan depends on free-tier behaviour.

### 6.1 Grounded assistant with size recommendation

**Flow:** browser → `POST /chat/` → model with tools → tool results from MongoDB → model writes a short plain-text reply → API returns reply plus structured data.

**Tools exposed to the model**

| Tool | Arguments | Returns |
|---|---|---|
| `search_products` | `query?`, `category?`, `color?`, `max_price?`, `in_stock_only=true` | Up to 6 products: id, name, price, category, colours, available sizes |
| `get_variant_availability` | `product_id` | Per size and colour stock state: `in_stock`, `low`, `sold_out` (never raw counts) |
| `recommend_size` | `product_id`, `height_cm`, `weight_kg`, `fit` (`snug`, `regular`, `relaxed`) | Size, confidence (`high`, `medium`), whether that size is in stock, nearest in-stock alternative |
| `get_companions` | `product_id` | Up to 4 in-stock companion products (sprint 6) |

**Response shape** (additive; `reply` is unchanged, so the current client keeps working)

```jsonc
{
  "reply": "The Classic Cotton Tee in Navy would work well. Based on your measurements I'd go with a Medium.",
  "products": [{ "id": "...", "name": "...", "price": 29.99, "image_url": "...", "category": "..." }],
  "size_recommendation": { "product_id": "...", "size": "M", "confidence": "high", "in_stock": true }
}
```

**Rules**

- Product cards in the UI come from tool results the server collected, never from parsing model text. The existing system-prompt rule against structured output in the reply stays.
- The server drops any product id the model mentions that did not come from a tool result in the same request.
- At most 2 tool rounds per request, then the model must answer. This bounds each chat message at 3 provider calls against the free-tier limit (see 6.0).
- A provider 429 is returned as 503 with `Retry-After`; other provider failures stay 502.
- Size recommendation is a deterministic function over a per-category chart (`alpha` sizes, `waist` sizes, `shoe` sizes). The model only phrases the result. For `shoe` and when inputs are missing, the function returns the chart and no recommendation.
- The fit profile (height, weight, fit preference) is stored in `localStorage` under `threadco_fit_profile` and sent with the request. Nothing is added to the user record.
- If the provider fails, the route returns 502 as it does today and the UI shows a retry message. If tool calling is unavailable on the configured model, the service falls back to today's plain reply with an empty `products` array.

First step of AI-1: confirm the configured `GROQ_MODEL` supports tool calling, and pick a supported model if it does not.

### 6.2 Visual product search

| Option | Verdict | Reason |
|---|---|---|
| Vision model extracts attributes, catalog ranked by attribute match | **Chosen** | No index or embedding provider to run. Fits a catalog of dozens of products. Results are explainable ("matched: Hoodies, Blue") |
| Image embeddings with Atlas Vector Search | Deferred | Right answer once the catalog passes roughly 500 products or attribute matching visibly misses. Needs an image-embedding provider and a backfill job |
| In-browser CLIP model | Rejected | Tens of MB of model download on mobile before the first search |

**Flow**

1. Browser downsizes the photo to a 768 px longest edge JPEG on a canvas, then uploads it (`multipart/form-data`, 4 MB cap enforced server side).
2. `POST /search/visual` sends the image to a vision model with a fixed prompt asking for JSON: `category` (one of the store's categories or `null`), `colors` (up to 3 from a fixed palette), `keywords` (up to 5).
3. The server validates that JSON with a Pydantic model. Invalid output → 422 with "We couldn't read that photo".
4. Ranking over in-stock products: category match 3 points, each colour match 2, each keyword found in name or description 1. Top 8 returned with the matched attributes.
5. The image is not stored.

Limits: 5 per minute per IP, plus global burst and sustained caps mirroring `/chat/`. First step of AI-5: confirm a vision-capable model is available on the current provider.

### 6.3 Lookbooks and companion matching

- **Data:** `companions: string[]` (max 4 product ids) on each product, default empty.
- **Generation:** `backend/scripts/generate_companions.py`. Candidates come from a complementary-category map (for example T-Shirts → Jeans, Shoes, Hoodies; Dresses → Shoes), are scored by colour harmony (neutrals pair with anything, otherwise prefer shared or adjacent colours), and exclude out-of-stock items. `--rank-with-llm` optionally asks the model to order the top candidates. `--dry-run` prints without writing. Products with a manually edited list are skipped unless `--overwrite` is passed (tracked by `companions_source: "manual" | "generated"`).
- **Admin override:** a "Pairs with" picker in `ProductManager`.
- **Read:** `GET /products/{id}/companions` resolves ids to products and filters out deleted or sold-out ones at request time.
- **Surfaces:** "Complete the look" rail on the product page, one companion suggestion in the cart drawer, and `/lookbook`, which shows each product that has two or more companions as an outfit.

## 7. Sprint tickets

Ticket fields: **Goal**, **Files** (new files marked), **Steps**, **Acceptance**, **Tests**, **Depends on**.

Conventions for every ticket:
- Frontend API base stays `const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api"`.
- Backend tests use the fixtures in `backend/tests/conftest.py` (`client`, `auth_headers`, `admin_headers`, `lister_headers`, `seed_product`).
- Read the relevant guide in `frontend/node_modules/next/dist/docs/` before using a Next.js API, per `frontend/AGENTS.md`.
- Visual claims are verified with a real screenshot, not an accessibility snapshot.

---

### Sprint 1: Variant inventory foundation

#### DB-1 Variant schema and derived fields
- **Goal:** products carry `variants`; `sizes`, `colors`, `stock` are derived.
- **Files:** `backend/app/models/product.py`, `backend/app/routes/products.py`, `backend/app/services/variants.py` (new), `backend/tests/test_products.py`, `backend/tests/conftest.py`
- **Steps:**
  1. Add `Variant` model (`sku`, `size`, `color`, `stock >= 0`).
  2. `ProductCreate` accepts optional `variants`. With `variants`: validate unique `(size, color)`, compute `sizes`, `colors`, `stock`, assign SKUs. Without: synthesise variants from `sizes × colors` using the split rule in 5.3.
  3. `ProductResponse` always includes `variants`; add `ensure_variants()` for un-migrated documents on read.
  4. `seed_product` fixture gains an optional `variants` override; default behaviour unchanged.
- **Acceptance:** `GET /products/` and `GET /products/{id}` return `variants` for every product, migrated or not. Creating a product with duplicate `(size, color)` returns 422. A product created with the old payload shape still succeeds. `stock` always equals the variant sum.
- **Tests:** create with variants; create legacy shape; duplicate variant rejected; un-migrated document served with synthesised variants; derived fields correct after update.
- **Depends on:** none.

#### DB-2 Migration script
- **Goal:** backfill `variants` on existing products.
- **Files:** `backend/scripts/migrate_product_variants.py` (new), `backend/seed.py`
- **Steps:** follow the structure of `migrate_user_roles.py` (same `sys.path` handling, same client setup including the Atlas CA handling from `app/core/database.py`). Implement `--dry-run`. Update `seed.py` to write `variants`.
- **Acceptance:** dry run prints per-product splits and writes nothing. Real run sets `variants` only where missing. Second run reports zero changes. Sum of variant stock equals the pre-migration `stock` for every product.
- **Tests:** unit test for the split function (even split, remainder, single size and colour, zero stock).
- **Depends on:** DB-1.

#### DB-3 Variant-level reserve and release in orders
- **Goal:** orders decrement and restore the exact variant.
- **Files:** `backend/app/routes/orders.py`, `backend/tests/test_orders.py`
- **Steps:**
  1. Replace the per-product stock check and decrement with the per-variant update in 5.2, iterating `requested_variants` (already keyed by product, size, colour).
  2. Persist synthesised variants with the guarded `$set` before decrementing an un-migrated product.
  3. Compensation and the duplicate-key and `PyMongoError` paths release per variant.
  4. Cancellation in `update_order_status` releases per variant using each order item's `size` and `color`; items with empty `size` or `color` (orders older than variants) release to the top-level `stock` only.
- **Acceptance:** ordering the last unit of M / Black leaves other variants untouched and makes a second order for M / Black return 409 naming the size and colour. Top-level `stock` drops by the same amount. A failed multi-line order restores every variant it touched. Cancelling restores the variant once; saving `cancelled` twice does not double-credit. Idempotent retry behaviour is unchanged.
- **Tests:** the cases above, plus two concurrent requests for the last unit (exactly one 201).
- **Depends on:** DB-1.

#### DB-4 Admin variant stock grid
- **Goal:** admins and listers edit stock per size and colour.
- **Files:** `frontend/components/ProductManager.tsx`, `frontend/components/VariantStockGrid.tsx` (new)
- **Steps:** replace the single Stock input with a grid (rows = sizes, columns = colours) rebuilt as the sizes and colours inputs change, preserving entered values. Submit `variants`. Table "Stock" cell shows the total with the existing badges, plus "N variants out" when any variant is at 0.
- **Acceptance:** editing a product shows its current variant stock. Adding a size adds a row at 0. Saved values round-trip. Grid inputs have accessible labels ("Stock for M in Black"). Usable at 390 px (horizontal scroll inside the grid only).
- **Tests:** Vitest for grid add/remove size and colour preserving values; payload shape.
- **Depends on:** DB-1.

#### DB-5 Frontend types and per-variant quantity ceiling
- **Goal:** the storefront knows variant stock.
- **Files:** `frontend/lib/shop-store.ts`, `frontend/lib/variants.ts` (new), `frontend/lib/useAddToCart.ts`, `frontend/lib/useAddToCart.test.ts`
- **Steps:** add optional `variants` to `Product`; map it in `productFromApi`. `lib/variants.ts` exports `variantStock(product, size, color)`, `sizeAvailability(product, color)` returning `in_stock | low | sold_out` per size (low = under 5), and `firstAvailableColor(product)`. `setQuantity` and `addToCart` clamp to the selected variant's stock; adding a sold-out variant is refused with a `variantErrors` flag.
- **Acceptance:** quantity cannot exceed the selected variant's stock or 20. Bags saved before this change still load. Products without `variants` behave as today.
- **Tests:** extend the existing hook test for variant ceiling, sold-out refusal, and legacy products.
- **Depends on:** DB-1.

---

### Sprint 2: Shell and side cart

#### UI-1 Motion tokens and reduced-motion support
- **Goal:** one motion vocabulary.
- **Files:** `frontend/app/globals.css`
- **Steps:** add the tokens from 4.2 and the block from 4.3. Point `.interactive`, `.reveal`, `.quick-add`, and `.product-image img` transitions at the tokens.
- **Acceptance:** no hard-coded durations remain in rules this ticket touches. With reduced motion emulated, `.reveal` sections are visible immediately and hover scaling is instant.
- **Tests:** screenshot of the homepage with reduced motion emulated showing both story banners visible.
- **Depends on:** none.

#### UI-2 Shared `SiteHeader`
- **Goal:** one header on every storefront page, with the bag button.
- **Files:** `frontend/components/SiteHeader.tsx` (new), `frontend/app/layout.tsx`, and removal of the inline navbar from `app/page.tsx`, `app/shop/page.tsx`, `app/products/[id]/page.tsx`, `app/about/page.tsx`, `app/contact/page.tsx`, `app/policies/page.tsx`, `app/error.tsx`, `app/not-found.tsx`
- **Steps:** client component with brand, nav links, account link, and bag button with count (move the bump logic and its hydration guard out of `app/page.tsx` unchanged). Render nothing when the pathname starts with `/admin` or `/lister`, which have their own shell. The homepage announcement bar stays in the homepage.
- **Acceptance:** header appears once on every storefront route, including `/cart`, `/checkout`, `/login`, `/account`, and `/orders/[id]`, and never on `/admin` or `/lister`. Bag count matches on all pages and does not flash 0 → n on load. Sticky offset still clears anchor targets on `/policies`.
- **Tests:** Vitest: renders null on `/admin`; shows count from a seeded bag. Update `error.test.tsx` and `not-found.test.tsx` if they assert on the navbar.
- **Depends on:** UI-1.

#### UI-3 `useCart` hook
- **Goal:** one implementation of bag mutations.
- **Files:** `frontend/lib/useCart.ts` (new), `frontend/lib/useCart.test.ts` (new), `frontend/app/cart/page.tsx`
- **Steps:** move `removeFromCart`, `updateCartQuantity`, `cartTotal`, `cartCount` out of the page into the hook, keeping the documented zero-stock ceiling behaviour. The ceiling uses variant stock when the line has it. The page consumes the hook.
- **Acceptance:** `/cart` behaves exactly as before. No bag logic remains in the page component.
- **Tests:** increment to ceiling, decrement to removal, zero-stock line, totals.
- **Depends on:** DB-5.

#### UI-4 `CartDrawer`
- **Goal:** a side bag reachable from any page.
- **Files:** `frontend/components/CartDrawer.tsx` (new), `frontend/lib/ui-store.ts` (new), `frontend/app/layout.tsx`, `frontend/components/SiteHeader.tsx`, `frontend/lib/useAddToCart.ts`, `frontend/app/globals.css`
- **Steps:**
  1. `ui-store.ts`: an in-memory external store (same `useSyncExternalStore` idiom as `auth-store.ts`) exposing `openCartDrawer()`, `closeCartDrawer()`, and a snapshot.
  2. Drawer is a native `<dialog>` opened with `showModal()`, which provides the focus trap, Escape to close, and inert background. Reuse the existing `.drawer-backdrop`, `.cart-drawer`, `.drawer-heading` rules; style the scrim through `::backdrop`.
  3. Slide and fade with `@starting-style` and `transition-behavior: allow-discrete` so both open and close animate. Browsers lacking those open and close instantly.
  4. Scroll lock: `html:has(dialog[open]) { overflow: hidden; scrollbar-gutter: stable; }`.
  5. Contents: heading with count, lines (image, name, size · colour, quantity stepper, line total, remove), subtotal, "Proceed to checkout" (same login redirect rule as `/cart`), "View bag" link, and an empty state.
  6. Header bag button opens the drawer; `addToCart` calls `openCartDrawer()` when the status reaches `added`. On `/cart` and `/checkout` the button links to `/cart` and auto-open is suppressed.
  7. Line enter and exit animations per 4.4. Focus returns to the element that opened the drawer.
- **Acceptance:** opens from the header on every storefront page and after adding from a card or the product page. Escape, scrim click, and the close button all close it and restore focus. Tab never leaves the drawer while open. Page behind does not scroll or shift sideways. Changes made in the drawer appear on `/cart` and in the header count immediately. Works at 390 px with the panel at `min(400px, 90vw)`.
- **Tests:** Vitest: opens via store, renders lines, quantity and remove call through `useCart`, empty state. Screenshots: open drawer desktop and mobile.
- **Depends on:** UI-2, UI-3.

#### UI-5 Count and subtotal feedback
- **Goal:** changes to the bag are noticeable without being loud.
- **Files:** `frontend/components/SiteHeader.tsx`, `frontend/components/CartDrawer.tsx`, `frontend/app/globals.css`
- **Steps:** keep the badge bounce on increase only. Subtotal cross-fades when its value changes (keyed span). Add a visually hidden `aria-live="polite"` region announcing "Added {name}, size {size}. Bag has {n} items."
- **Acceptance:** badge bounces once per add, never on page load. Screen reader announcement fires once per add.
- **Tests:** Vitest for the live-region text.
- **Depends on:** UI-4.

---

### Sprint 3: Product surfaces

#### UI-6 Storefront skeletons
- **Goal:** replace every storefront "Loading..." and the route spinner.
- **Files:** `frontend/components/Skeletons.tsx` (new), `frontend/app/globals.css`, `frontend/app/loading.tsx`, `frontend/app/page.tsx`, `frontend/app/shop/page.tsx`, `frontend/app/products/[id]/page.tsx`, `frontend/app/orders/[id]/page.tsx`
- **Steps:** add a `.skeleton` class (tone `#e7e2dc`, shimmer per 4.4). Components: `ProductCardSkeleton`, `ProductGridSkeleton` (count prop), `ProductDetailSkeleton`, `OrderSkeleton`. Each matches the real layout's dimensions. Wrap in `role="status"` with a visually hidden "Loading". Leave the admin's `TableSkeleton` as is.
- **Acceptance:** no "Loading..." text remains in storefront routes. Swapping skeleton for content causes no layout shift on shop, home, and product pages. Shimmer stops under reduced motion.
- **Tests:** Vitest render tests; screenshots of shop and product page skeletons with the network held.
- **Depends on:** UI-1.

#### UI-7 Dynamic size buttons
- **Goal:** size buttons show what is actually available.
- **Files:** `frontend/components/SizeSelector.tsx` (new), `frontend/components/SizeSelector.test.tsx` (new), `frontend/components/ProductCard.tsx`, `frontend/app/products/[id]/page.tsx`, `frontend/app/globals.css`
- **Steps:**
  1. One component used by both card and product page (`size="compact" | "full"`), replacing the duplicated `.size-row` markup.
  2. State per size from `sizeAvailability(product, selectedColor)`: available, low ("Only N left" caption on the product page, a small dot on the card), sold out (struck through, muted, `aria-disabled="true"`, still focusable, with `title` and accessible name "M, sold out").
  3. Selecting a sold-out size does not select it; on the product page it reveals an inline "Sold out in {colour}" note listing colours that have that size.
  4. Radio-group semantics: `role="radiogroup"` with a label, arrow-key movement, `aria-checked`.
  5. Full variant is at least 44 px tall. Press scale and colour transition per 4.4.
  6. The "Select a size" error keeps its current trigger and gains a short horizontal shake of the group (skipped under reduced motion).
- **Acceptance:** with M / Black at 0 and M / Navy in stock, M is struck through while Black is selected and enabled when Navy is selected. Low-stock caption appears under 5 units. Keyboard: Tab enters the group, arrows move, Space selects. Products without `variants` render as today.
- **Tests:** availability by colour, sold-out not selectable, keyboard navigation, legacy product.
- **Depends on:** DB-5, UI-1.

#### UI-8 Colour swatches driving availability
- **Goal:** colour is a first-class choice.
- **Files:** `frontend/components/ColorSelector.tsx` (new), `frontend/components/ProductCard.tsx`, `frontend/app/products/[id]/page.tsx`, `frontend/lib/useAddToCart.ts`, `frontend/app/globals.css`
- **Steps:** shared swatch group with radio semantics, selected colour name shown as text on the product page, a diagonal-line overlay on colours with no stock in any size. Default selection becomes `firstAvailableColor(product)`. Changing colour while a now-sold-out size is selected clears the size and shows the note from UI-7. Full swatches are 28 px with an 8 px gap (44 px effective target); card swatches stay compact.
- **Acceptance:** default colour is the first with stock. Changing colour updates size buttons with a cross-fade and never leaves an unavailable pair selected. Colour name is announced to screen readers.
- **Tests:** default colour, size cleared on conflict.
- **Depends on:** UI-7.

#### UI-9 Layout-stable product imagery
- **Goal:** images never move the page as they load.
- **Files:** `frontend/components/ProductImage.tsx` (new), `frontend/components/ProductCard.tsx`, `frontend/app/products/[id]/page.tsx`, `frontend/components/CartDrawer.tsx`, `frontend/app/globals.css`
- **Steps:** one component wrapping `<img>` with the existing `FALLBACK_IMAGE` error handling, a container with `aspect-ratio: 4 / 5`, skeleton tone behind, `loading="lazy"` below the fold, `decoding="async"`, and an opacity fade on load. Replace the fixed pixel heights on `.product-image` and the absolute positioning on `.product-detail-image` with the ratio box.
- **Acceptance:** cumulative layout shift from images is 0 on shop and product pages. Broken image URLs still fall back. Card hover zoom still works.
- **Tests:** Vitest for fallback on error; screenshots at desktop and 390 px.
- **Depends on:** UI-6.

---

### Sprint 4: Navigation motion

#### UI-10 Page transitions
- **Goal:** route changes cross-fade instead of cutting.
- **Files:** `frontend/app/layout.tsx`, `frontend/app/globals.css`
- **Steps:** read `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md` first. Wrap `{children}` in React's `<ViewTransition>` so the main content cross-fades while `SiteHeader` stays put (give the header its own `view-transition-name` so it does not fade). Set the group duration to `--dur-base`. Exclude `/admin` and `/lister` content from animating.
- **Acceptance:** navigating between home, shop, product, and static pages cross-fades the content; the header does not flicker. Back and forward work. No animation under reduced motion. Unsupported browsers navigate normally.
- **Tests:** manual check in Chromium and Safari; screenshot sequence not required.
- **Depends on:** UI-2, UI-1.

#### UI-11 Shared-element product image
- **Goal:** the card image becomes the product page image.
- **Files:** `frontend/lib/product-cache.ts` (new), `frontend/components/ProductImage.tsx`, `frontend/components/ProductCard.tsx`, `frontend/app/products/[id]/page.tsx`, `frontend/app/page.tsx`, `frontend/app/shop/page.tsx`
- **Steps:**
  1. `product-cache.ts`: in-memory `Map<string, Product>` filled whenever the home or shop page loads products.
  2. The product page initialises its state from the cache so the image renders in the first commit, then refetches in the background for fresh stock. Skeleton shows only on a cold load.
  3. `ProductImage` takes a `transitionName` prop and wraps the image in `<ViewTransition name={`product-image-${id}`} share="morph" default="none">` on both card and product page.
  4. CSS: `::view-transition-group(.morph) { animation-duration: var(--dur-slow); }`.
- **Acceptance:** clicking a card in Chromium morphs its image into the product page image and back on return. A direct visit to a product URL shows the skeleton, then content, with no morph and no error. Only one element per name exists on any page (the product page must not also render that product in a rail with the same name).
- **Tests:** Vitest for cache seeding and product page initial state from cache.
- **Depends on:** UI-9, UI-10.

#### UI-12 Shop filter and search transitions
- **Goal:** the grid reorganises instead of blinking.
- **Files:** `frontend/app/shop/page.tsx`, `frontend/app/page.tsx`, `frontend/components/ProductCard.tsx`, `frontend/app/globals.css`
- **Steps:** set category inside `startTransition`; derive the filtered list from `useDeferredValue(query)`. Wrap each card in a keyed `<ViewTransition>` so remaining cards slide to new positions and entering cards fade. First load of the grid staggers card entrance by 30 ms per card, capped at 8 cards. Empty result shows a designed empty state with a "Clear filters" button.
- **Acceptance:** typing in search stays responsive (input never lags). Changing category animates survivors to their new positions. Empty state appears for no matches. No animation under reduced motion.
- **Tests:** Vitest for empty state and clear filters.
- **Depends on:** UI-10.

#### UI-13 Motion and accessibility QA pass
- **Goal:** verify sprints 2-4 together.
- **Files:** fixes only.
- **Steps:** one Playwright pass against `next dev` covering home, shop, product, drawer, and bag at 1440 px and 390 px, with and without reduced motion. Keyboard-only run through add to bag → drawer → checkout link. Check contrast of the struck-through size state.
- **Acceptance:** screenshots captured and reviewed for each surface and viewport. No layout shift on tested pages. No focus loss after closing the drawer. `tsc --noEmit`, `eslint`, and `vitest` clean. `rm -rf node_modules && npm install` succeeds with no dependency changes.
- **Depends on:** UI-4 through UI-12.

---

### Sprint 5: Grounded assistant and sizing

#### AI-1 Tool calling and structured chat response
- **Goal:** the assistant answers from the catalog.
- **Files:** `backend/app/services/chat_services.py`, `backend/app/services/chat_tools.py` (new), `backend/app/models/chat.py`, `backend/app/routes/chat.py`, `backend/tests/test_chat.py` (new)
- **Steps:**
  1. Confirm tool-calling support on the configured model.
  2. Implement `search_products` and `get_variant_availability` against MongoDB (regex-escaped, case-insensitive name and description match; category and colour filters; availability states, not counts).
  3. Tool loop in `get_chat_response`: send tools, execute calls, append results, repeat up to 2 rounds, then force a final answer. Collect returned products server side. Trim history to the last 6 messages when tools are in use, cache identical `search_products` calls for 60 seconds, and map a provider 429 to 503 with `Retry-After` (see 6.0).
  4. `ChatResponse` adds `products` (default empty) and `size_recommendation` (default null). `ChatMessageRequest` adds optional `fit_profile` and `product_id` (the page the shopper is on).
  5. Extend the system prompt: recommend only items returned by tools; say so when nothing matches. Keep `clean_assistant_response`.
  6. Lower the default `CHAT_GLOBAL_BURST_RATE_LIMIT` to `10/minute` in `backend/app/core/config.py` and set the sustained cap from the verified free-tier daily limit (see 6.0). Per-IP limit unchanged.
- **Acceptance:** "Do you have a black hoodie in M?" returns a reply plus matching products in `products`, each present in the database. A request for something not stocked returns a reply saying so and an empty array. Tool arguments from the model are validated; a malformed call does not 500. A client sending the old request shape still gets a valid response. Provider failure still returns 502.
- **Tests:** mock the provider with `httpx` transport: tool round trip, round cap, hallucinated id dropped, malformed tool args, fallback when tools unsupported, provider 429 mapped to 503.
- **Depends on:** DB-1.

#### AI-2 Size charts and deterministic recommendation
- **Goal:** a size suggestion a shopper can trust and inspect.
- **Files:** `backend/app/data/size_charts.py` (new), `backend/app/services/sizing.py` (new), `backend/app/routes/products.py`, `backend/app/services/chat_tools.py`, `backend/tests/test_sizing.py` (new)
- **Steps:** charts per category with a type (`alpha`, `waist`, `shoe`) and measurement ranges. `recommend_size(product, height_cm, weight_kg, fit)` maps inputs to a chart size, shifts one size for `snug` or `relaxed`, clamps to sizes the product offers, reports confidence (`medium` when inputs sit on a boundary), and names the nearest in-stock alternative when the pick is sold out. `GET /products/{id}/size-guide` returns the chart; `POST /products/{id}/size-recommendation` returns the result (rate limited). Register the function as the `recommend_size` tool.
- **Acceptance:** same inputs always give the same size. Boundary inputs report `medium` confidence. `shoe` categories return the chart and no recommendation. Out-of-range inputs return 422. The chart numbers are placeholders marked for merchant review before launch.
- **Tests:** table-driven cases per chart type, fit shift, clamping, sold-out alternative.
- **Depends on:** DB-1, AI-1.

#### AI-3 `StyleAssistant` component
- **Goal:** the assistant on every page, showing real products.
- **Files:** `frontend/components/StyleAssistant.tsx` (new), `frontend/components/StyleAssistant.test.tsx` (new), `frontend/app/layout.tsx`, `frontend/app/page.tsx`, `frontend/components/SiteFooter.tsx`, `frontend/app/globals.css`
- **Steps:**
  1. Move chat state, the `threadco_chat_history` persistence, and markup out of `app/page.tsx` into the component; mount it in the layout (hidden on `/admin`, `/lister`).
  2. Render `products` under the reply as compact cards (image, name, price) linking to the product page. Store cards with the message so history survives reload.
  3. Send `product_id` when on a product page and `fit_profile` when saved.
  4. Open and close animation per 4.4. Typing indicator of three pulsing dots. Reply text fades in.
  5. Accessibility: launcher has `aria-expanded`, panel is a labelled `role="dialog"` (non-modal), message list is `aria-live="polite"`, Escape closes, focus moves to the input on open.
  6. Hide the launcher while the cart drawer is open. Keep the `.has-chat-fab` footer padding working now that the launcher is on every page.
  7. Suggestion chips become contextual: on a product page, "What size should I get?" and "What goes with this?".
- **Acceptance:** assistant opens on every storefront page and keeps its history across navigation. Product cards navigate correctly. Launcher never covers footer links or the drawer. Works at 390 px (panel becomes a bottom sheet at `min(100vw - 30px, 360px)` wide).
- **Tests:** renders cards from a mocked response, persists history, sends `product_id` on a product route, error state with retry.
- **Depends on:** AI-1, UI-2.

#### AI-4 "Find my size" on the product page
- **Goal:** size help at the moment of choosing.
- **Files:** `frontend/components/FindMySize.tsx` (new), `frontend/components/FindMySize.test.tsx` (new), `frontend/lib/fit-profile.ts` (new), `frontend/app/products/[id]/page.tsx`, `frontend/app/globals.css`
- **Steps:** a "Find my size" link beside the size selector opens a small panel (native `<dialog>`, same motion as the drawer at a smaller scale) with two tabs: "Recommend" (height, weight, fit preference; unit toggle cm/in and kg/lb) and "Size chart" (table from the size-guide endpoint). Submitting calls the recommendation endpoint, shows "We suggest M" with the confidence and a one-line reason, and a "Select M" button that sets the size in `useAddToCart` and closes the panel. The matching size button gets a "Recommended" marker. Profile saves to `localStorage`; on later product pages the marker appears without opening the panel. A "Clear my measurements" control removes it.
- **Acceptance:** recommendation selects the correct size button. Sold-out recommended size shows the in-stock alternative instead. Returning shoppers see the marker automatically. Clearing removes the stored profile. Shoe products show the chart tab only.
- **Tests:** unit conversion, recommend → select flow with a mocked endpoint, stored profile reuse, clear.
- **Depends on:** AI-2, UI-7.

---

### Sprint 6: Visual search and lookbooks

#### AI-5 Visual search endpoint
- **Goal:** find products from a photo.
- **Files:** `backend/app/routes/search.py` (new), `backend/app/services/visual_search.py` (new), `backend/app/models/search.py` (new), `backend/app/main.py`, `backend/app/core/config.py`, `backend/requirements.txt` (only if multipart parsing needs `python-multipart`), `backend/tests/test_visual_search.py` (new)
- **Steps:** confirm a vision model on the current provider and add `GROQ_VISION_MODEL` plus the two global rate-limit settings to config. Implement the flow in 6.2: content-type and size validation (JPEG, PNG, WebP; 4 MB), vision call with a fixed prompt, Pydantic validation of the model's JSON, scoring, top 8 with `matched` attributes. Register the router.
- **Acceptance:** a photo of a blue hoodie returns hoodies first with `matched` listing category and colour. Oversized or non-image uploads return 413 or 415. Unparseable model output returns 422 with a friendly message. No image bytes are written to disk, database, or logs. Rate limits enforced.
- **Tests:** mocked vision response for ranking order, invalid JSON, file validation, no in-stock matches.
- **Depends on:** DB-1.

#### AI-6 Visual search UI
- **Goal:** search by photo from the search box.
- **Files:** `frontend/components/VisualSearch.tsx` (new), `frontend/components/VisualSearch.test.tsx` (new), `frontend/lib/downscaleImage.ts` (new), `frontend/app/shop/page.tsx`, `frontend/components/SiteHeader.tsx`, `frontend/app/globals.css`
- **Steps:** a camera icon button in the shop search box and header opens a file input (`accept="image/*"`, `capture="environment"` on mobile) and a drop zone on desktop. Downscale on a canvas before upload. While waiting, show the photo thumbnail with a scanning sweep and a `ProductGridSkeleton`. Results render in the shop grid with a dismissible bar: thumbnail, "Showing matches for: Hoodies · Blue", and "Clear". Results animate in with the UI-12 grid transition. Errors show inline with a retry.
- **Acceptance:** works with camera capture on mobile and file pick or drop on desktop. Uploaded payload is under 500 KB for a typical phone photo. Clearing restores the previous category and query. Button has an accessible name; the flow is fully keyboard operable.
- **Tests:** downscale dimensions, result bar text, clear restores state, error state.
- **Depends on:** AI-5, UI-6, UI-12.

#### AI-7 Companion generation and admin override
- **Goal:** every product knows what it pairs with.
- **Files:** `backend/app/models/product.py`, `backend/app/routes/products.py`, `backend/app/services/companions.py` (new), `backend/scripts/generate_companions.py` (new), `backend/tests/test_companions.py` (new), `frontend/components/ProductManager.tsx`
- **Steps:** add `companions` (max 4, no self-reference, ids must exist) and `companions_source` to the product model. Implement scoring per 6.3 in the service so the script and the chat tool share it. Script flags: `--dry-run`, `--overwrite`, `--rank-with-llm`. Add `GET /products/{id}/companions`. Add the "Pairs with" picker in `ProductManager` (searchable list, max 4, saving sets source to `manual`). Register `get_companions` as a chat tool.
- **Acceptance:** script fills companions for every product that has eligible candidates and skips manual ones. The endpoint never returns the product itself, deleted products, or sold-out products. Admin edits persist and survive a later script run.
- **Tests:** scoring rules, self and duplicate rejection, endpoint filtering, script idempotence.
- **Depends on:** DB-1, AI-1.

#### AI-8 "Complete the look" surfaces
- **Goal:** pairings where shoppers decide.
- **Files:** `frontend/components/CompleteTheLook.tsx` (new), `frontend/components/CompleteTheLook.test.tsx` (new), `frontend/app/products/[id]/page.tsx`, `frontend/components/CartDrawer.tsx`, `frontend/app/globals.css`
- **Steps:** product page rail below the details: horizontally scrollable with scroll snap, each item a compact card with image, name, price, and a quick size picker (`SizeSelector` compact) plus "Add". Fetched after the main product renders, with skeletons; the rail is omitted when empty. Rail images do not use shared-element names. Cart drawer: one "Pairs well with" suggestion based on the most recently added line, excluding anything already in the bag.
- **Acceptance:** rail appears only when companions exist. Adding from the rail requires a size and respects variant stock. Drawer suggestion never repeats an item in the bag and disappears once added. Rail is keyboard scrollable and reachable.
- **Tests:** hidden when empty, add flow, drawer exclusion logic.
- **Depends on:** AI-7, UI-7, UI-4.

#### AI-9 `/lookbook` page
- **Goal:** a browsable page of outfits.
- **Files:** `frontend/app/lookbook/page.tsx` (new), `frontend/components/LookCard.tsx` (new), `backend/app/routes/products.py`, `backend/tests/test_products.py`, `frontend/components/SiteHeader.tsx`, `frontend/components/SiteFooter.tsx`, `frontend/app/sitemap.ts`, `frontend/app/sitemap.test.ts`
- **Steps:** `GET /products/looks` returns products with two or more resolvable in-stock companions, each with its companions expanded (declare this route before `/{product_id}` so it is not captured as an id). Page layout: editorial grid alternating a large anchor image with its companion pieces; each look lists its pieces with prices and a "Shop this look" action that opens a panel to choose sizes per piece and add all to the bag. Scroll reveal uses the existing `useInViewport` and `.reveal`. Add nav and footer links and a sitemap entry.
- **Acceptance:** page shows at least one look after AI-7 has run, and a designed empty state otherwise. "Shop this look" adds each chosen piece as its own bag line and opens the drawer. Skeletons while loading. Works at 390 px as a single column.
- **Tests:** backend looks endpoint filtering and route order; frontend empty state and add-all flow; sitemap includes `/lookbook`.
- **Depends on:** AI-8.

---

### Final verification (after sprint 6)

- Backend: `pytest` green. Migration dry run reviewed, then run once against production data, then spot-check three products' variant sums.
- Frontend: `tsc --noEmit`, `eslint`, `vitest run` clean; clean install succeeds.
- One end-to-end Playwright pass with real screenshots at 1440 px and 390 px: browse → filter → card to product morph → colour and size selection with a sold-out variant → find my size → add → drawer → companion add → bag page; assistant product question; photo search; lookbook add-all.
- Confirm no diff under `backend/app/models/user.py`, `backend/app/routes/users.py`, or `frontend/app/checkout/payment/`.

### Follow-ups, not in this plan

- Per-variant stock adjustment endpoints to close the admin-save race noted in 5.3.
- Back-in-stock notifications for sold-out variants.
- Per-colour product images and a product page gallery.
- Vector-based visual search once the catalog outgrows attribute matching.
- Server-rendered product pages for search engines.
