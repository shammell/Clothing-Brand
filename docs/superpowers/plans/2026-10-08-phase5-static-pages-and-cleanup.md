# Phase 5: Static Pages & Final Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/about`, `/contact`, `/policies`, then verify no dead
code was left behind by Phases 2-4.

**Architecture:** Three static client components reusing `.page-shell`
and existing `.story-banner`/typography CSS classes — no new state
management, no backend changes.

**Tech Stack:** Next.js 16 App Router, TypeScript, existing CSS.

**Spec:** `docs/superpowers/specs/2026-10-08-site-expansion-design.md`
(section: Frontend Changes → New pages behavior detail → `/about`,
`/contact`, `/policies`)

**Depends on:** Phase 3 (for `.page-shell` and `useInViewport`, both
used here).

## Global Constraints

- Sample copy only — explicitly not reviewed by a lawyer or written for
  a real registered business, per the spec. Editable placeholder text,
  not a placeholder *feature* (the pages themselves are fully
  functional, static content pages — nothing here is a TODO).
- The contact form's submit handler is a deliberate no-op (no backend
  support-ticket system exists or is in scope) — this must be a visible
  code comment at the handler, not silent, so it's never later mistaken
  for a wired-up feature.

## Review Focus

1. The contact form's "Thanks, we'll get back to you" confirmation must
   actually require the required fields to be filled first — an empty
   submission silently "succeeding" would look broken even though
   nothing was ever going to be sent anywhere.
2. `/policies`' in-page anchor nav must actually scroll to the right
   section on both desktop and mobile widths (the existing
   `html { scroll-behavior: smooth; }` in `globals.css` already enables
   smooth anchor scrolling — confirm it still applies here, don't
   reintroduce a JS scroll handler that would duplicate it).

---

### Task 1: `/about` page

**Files:**
- Create: `frontend/app/about/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/app/about/page.tsx
"use client";

import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="store-shell">
      <nav className="navbar">
        <Link className="brand" href="/">THREAD<span>&</span>CO</Link>
        <Link href="/" className="back-link">← Back home</Link>
      </nav>

      <section className="page-shell">
        <p className="eyebrow">OUR STORY</p>
        <h1>Made for real life.</h1>
        <p style={{ color: "#736d65", fontSize: 14, lineHeight: 1.8, marginBottom: 20 }}>
          Thread&amp;Co started with a simple idea: getting dressed should
          feel effortless. We design versatile, everyday essentials with
          considered details and honest materials — pieces meant to move
          with you, not just sit in your closet.
        </p>
        <p style={{ color: "#736d65", fontSize: 14, lineHeight: 1.8, marginBottom: 20 }}>
          Every piece in our collection is chosen for how it actually
          gets worn: layered on a busy morning, dressed up for an
          evening out, or kept simple on a slow Sunday. Less trend, more
          you.
        </p>
        <p style={{ color: "#736d65", fontSize: 14, lineHeight: 1.8 }}>
          We&apos;re a small team that cares about fit, fabric, and
          making sure what you order is what shows up at your door —
          which is also why our returns policy is as simple as we could
          make it. See our <Link href="/policies" style={{ color: "var(--accent)" }}>policies</Link> for details.
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`

- [ ] **Step 3: Commit**

```bash
git add frontend/app/about/page.tsx
git commit -m "Add /about page"
```

---

### Task 2: `/contact` page

**Files:**
- Create: `frontend/app/contact/page.tsx`

- [ ] **Step 1: Write the page** (collects name/email/message, confirms
  with a message, never transmits anywhere — the no-op is commented
  explicitly per this plan's Global Constraints):

```tsx
// frontend/app/contact/page.tsx
"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    // No backend support-ticket endpoint exists in this app - this is a
    // deliberate no-op confirmation, not a bug. Nothing is sent
    // anywhere. Wiring this to a real inbox/ticket system is future
    // scope, not part of this phase.
    setSubmitted(true);
    setName("");
    setEmail("");
    setMessage("");
  };

  return (
    <main className="store-shell">
      <nav className="navbar">
        <Link className="brand" href="/">THREAD<span>&</span>CO</Link>
        <Link href="/" className="back-link">← Back home</Link>
      </nav>

      <section className="page-shell">
        <p className="eyebrow">GET IN TOUCH</p>
        <h1>Contact us</h1>
        <p style={{ color: "#736d65", fontSize: 13, marginBottom: 24 }}>
          Email us directly at <a href="mailto:hello@threadco.example" style={{ color: "var(--accent)" }}>hello@threadco.example</a>,
          or use the form below. Support hours: Monday-Friday, 9am-6pm.
        </p>

        {submitted ? (
          <div className="empty-state" style={{ marginTop: 0 }}>
            <span>✓</span>
            <p>Thanks — we&apos;ll get back to you soon.</p>
          </div>
        ) : (
          <form className="shipping-form" style={{ borderTop: "none", paddingTop: 0 }} onSubmit={handleSubmit}>
            <input required placeholder="Your name" value={name} onChange={(event) => setName(event.target.value)} />
            <input required type="email" placeholder="Your email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <textarea
              required
              placeholder="How can we help?"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              style={{ border: "1px solid var(--line)", background: "white", padding: 10, fontSize: 12, outlineColor: "var(--accent)", resize: "vertical" }}
            />
            <button className="checkout interactive" type="submit" style={{ justifyContent: "center" }}>Send message</button>
          </form>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`

- [ ] **Step 3: Manual verification** — submit with empty fields,
  confirm nothing happens (native `required` validation blocks it);
  fill all fields and submit, confirm the thank-you state replaces the
  form.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/contact/page.tsx
git commit -m "Add /contact page"
```

---

### Task 3: `/policies` page

**Files:**
- Create: `frontend/app/policies/page.tsx`

- [ ] **Step 1: Write the page** (three anchor-linked sections: Privacy,
  Terms, Returns):

```tsx
// frontend/app/policies/page.tsx
"use client";

import Link from "next/link";

export default function PoliciesPage() {
  return (
    <main className="store-shell">
      <nav className="navbar">
        <Link className="brand" href="/">THREAD<span>&</span>CO</Link>
        <Link href="/" className="back-link">← Back home</Link>
      </nav>

      <section className="page-shell">
        <p className="eyebrow">THE FINE PRINT</p>
        <h1>Policies</h1>
        <div style={{ display: "flex", gap: 20, marginBottom: 32, fontSize: 12 }}>
          <a href="#privacy" style={{ color: "var(--accent)" }}>Privacy Policy</a>
          <a href="#terms" style={{ color: "var(--accent)" }}>Terms of Service</a>
          <a href="#returns" style={{ color: "var(--accent)" }}>Returns &amp; Refunds</a>
        </div>

        <h2 id="privacy" style={{ fontSize: 24, marginTop: 40, marginBottom: 12 }}>Privacy Policy</h2>
        <p style={{ color: "#736d65", fontSize: 13, lineHeight: 1.8, marginBottom: 16 }}>
          We collect the information you give us when you create an
          account or place an order — your name, email, shipping
          address, and order history — solely to operate the store and
          fulfill your orders. We do not sell your data to third
          parties. Account passwords are stored hashed, never in plain
          text.
        </p>

        <h2 id="terms" style={{ fontSize: 24, marginTop: 40, marginBottom: 12 }}>Terms of Service</h2>
        <p style={{ color: "#736d65", fontSize: 13, lineHeight: 1.8, marginBottom: 16 }}>
          By creating an account or placing an order, you agree to
          provide accurate information and to use Thread&amp;Co only for
          lawful personal purchases. We reserve the right to cancel
          orders or suspend accounts in cases of suspected fraud or
          abuse.
        </p>

        <h2 id="returns" style={{ fontSize: 24, marginTop: 40, marginBottom: 12 }}>Returns &amp; Refunds</h2>
        <p style={{ color: "#736d65", fontSize: 13, lineHeight: 1.8 }}>
          Unworn items in original condition can be returned within 30
          days of delivery for a full refund to your original payment
          method. Contact us at <Link href="/contact" style={{ color: "var(--accent)" }}>our contact page</Link> to
          start a return.
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`

- [ ] **Step 3: Manual verification** — click each anchor link, confirm
  smooth-scroll to the right section, on both a desktop-width and a
  narrow mobile-width viewport.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/policies/page.tsx
git commit -m "Add /policies page"
```

---

### Task 4: Final dead-code sweep

**Files:** none fixed — this task is a search-and-verify pass across
everything touched in Phases 2-5.

- [ ] **Step 1: Search for leftover references to removed identifiers**

```bash
cd frontend && grep -rn "getIsAdminSnapshot\|getIsAdminServerSnapshot\|isAdmin\b" app/ lib/ components/ --include="*.tsx" --include="*.ts"
```

Expected: no matches (everything was renamed to `role`/`isAdminRole` in
Phase 2). Any match found here is a leftover from an incomplete rename —
fix it before proceeding.

- [ ] **Step 2: Search for unused exports**

```bash
cd frontend && npx tsc --noEmit
```

TypeScript's `noUnusedLocals`/`noUnusedParameters` (check
`tsconfig.json` — if either is `false`, temporarily note any obviously
unused import/const found by reading the diff from Phases 2-4 instead,
since the compiler won't flag it). Remove anything found.

- [ ] **Step 3: Confirm `page.tsx`'s shrink** — it should now hold only
  the hero, category/search-filtered featured grid (6 items),
  story banners, footer, and chat widget. Read the full file once and
  confirm nothing from the removed drawers/modals survived.

- [ ] **Step 4: Run the full backend test suite one more time** (no
  backend changes happened in Phases 2-5, but this confirms nothing in
  the repo's final state regressed):

Run: `cd backend && python -m pytest -v`
Expected: PASS (every test)

- [ ] **Step 5: Commit** (only if Step 1-3 found anything to fix; if the
  sweep found nothing, this step is skipped — there's nothing to commit)

```bash
git add -A
git commit -m "Remove dead code left over from role/page restructuring"
```

---

## Phase 5 Completion Check

- [ ] `cd frontend && npx tsc --noEmit && npm run build` — clean
- [ ] `cd backend && python -m pytest -v` — clean
- [ ] All 15 routes from the spec exist and are reachable:
  `/`, `/shop`, `/products/[id]`, `/cart`, `/checkout`,
  `/checkout/payment`, `/orders/[id]`, `/login`, `/register`,
  `/account`, `/admin`, `/lister`, `/about`, `/contact`, `/policies`
- [ ] Deploy to Vercel (`vercel --prod`, per the `vercel:deploy` skill)
  and smoke-test the live site end-to-end: register, browse `/shop`,
  add to cart, check out through the dummy payment page, view the order
  confirmation, and confirm an admin-promoted lister account can manage
  products at `/lister`
