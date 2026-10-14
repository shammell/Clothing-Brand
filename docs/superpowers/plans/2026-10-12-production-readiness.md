# Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps found in an in-chat production-readiness audit of Thread&Co (payment and custom-domain work excluded by the user) so the site can be sold/handed to a real client: a contact form that actually sends mail, self-service password recovery, real product-image upload, a first slice of automated frontend tests, error monitoring, custom error pages, basic SEO, and an admin audit trail.

**Architecture:** Backend (FastAPI) gets a small reusable email service (Resend) used by three features (contact form, order confirmation, password reset) plus a Sentry error-tracking hook and a CORS allow-list fix. Frontend (Next.js App Router) gets a Vitest+RTL test harness, a client-upload flow to Vercel Blob for product images, new static pages (forgot/reset password, 404/error/loading), SEO metadata/sitemap, and Vercel Analytics.

**Tech Stack:** FastAPI, Motor/MongoDB, Resend (`resend` PyPI package), Sentry (`sentry-sdk[fastapi]`), Next.js 16 App Router, React 19, Vitest + @testing-library/react, `@vercel/blob`, `@vercel/analytics`.

**Spec:** None as a separate document — this plan's Goal section *is* the spec, derived directly from a conversational code audit (see this session's prior turns: contact form is a client-side no-op, no image upload, zero frontend tests, no error monitoring, no password reset, no custom error pages, no SEO files, hardcoded dev-only CORS origins, no admin audit log). No separate spec file was written per the user's standing preference to minimize doc writes.

## Global Constraints

- Backend: Python, FastAPI, existing `backend/.env` pattern (`pydantic_settings.BaseSettings`, see `backend/app/core/config.py`). New required-at-call-time secrets must default to `None`/empty and degrade to a logged warning, never crash app startup (matches the existing `REDIS_URL` pattern in `backend/app/core/limiter.py`).
- Frontend: Next.js App Router, TypeScript, existing `API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api"` pattern used in every page — reuse it, don't invent a new base-URL convention.
- Every new backend route lives under an existing or clearly-named router, registered in `backend/app/main.py`, and follows the existing rate-limit pattern (`@limiter.limit(...)` from `app.core.limiter`) for any unauthenticated or auth-adjacent endpoint.
- Backend tests use the existing `backend/tests/conftest.py` fixtures (`client`, `register_user`, `auth_headers`, `admin_headers`, `lister_headers`, `seed_product`) — do not invent parallel fixtures.
- Resend and Vercel Blob must be provisioned via the Vercel Marketplace / Vercel Storage before their tasks start (see each task's Setup note) — per this session's own marketplace-skill rule, never hand-roll an SDK call against an unprovisioned account.
- Out of scope, explicitly, and not silently dropped: the custom-domain task (user excluded it), frontend (browser-side) Sentry instrumentation, per-product-page Open Graph metadata, and an admin-UI tab for the audit log added in Task 14 (backend/API only here). Flag these as fast-follows when this plan ships.

## Review Focus

- **Resend/Sentry misconfigured or unset in production** (`RESEND_API_KEY`/`SENTRY_DSN` env vars never set on Vercel) — every email-sending path must degrade to "log and return false/202" rather than 500 the request that triggered it (order placement, contact submission, password-reset request must all still succeed from the caller's point of view).
- **Password-reset token reuse / email enumeration** — `/auth/forgot-password` must return the same `202` response whether or not the email exists, and a reset token must be rejected once its 15-minute expiry passes or if its `purpose` claim isn't `password_reset` (so a normal login token can't be replayed as a reset token).
- **Image upload authorization** — the Next.js `/api/upload` route must reject a `customer`-role (or unauthenticated) caller's upload token request, not just hide the button in the UI, since the API route is reachable directly.
- **CORS origin merge silently dropping the existing local-dev origins** — `build_allowed_origins("")` (no `ALLOWED_ORIGINS` env var set) must return exactly today's five hardcoded dev origins, so an empty/unset production env var can't accidentally lock out local development.
- **Idempotency-key / stock-decrement logic in `create_order` must stay unchanged** when wiring in the confirmation email — the email send must happen *after* the order is durably inserted, and its failure must never roll back or fail the order.

---

### Task 1: Frontend testing infrastructure (Vitest + RTL)

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/vitest.setup.ts`
- Create: `frontend/lib/safeNextPath.test.ts`
- Create: `frontend/lib/useAddToCart.test.ts`
- Modify: `frontend/package.json` (add `devDependencies`, add `"test": "vitest run"` script)

**Interfaces:**
- Consumes: `frontend/lib/safeNextPath.ts` (`safeNextPath(value: string | null): string`, unchanged), `frontend/lib/useAddToCart.ts` (`useAddToCart()` hook, unchanged).
- Produces: a working `npm test` command every later task's frontend tests build on.

- [ ] **Step 1: Install test dependencies**

Run from `frontend/`:
```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Create the Vitest config**

```ts
// frontend/vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./") },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
});
```

```ts
// frontend/vitest.setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Add the test script**

In `frontend/package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 4: Write a failing pure-function test**

```ts
// frontend/lib/safeNextPath.test.ts
import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safeNextPath";

describe("safeNextPath", () => {
  it("accepts a plain same-origin path", () => {
    expect(safeNextPath("/cart")).toBe("/cart");
  });

  it("falls back to /account for null", () => {
    expect(safeNextPath(null)).toBe("/account");
  });

  it("rejects a protocol-relative path", () => {
    expect(safeNextPath("//evil.com")).toBe("/account");
  });

  it("rejects an absolute external URL", () => {
    expect(safeNextPath("https://evil.com")).toBe("/account");
  });

  it("strips tabs/CR/LF before validating, matching browser URL resolution", () => {
    expect(safeNextPath("/\t/evil.com")).toBe("/account");
  });
});
```

- [ ] **Step 5: Run it, confirm it fails only because the script doesn't exist yet, then run via npx to confirm the test itself is correct**

Run: `cd frontend && npx vitest run lib/safeNextPath.test.ts`
Expected: 5 passing tests (the function already exists and is already correct — this step proves the harness works, not a red/green TDD cycle for new behavior).

- [ ] **Step 6: Write the hook test for the cart quantity ceiling**

```ts
// frontend/lib/useAddToCart.test.ts
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAddToCart } from "./useAddToCart";
import type { Product } from "./shop-store";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Test Tee",
    category: "T-Shirts",
    price: 20,
    image: "/x.jpg",
    sizes: ["S", "M"],
    colors: ["Black"],
    stock: 3,
    rating: 4,
    ...overrides,
  } as Product;
}

describe("useAddToCart quantity ceiling", () => {
  it("clamps quantity to available stock", () => {
    const { result } = renderHook(() => useAddToCart());
    const product = makeProduct({ stock: 3 });
    act(() => result.current.setQuantity(product, 10));
    expect(result.current.getSelection(product).quantity).toBe(3);
  });

  it("clamps quantity to at least 1", () => {
    const { result } = renderHook(() => useAddToCart());
    const product = makeProduct({ stock: 3 });
    act(() => result.current.setQuantity(product, 0));
    expect(result.current.getSelection(product).quantity).toBe(1);
  });

  it("caps at MAX_QUANTITY (20) when stock is 0 (treated as unlimited)", () => {
    const { result } = renderHook(() => useAddToCart());
    const product = makeProduct({ stock: 0 });
    act(() => result.current.setQuantity(product, 999));
    expect(result.current.getSelection(product).quantity).toBe(20);
  });
});
```

Check `frontend/lib/shop-store.ts` exports a `Product` type before running — if the exported name differs, import it under that name instead.

- [ ] **Step 7: Run both test files**

Run: `cd frontend && npm test`
Expected: all 8 tests pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/vitest.config.ts frontend/vitest.setup.ts frontend/lib/safeNextPath.test.ts frontend/lib/useAddToCart.test.ts frontend/package.json frontend/package-lock.json
git commit -m "test: add Vitest + RTL harness with first safeNextPath/useAddToCart coverage"
```

---

### Task 2: Backend email service foundation (Resend)

**Setup (not code, do first):** Provision Resend via the Vercel Marketplace: `vercel integration add resend --yes` (or the dashboard), then verify a sending domain in the Resend dashboard before relying on production sends — until a domain is verified, Resend only delivers to the account owner's own address. Run `vercel env pull backend/.env` or copy `RESEND_API_KEY` into `backend/.env` manually for local dev.

**Files:**
- Create: `backend/app/services/email_service.py`
- Create: `backend/tests/test_email_service.py`
- Modify: `backend/app/core/config.py` (add `RESEND_API_KEY: str | None = None`)
- Modify: `backend/requirements.txt` (add `resend`)

**Interfaces:**
- Produces: `send_email(to: str, subject: str, html: str) -> bool` — used by Tasks 3, 4, 6.

- [ ] **Step 1: Add the dependency**

Run: `cd backend && ./venv/Scripts/pip.exe install resend` (or the system Python used to run the app), then add the pinned version it installs to `backend/requirements.txt`, e.g.:
```
resend==2.*
```
(replace `2.*` with the exact version `pip show resend` prints — don't guess a version pin.)

- [ ] **Step 2: Add the setting**

In `backend/app/core/config.py`, add inside `class Settings`:
```python
    RESEND_API_KEY: str | None = None
    FRONTEND_URL: str = "http://localhost:3000"
```

- [ ] **Step 3: Write the failing test**

```python
# backend/tests/test_email_service.py
import pytest

from app.core.config import settings
from app.services import email_service


def test_send_email_returns_false_and_logs_when_key_unset(monkeypatch, caplog):
    monkeypatch.setattr(settings, "RESEND_API_KEY", None)
    with caplog.at_level("WARNING"):
        result = email_service.send_email("a@example.com", "Subject", "<p>hi</p>")
    assert result is False
    assert "RESEND_API_KEY not set" in caplog.text


def test_send_email_calls_resend_and_returns_true(monkeypatch):
    monkeypatch.setattr(settings, "RESEND_API_KEY", "test-key")
    calls = []
    monkeypatch.setattr(email_service.resend.Emails, "send", lambda payload: calls.append(payload))
    result = email_service.send_email("a@example.com", "Subject", "<p>hi</p>")
    assert result is True
    assert calls[0]["to"] == "a@example.com"
    assert calls[0]["subject"] == "Subject"


def test_send_email_returns_false_on_resend_error(monkeypatch, caplog):
    monkeypatch.setattr(settings, "RESEND_API_KEY", "test-key")

    def _raise(payload):
        raise RuntimeError("boom")

    monkeypatch.setattr(email_service.resend.Emails, "send", _raise)
    with caplog.at_level("ERROR"):
        result = email_service.send_email("a@example.com", "Subject", "<p>hi</p>")
    assert result is False
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd backend && pytest tests/test_email_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.email_service'`.

- [ ] **Step 5: Implement the service**

```python
# backend/app/services/email_service.py
import logging

import resend

from app.core.config import settings

logger = logging.getLogger(__name__)

# Replace with the real verified Resend sending domain once provisioned
# (see this task's Setup note) - sends fail until that domain is verified.
FROM_ADDRESS = "Thread&Co <no-reply@threadco.example>"


def send_email(to: str, subject: str, html: str) -> bool:
    """Sends an email via Resend. Returns False (and logs) instead of
    raising - a failed notification email must never fail the request that
    triggered it (an order was still placed, a message was still received)
    even if Resend is down or RESEND_API_KEY isn't configured yet."""
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set - email to %s not sent: %s", to, subject)
        return False
    resend.api_key = settings.RESEND_API_KEY
    try:
        resend.Emails.send({"from": FROM_ADDRESS, "to": to, "subject": subject, "html": html})
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && pytest tests/test_email_service.py -v`
Expected: 3 passed.

- [ ] **Step 7: Run the full backend suite to confirm nothing else broke**

Run: `cd backend && pytest`
Expected: all tests pass (same count as before plus 3).

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/email_service.py backend/tests/test_email_service.py backend/app/core/config.py backend/requirements.txt
git commit -m "feat: add Resend-backed email service"
```

---

### Task 3: Order confirmation email

**Files:**
- Modify: `backend/app/routes/orders.py:1-18` (import), `backend/app/routes/orders.py:172-173` (send after insert)
- Modify: `backend/tests/test_orders.py` (add one test)

**Interfaces:**
- Consumes: `send_email(to, subject, html)` from Task 2.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_orders.py`:
```python
def test_create_order_sends_confirmation_email(client, auth_headers, seed_product, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.routes.orders.send_email",
        lambda to, subject, html: sent.append((to, subject, html)) or True,
    )
    product_id = seed_product(stock=5)
    response = client.post(
        "/orders/",
        headers=auth_headers,
        json={
            "items": [{"product_id": product_id, "size": "M", "color": "Black", "quantity": 1}],
            "shipping_address": {
                "full_name": "Jane Doe", "address_line1": "1 Main St", "city": "Town",
                "state": "ST", "postal_code": "00000", "country": "US",
            },
        },
    )
    assert response.status_code == 201
    assert len(sent) == 1
    assert sent[0][0] == "test@example.com"
```

Check the existing order-creation tests in `backend/tests/test_orders.py` for the exact `shipping_address`/item payload shape already in use and match it — use an existing passing test's JSON body verbatim if it differs from the sketch above.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && pytest tests/test_orders.py::test_create_order_sends_confirmation_email -v`
Expected: FAIL — `AttributeError` or `ImportError` (`send_email` not imported in `orders.py` yet), or simply `assert len(sent) == 1` failing with `0`.

- [ ] **Step 3: Wire the email in**

In `backend/app/routes/orders.py`, add to the imports:
```python
from app.services.email_service import send_email
```

Change the end of `create_order` (currently `orders.py:172-173`):
```python
    order_doc["_id"] = result.inserted_id
    send_email(
        to=current_user["email"],
        subject=f"Order confirmed — #{str(order_doc['_id'])[-8:]}",
        html=f"<p>Thanks for your order! Total: ${total:.2f}.</p>",
    )
    return serialize_order(order_doc)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && pytest tests/test_orders.py -v`
Expected: all pass, including the new test.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/orders.py backend/tests/test_orders.py
git commit -m "feat: send an order confirmation email on checkout"
```

---

### Task 4: Backend contact endpoint

**Files:**
- Create: `backend/app/models/contact.py`
- Create: `backend/app/routes/contact.py`
- Create: `backend/tests/test_contact.py`
- Modify: `backend/app/main.py:12-16` (import + include router)

**Interfaces:**
- Consumes: `send_email` from Task 2.
- Produces: `POST /contact/` — `{name, email, message}` → `202 {"status": "received"}`, consumed by Task 5's frontend form.

- [ ] **Step 1: Write the model**

```python
# backend/app/models/contact.py
from pydantic import BaseModel, EmailStr, Field


class ContactMessage(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    message: str = Field(min_length=1, max_length=5000)
```

- [ ] **Step 2: Write the failing test**

```python
# backend/tests/test_contact.py
def test_contact_submission_sends_email(client, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.routes.contact.send_email",
        lambda to, subject, html: sent.append((to, subject, html)) or True,
    )
    response = client.post(
        "/contact/",
        json={"name": "Jane", "email": "jane@example.com", "message": "Hello there"},
    )
    assert response.status_code == 202
    assert len(sent) == 1
    assert "Jane" in sent[0][1]


def test_contact_submission_rejects_empty_message(client):
    response = client.post(
        "/contact/",
        json={"name": "Jane", "email": "jane@example.com", "message": ""},
    )
    assert response.status_code == 422


def test_contact_submission_is_rate_limited(client, monkeypatch):
    monkeypatch.setattr("app.routes.contact.send_email", lambda to, subject, html: True)
    for _ in range(5):
        client.post("/contact/", json={"name": "Jane", "email": "jane@example.com", "message": "hi"})
    response = client.post("/contact/", json={"name": "Jane", "email": "jane@example.com", "message": "hi"})
    assert response.status_code == 429
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && pytest tests/test_contact.py -v`
Expected: FAIL — route `/contact/` doesn't exist (404).

- [ ] **Step 4: Implement the route**

```python
# backend/app/routes/contact.py
from fastapi import APIRouter, Request, status

from app.core.limiter import limiter
from app.models.contact import ContactMessage
from app.services.email_service import send_email

router = APIRouter(prefix="/contact", tags=["Contact"])

# Replace with the real inbox once the Resend sending domain is verified
# (see Task 2's Setup note).
SUPPORT_INBOX = "support@threadco.example"


@router.post("/", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
async def submit_contact_message(request: Request, message: ContactMessage):
    send_email(
        to=SUPPORT_INBOX,
        subject=f"Contact form: {message.name}",
        html=f"<p>From: {message.name} ({message.email})</p><p>{message.message}</p>",
    )
    return {"status": "received"}
```

- [ ] **Step 5: Register the router**

In `backend/app/main.py`, add to the route imports:
```python
from app.routes.contact import router as contact_router
```
and add alongside the other `app.include_router(...)` calls:
```python
app.include_router(contact_router)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && pytest tests/test_contact.py -v`
Expected: 3 passed.

- [ ] **Step 7: Run the full suite**

Run: `cd backend && pytest`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/contact.py backend/app/routes/contact.py backend/tests/test_contact.py backend/app/main.py
git commit -m "feat: add a real /contact endpoint that emails support"
```

---

### Task 5: Frontend contact form wired to the real endpoint

**Files:**
- Modify: `frontend/app/contact/page.tsx` (replace — becomes a server component with `metadata`)
- Create: `frontend/components/ContactForm.tsx` (the interactive part, moved out so the page can export `metadata`)
- Create: `frontend/components/ContactForm.test.tsx`

**Interfaces:**
- Consumes: `POST /contact/` from Task 4.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/components/ContactForm.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContactForm } from "./ContactForm";

describe("ContactForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("submits and shows the confirmation on success", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<ContactForm />);
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Jane" } });
    fireEvent.change(screen.getByPlaceholderText("Your email"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("How can we help?"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByText("Send message"));
    await waitFor(() => expect(screen.getByText(/we'll get back to you/i)).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/contact/"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows an error message when the request fails", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<ContactForm />);
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Jane" } });
    fireEvent.change(screen.getByPlaceholderText("Your email"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("How can we help?"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByText("Send message"));
    await waitFor(() => expect(screen.getByText(/could not send/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run components/ContactForm.test.tsx`
Expected: FAIL — `ContactForm` module doesn't exist yet.

- [ ] **Step 3: Extract the client component**

```tsx
// frontend/components/ContactForm.tsx
"use client";

import { useState, type FormEvent } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/contact/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      if (!response.ok) {
        setError("Could not send your message. Please try again.");
        return;
      }
      setSubmitted(true);
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="empty-state" style={{ marginTop: 0 }}>
        <span>✓</span>
        <p>Thanks — we&apos;ll get back to you soon.</p>
      </div>
    );
  }

  return (
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
      {error && <p style={{ color: "#b23b3b", fontSize: 12 }}>{error}</p>}
      <button className="checkout interactive" type="submit" disabled={loading} style={{ justifyContent: "center" }}>
        {loading ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Replace the page with a server component**

```tsx
// frontend/app/contact/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "Contact us — Thread&Co",
  description: "Get in touch with the Thread&Co team — support hours Monday-Friday, 9am-6pm.",
};

export default function ContactPage() {
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
          Email us directly at <a href="mailto:support@threadco.example" style={{ color: "var(--accent)" }}>support@threadco.example</a>,
          or use the form below. Support hours: Monday-Friday, 9am-6pm.
        </p>
        <ContactForm />
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npm test`
Expected: all tests pass, including the 2 new `ContactForm` tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/contact/page.tsx frontend/components/ContactForm.tsx frontend/components/ContactForm.test.tsx
git commit -m "feat: wire the contact form to the real /contact endpoint"
```

---

### Task 6: Password reset (backend)

**Files:**
- Modify: `backend/app/models/user.py` (add 2 models)
- Modify: `backend/app/services/auth_service.py` (add `create_reset_token`)
- Modify: `backend/app/routes/auth.py` (add 2 routes)
- Modify: `backend/tests/test_auth.py` (add tests)

**Interfaces:**
- Produces: `POST /auth/forgot-password` (`{email}` → `202`), `POST /auth/reset-password` (`{token, new_password}` → `200` or `400`). Consumed by Task 7's frontend pages.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_auth.py`:
```python
def test_forgot_password_sends_email_for_existing_user(client, register_user, monkeypatch):
    register_user(email="reset@example.com", password="origpass123")
    sent = []
    monkeypatch.setattr(
        "app.routes.auth.send_email",
        lambda to, subject, html: sent.append((to, subject, html)) or True,
    )
    response = client.post("/auth/forgot-password", json={"email": "reset@example.com"})
    assert response.status_code == 202
    assert len(sent) == 1
    assert sent[0][0] == "reset@example.com"


def test_forgot_password_returns_202_for_unknown_email_without_sending(client, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.routes.auth.send_email",
        lambda to, subject, html: sent.append((to, subject, html)) or True,
    )
    response = client.post("/auth/forgot-password", json={"email": "nobody@example.com"})
    assert response.status_code == 202
    assert len(sent) == 0


def test_reset_password_changes_password(client, register_user, monkeypatch):
    register_user(email="reset2@example.com", password="origpass123")
    captured = {}
    monkeypatch.setattr(
        "app.routes.auth.send_email",
        lambda to, subject, html: captured.setdefault("html", html) or True,
    )
    client.post("/auth/forgot-password", json={"email": "reset2@example.com"})
    token = captured["html"].split("token=")[1].split('"')[0]

    response = client.post("/auth/reset-password", json={"token": token, "new_password": "newpass456"})
    assert response.status_code == 200

    login = client.post("/auth/login", json={"email": "reset2@example.com", "password": "newpass456"})
    assert login.status_code == 200
    old_login = client.post("/auth/login", json={"email": "reset2@example.com", "password": "origpass123"})
    assert old_login.status_code == 401


def test_reset_password_rejects_login_token_as_reset_token(client, auth_headers, register_user):
    token = auth_headers["Authorization"].split(" ")[1]
    response = client.post("/auth/reset-password", json={"token": token, "new_password": "newpass456"})
    assert response.status_code == 400


def test_reset_password_rejects_garbage_token(client):
    response = client.post("/auth/reset-password", json={"token": "not-a-real-token", "new_password": "newpass456"})
    assert response.status_code == 400
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest tests/test_auth.py -k forgot_password -v`
Expected: FAIL — route doesn't exist (404s).

- [ ] **Step 3: Add the models**

In `backend/app/models/user.py`, add:
```python
class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)
```

- [ ] **Step 4: Add the token helper**

In `backend/app/services/auth_service.py`, add:
```python
RESET_TOKEN_EXPIRE_MINUTES = 15


def create_reset_token(user_id: str, email: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "purpose": "password_reset",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
```

- [ ] **Step 5: Add the routes**

In `backend/app/routes/auth.py`, add to imports:
```python
from bson import ObjectId
from bson.errors import InvalidId
from jose import JWTError

from app.core.config import settings
from app.models.user import PasswordResetConfirm, PasswordResetRequest
from app.services.auth_service import create_reset_token, decode_token
from app.services.email_service import send_email
```

Add the routes at the end of the file:
```python
@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
async def forgot_password(request: Request, body: PasswordResetRequest):
    db = get_database()
    email = str(body.email).lower()
    user = await db["users"].find_one({"email": email})
    # Always 202 regardless of whether the account exists - a different
    # response here would let anyone enumerate registered emails by
    # watching which ones trigger a 404 vs 202.
    if user:
        token = create_reset_token(str(user["_id"]), email)
        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        send_email(
            to=email,
            subject="Reset your Thread&Co password",
            html=f'<p>Click to reset your password (expires in 15 minutes): <a href="{reset_link}">{reset_link}</a></p>',
        )
    return {"status": "if that email exists, a reset link was sent"}


@router.post("/reset-password")
@limiter.limit("10/minute")
async def reset_password(request: Request, body: PasswordResetConfirm):
    try:
        payload = decode_token(body.token)
    except JWTError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link"
        ) from error
    if payload.get("purpose") != "password_reset":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link")

    db = get_database()
    try:
        object_id = ObjectId(payload["user_id"])
    except InvalidId as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link"
        ) from error

    result = await db["users"].update_one(
        {"_id": object_id}, {"$set": {"password": hash_password(body.new_password)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link")
    return {"status": "password updated"}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && pytest tests/test_auth.py -v`
Expected: all pass, including the 5 new tests.

- [ ] **Step 7: Run the full suite**

Run: `cd backend && pytest`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/user.py backend/app/services/auth_service.py backend/app/routes/auth.py backend/tests/test_auth.py
git commit -m "feat: add self-service password reset via email"
```

---

### Task 7: Password reset (frontend)

**Files:**
- Create: `frontend/app/forgot-password/page.tsx`
- Create: `frontend/app/reset-password/page.tsx`
- Modify: `frontend/app/login/page.tsx:43-44` (add a "Forgot password?" link)

**Interfaces:**
- Consumes: `POST /auth/forgot-password`, `POST /auth/reset-password` from Task 6.

- [ ] **Step 1: Add the forgot-password page**

```tsx
// frontend/app/forgot-password/page.tsx
"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <main className="page-shell">
      <Link href="/login" className="back-link">← Back to login</Link>
      <h1>Reset your password.</h1>
      {submitted ? (
        <p>If that email is registered, a reset link is on its way. Check your inbox.</p>
      ) : (
        <form
          className="auth-modal"
          style={{ margin: 0, width: "100%", boxShadow: "none", padding: 0 }}
          onSubmit={handleSubmit}
        >
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" />
          <button className="auth-submit interactive" type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Add the reset-password page**

```tsx
// frontend/app/reset-password/page.tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { extractErrorMessage } from "@/lib/auth-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(extractErrorMessage(data, "Could not reset your password."));
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return <p>This reset link is missing its token. Request a new one from the <Link href="/forgot-password">forgot password</Link> page.</p>;
  }

  if (done) {
    return <p>Password updated. Redirecting to login…</p>;
  }

  return (
    <form
      className="auth-modal"
      style={{ margin: 0, width: "100%", boxShadow: "none", padding: 0 }}
      onSubmit={handleSubmit}
    >
      <input
        type="password"
        required
        minLength={8}
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        placeholder="New password"
      />
      {error && <p className="auth-error">{error}</p>}
      <button className="auth-submit interactive" type="submit" disabled={loading}>
        {loading ? "Saving..." : "Set new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="page-shell">
      <Link href="/login" className="back-link">← Back to login</Link>
      <h1>Choose a new password.</h1>
      <Suspense fallback={null}>
        <ResetPasswordContent />
      </Suspense>
    </main>
  );
}
```

- [ ] **Step 3: Link to it from the login page**

In `frontend/app/login/page.tsx`, change line 43-44 from:
```tsx
        <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
        {error && <p className="auth-error">{error}</p>}
```
to:
```tsx
        <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
        <Link href="/forgot-password" className="auth-switch">Forgot password?</Link>
        {error && <p className="auth-error">{error}</p>}
```

- [ ] **Step 4: Manually verify the flow**

Run both dev servers (`backend`: `python -m app.main`, `frontend`: `npm run dev`), submit `/forgot-password` with a real registered test account, copy the token out of the email-service log line (since no real Resend key is configured locally unless Task 2's setup was completed), paste it into `/reset-password?token=...`, confirm login works with the new password. This flow has no automated frontend test in this plan (it is a thin pass-through to Task 6's already-tested backend) — this manual check is the verification step.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/forgot-password/page.tsx frontend/app/reset-password/page.tsx frontend/app/login/page.tsx
git commit -m "feat: add forgot/reset password pages"
```

---

### Task 8: Real product-image upload (Vercel Blob)

**Setup (not code, do first):** Provision Vercel Blob storage for this project — `vercel storage create blob` or via the dashboard's Storage tab — then `vercel env pull frontend/.env.local --yes` so `BLOB_READ_WRITE_TOKEN` is available locally.

**Files:**
- Modify: `backend/app/routes/auth.py` (add `GET /auth/me`)
- Modify: `backend/tests/test_auth.py` (add tests)
- Create: `frontend/lib/uploadAuth.ts`
- Create: `frontend/lib/uploadAuth.test.ts`
- Create: `frontend/app/api/upload/route.ts`
- Modify: `frontend/components/ProductManager.tsx:174` (add an upload control next to the URL field)
- Modify: `frontend/package.json` (add `@vercel/blob`)

**Interfaces:**
- Produces: `GET /auth/me` → `{user_id, email, role}`; `assertCanUploadImages(role: string | undefined): void` (throws if not `admin`/`lister`).

- [ ] **Step 1: Write the failing backend test**

Add to `backend/tests/test_auth.py`:
```python
def test_me_returns_current_user_role(client, auth_headers):
    response = client.get("/auth/me", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["role"] == "customer"


def test_me_requires_authentication(client):
    response = client.get("/auth/me")
    assert response.status_code == 401
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest tests/test_auth.py -k test_me -v`
Expected: FAIL — 404, route doesn't exist.

- [ ] **Step 3: Implement the route**

In `backend/app/routes/auth.py`, add to imports:
```python
from app.services.auth_service import CurrentUser, get_current_user
```
Add the route:
```python
@router.get("/me")
async def get_me(current_user: CurrentUser = Depends(get_current_user)):
    return {"user_id": current_user["user_id"], "email": current_user["email"], "role": current_user["role"]}
```
(`Depends` is already imported in this file via `fastapi`; confirm and add it to the `fastapi` import line if not.)

- [ ] **Step 4: Run the backend tests to verify they pass**

Run: `cd backend && pytest tests/test_auth.py -v`
Expected: all pass.

- [ ] **Step 5: Write the failing frontend test**

```ts
// frontend/lib/uploadAuth.test.ts
import { describe, expect, it } from "vitest";
import { assertCanUploadImages } from "./uploadAuth";

describe("assertCanUploadImages", () => {
  it("allows admin and lister", () => {
    expect(() => assertCanUploadImages("admin")).not.toThrow();
    expect(() => assertCanUploadImages("lister")).not.toThrow();
  });

  it("rejects customer and undefined", () => {
    expect(() => assertCanUploadImages("customer")).toThrow();
    expect(() => assertCanUploadImages(undefined)).toThrow();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd frontend && npx vitest run lib/uploadAuth.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 7: Implement it**

```ts
// frontend/lib/uploadAuth.ts
export function assertCanUploadImages(role: string | undefined): void {
  if (role !== "admin" && role !== "lister") {
    throw new Error("Not authorized to upload images");
  }
}
```

- [ ] **Step 8: Run the frontend test to verify it passes**

Run: `cd frontend && npm test`
Expected: all pass, including the 2 new tests.

- [ ] **Step 9: Install @vercel/blob**

Run: `cd frontend && npm install @vercel/blob`

- [ ] **Step 10: Add the upload route**

```ts
// frontend/app/api/upload/route.ts
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { assertCanUploadImages } from "@/lib/uploadAuth";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const token = typeof clientPayload === "string" ? clientPayload : "";
        const meUrl = new URL("/api/auth/me", request.url);
        const meResponse = await fetch(meUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (!meResponse.ok) throw new Error("Not authenticated");
        const me = (await meResponse.json()) as { role: string };
        assertCanUploadImages(me.role);

        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
          maximumSizeInBytes: 5 * 1024 * 1024,
        };
      },
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
```

Note: `meUrl` is built from `request.url` (not `NEXT_PUBLIC_API_URL`) because this runs server-side in a route handler, where a bare `/api/...` fetch has no implicit origin to resolve against — `new URL("/api/auth/me", request.url)` relies on the same Vercel rewrite (`vercel.json`) that the browser-side `fetch("/api/...")` calls elsewhere in this app already depend on.

- [ ] **Step 11: Wire the upload control into ProductManager**

In `frontend/components/ProductManager.tsx`, add to imports:
```tsx
import { upload } from "@vercel/blob/client";
```
Add a new state near the other form state (after `const [deletingId, setDeletingId] = useState<string | null>(null);`):
```tsx
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
```
Add a handler near `submitForm`:
```tsx
  const uploadImage = async (file: File) => {
    setUploading(true);
    setUploadError("");
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        clientPayload: authToken,
      });
      setForm((current) => ({ ...current, image_url: blob.url }));
    } catch {
      setUploadError("Could not upload image.");
    } finally {
      setUploading(false);
    }
  };
```
`ProductManager`'s props already include `authToken` (see `export function ProductManager({ authToken, onSessionExpired }: ...)`), so it's in scope.

Replace line 174 (the image-URL input) with the input plus an upload control:
```tsx
          <div className="md:col-span-2 flex gap-2 items-center">
            <input required placeholder="Image URL (or upload below)" value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} className={inputClass} />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadImage(file);
                event.target.value = "";
              }}
            />
            {uploading && <span className="text-sm text-neutral-500">Uploading...</span>}
            {uploadError && <span className="text-sm text-red-600">{uploadError}</span>}
          </div>
```

- [ ] **Step 12: Manually verify**

Log in as a `lister` or `admin`, open the admin/lister product form, pick a real image file, confirm the "Image URL" field auto-fills with a `https://*.public.blob.vercel-storage.com/...` URL and the saved product renders that image on `/shop`. This UI interaction has no automated test in this plan (the authorization logic it depends on is covered by Step 8's `uploadAuth` test and Task 6's backend auth tests) — this manual check is the verification step.

- [ ] **Step 13: Commit**

```bash
git add backend/app/routes/auth.py backend/tests/test_auth.py frontend/lib/uploadAuth.ts frontend/lib/uploadAuth.test.ts frontend/app/api/upload/route.ts frontend/components/ProductManager.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat: add Vercel Blob product image upload for admin/lister"
```

---

### Task 9: Backend error monitoring (Sentry)

**Setup (not code, do first):** Provision Sentry via the Vercel Marketplace: `vercel integration add sentry --yes` (or the dashboard), then `vercel env pull backend/.env` or copy `SENTRY_DSN` into `backend/.env` manually for local dev. Frontend (browser-side) Sentry instrumentation is explicitly out of scope for this plan (see Global Constraints) — this task covers the FastAPI backend only.

**Files:**
- Modify: `backend/app/core/config.py` (add `SENTRY_DSN`)
- Modify: `backend/app/main.py` (conditional `sentry_sdk.init`)
- Modify: `backend/requirements.txt` (add `sentry-sdk`)
- Modify: `backend/tests/test_auth.py` or a new `backend/tests/test_main.py` (one smoke test)

**Interfaces:** None consumed by later tasks.

- [ ] **Step 1: Add the dependency**

Run: `cd backend && ./venv/Scripts/pip.exe install "sentry-sdk[fastapi]"`, then add the pinned version `pip show sentry-sdk` prints to `backend/requirements.txt`, e.g.:
```
sentry-sdk[fastapi]==2.*
```
(replace `2.*` with the exact installed version.)

- [ ] **Step 2: Add the setting**

In `backend/app/core/config.py`, add inside `class Settings`:
```python
    SENTRY_DSN: str | None = None
```

- [ ] **Step 3: Write the smoke test**

```python
# backend/tests/test_main.py
def test_app_starts_and_health_check_works_without_sentry_dsn(client):
    # SENTRY_DSN is unset in the test environment (conftest.py doesn't set
    # it) - this pins that the conditional sentry_sdk.init() below never
    # runs during tests and never breaks app startup either way.
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 4: Run it to verify it currently passes (the app already starts fine) — this test exists to catch a future regression, not today's missing feature**

Run: `cd backend && pytest tests/test_main.py -v`
Expected: PASS already (no behavior change yet) — confirms the baseline before Step 5 touches `main.py`.

- [ ] **Step 5: Wire Sentry in**

In `backend/app/main.py`, add near the top of the imports:
```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
```
Add right after the existing `app = FastAPI(...)` line's surrounding setup, before `app.add_middleware(SlowAPIMiddleware)` — actually before `app = FastAPI(...)` is constructed, since Sentry must be initialized before the app it instruments:
```python
if settings.SENTRY_DSN:
    sentry_sdk.init(dsn=settings.SENTRY_DSN, integrations=[FastApiIntegration()], traces_sample_rate=0.1)
```
Place this line immediately after the existing imports and before `app = FastAPI(title="Thread&Co API", version="1.0.0", lifespan=lifespan)`.

- [ ] **Step 6: Run the test to verify it still passes**

Run: `cd backend && pytest tests/test_main.py -v`
Expected: PASS.

- [ ] **Step 7: Run the full suite**

Run: `cd backend && pytest`
Expected: all pass.

- [ ] **Step 8: Manually verify in a real deployment**

After `SENTRY_DSN` is set in Vercel's production env vars and deployed, deliberately trigger a server error (e.g. hit a route with malformed input that bypasses validation, or temporarily `raise Exception("test")` in a throwaway route and revert it) and confirm it appears in the Sentry dashboard. This is a manual, one-time check — Sentry delivery itself isn't something `pytest` should assert against a real external service.

- [ ] **Step 9: Commit**

```bash
git add backend/app/core/config.py backend/app/main.py backend/requirements.txt backend/tests/test_main.py
git commit -m "feat: add Sentry error tracking to the backend"
```

---

### Task 10: Custom error, not-found, and loading pages

**Files:**
- Create: `frontend/app/not-found.tsx`
- Create: `frontend/app/error.tsx`
- Create: `frontend/app/loading.tsx`
- Create: `frontend/app/not-found.test.tsx`
- Create: `frontend/app/error.test.tsx`

**Interfaces:** None.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/app/not-found.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "./not-found";

describe("NotFound", () => {
  it("shows a 404 message and a link back to the shop", () => {
    render(<NotFound />);
    expect(screen.getByText(/doesn't exist/i)).toBeInTheDocument();
    expect(screen.getByText("Back to shop")).toHaveAttribute("href", "/");
  });
});
```

```tsx
// frontend/app/error.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GlobalError from "./error";

describe("GlobalError", () => {
  it("calls reset when 'Try again' is clicked", () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByText("Try again"));
    expect(reset).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run app/not-found.test.tsx app/error.test.tsx`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement `not-found.tsx`**

```tsx
// frontend/app/not-found.tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="store-shell">
      <nav className="navbar">
        <Link className="brand" href="/">THREAD<span>&</span>CO</Link>
        <Link href="/" className="back-link">← Back home</Link>
      </nav>
      <section className="page-shell" style={{ textAlign: "center" }}>
        <p className="eyebrow">404</p>
        <h1>This page doesn&apos;t exist.</h1>
        <p style={{ color: "#736d65", fontSize: 13, marginBottom: 24 }}>
          The page you&apos;re looking for may have moved or been removed.
        </p>
        <Link href="/" className="checkout interactive" style={{ display: "inline-flex" }}>Back to shop</Link>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Implement `error.tsx`**

```tsx
// frontend/app/error.tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="store-shell">
      <nav className="navbar">
        <Link className="brand" href="/">THREAD<span>&</span>CO</Link>
      </nav>
      <section className="page-shell" style={{ textAlign: "center" }}>
        <p className="eyebrow">SOMETHING WENT WRONG</p>
        <h1>An unexpected error occurred.</h1>
        <button onClick={reset} className="checkout interactive" style={{ display: "inline-flex", border: "none", cursor: "pointer" }}>
          Try again
        </button>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Implement `loading.tsx`**

```tsx
// frontend/app/loading.tsx
export default function Loading() {
  return (
    <main className="store-shell">
      <section className="page-shell" style={{ textAlign: "center" }}>
        <span className="spinner" />
      </section>
    </main>
  );
}
```
(`.spinner` is an existing class — see its use in `frontend/lib/useAuthForm.ts`-driven buttons.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/not-found.tsx frontend/app/error.tsx frontend/app/loading.tsx frontend/app/not-found.test.tsx frontend/app/error.test.tsx
git commit -m "feat: add custom 404, error, and loading pages"
```

---

### Task 11: SEO (sitemap, robots, static-page metadata) + Vercel Analytics

**Files:**
- Create: `frontend/app/sitemap.ts`
- Create: `frontend/app/robots.ts`
- Create: `frontend/app/sitemap.test.ts`
- Modify: `frontend/app/about/page.tsx` (drop `"use client"`, add `metadata`)
- Modify: `frontend/app/policies/page.tsx` (drop `"use client"`, add `metadata`)
- Modify: `frontend/app/layout.tsx` (add `<Analytics />`)
- Modify: `frontend/package.json` (add `@vercel/analytics`)

**Interfaces:** None. (Per-product-page Open Graph metadata is explicitly out of scope — see Global Constraints.)

- [ ] **Step 1: Write the failing test**

```ts
// frontend/app/sitemap.test.ts
import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";
import robots from "./robots";

describe("sitemap", () => {
  it("includes every static page", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.some((url) => url.endsWith("/shop"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/about"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/contact"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/policies"))).toBe(true);
  });
});

describe("robots", () => {
  it("disallows account/admin/lister areas", () => {
    const result = robots();
    const disallow = (result.rules as { disallow?: string[] }).disallow ?? [];
    expect(disallow).toContain("/admin");
    expect(disallow).toContain("/account");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run app/sitemap.test.ts`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement `sitemap.ts` and `robots.ts`**

```ts
// frontend/app/sitemap.ts
import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://clothing-store-sky-codein.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPaths = ["", "/shop", "/about", "/contact", "/policies"];
  return staticPaths.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
  }));
}
```

```ts
// frontend/app/robots.ts
import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://clothing-store-sky-codein.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/admin", "/lister", "/checkout", "/orders"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test`
Expected: all pass.

- [ ] **Step 5: Add metadata to the static info pages**

In `frontend/app/about/page.tsx`, remove the `"use client";` line, add near the top:
```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About us — Thread&Co",
  description: "The story behind Thread&Co's everyday essentials.",
};
```
This page has no `useState`/`useEffect`/event handlers (confirmed by inspection — it only renders static JSX and `<Link>`), so removing `"use client"` is safe.

In `frontend/app/policies/page.tsx`, remove the `"use client";` line, add near the top:
```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Policies — Thread&Co",
  description: "Privacy policy, terms of service, and returns & refunds for Thread&Co.",
};
```
Same applies — this page is static JSX with in-page anchor links only.

- [ ] **Step 6: Add Vercel Analytics**

Run: `cd frontend && npm install @vercel/analytics`

In `frontend/app/layout.tsx`, add to imports:
```tsx
import { Analytics } from "@vercel/analytics/next";
```
Add `<Analytics />` as the last child inside `<body>`, after `{children}`:
```tsx
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
        <Analytics />
      </body>
```

- [ ] **Step 7: Verify the build**

Run: `cd frontend && npm run build`
Expected: build succeeds; `/sitemap.xml` and `/robots.txt` appear in the route output.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/sitemap.ts frontend/app/robots.ts frontend/app/sitemap.test.ts frontend/app/about/page.tsx frontend/app/policies/page.tsx frontend/app/layout.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat: add sitemap, robots.txt, static-page metadata, and Vercel Analytics"
```

---

### Task 12: Production CORS origins

**Files:**
- Modify: `backend/app/core/config.py` (add `ALLOWED_ORIGINS`, `DEFAULT_DEV_ORIGINS`, `build_allowed_origins`)
- Modify: `backend/app/main.py:30-45` (use `build_allowed_origins`)
- Create: `backend/tests/test_config.py`

**Interfaces:**
- Produces: `build_allowed_origins(extra: str) -> list[str]`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_config.py
from app.core.config import DEFAULT_DEV_ORIGINS, build_allowed_origins


def test_build_allowed_origins_empty_returns_dev_defaults():
    assert build_allowed_origins("") == DEFAULT_DEV_ORIGINS


def test_build_allowed_origins_merges_extra():
    result = build_allowed_origins("https://clothing-store-sky-codein.vercel.app, https://example.com")
    assert "https://clothing-store-sky-codein.vercel.app" in result
    assert "https://example.com" in result
    assert set(DEFAULT_DEV_ORIGINS).issubset(set(result))


def test_build_allowed_origins_ignores_blank_entries():
    result = build_allowed_origins("https://example.com, , ")
    assert result.count("https://example.com") == 1
    assert "" not in result
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest tests/test_config.py -v`
Expected: FAIL — `ImportError`, `build_allowed_origins` doesn't exist.

- [ ] **Step 3: Implement it**

In `backend/app/core/config.py`, add inside `class Settings` (after `TRUSTED_PROXY_HOPS`):
```python
    # Comma-separated extra origins (e.g. the production domain) merged
    # with DEFAULT_DEV_ORIGINS below - empty/unset must never shrink the
    # allow-list below today's dev-only defaults.
    ALLOWED_ORIGINS: str = ""
```
Add at module level, below the `Settings` class (or above it, either works as long as it's before `settings = Settings()`):
```python
DEFAULT_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    # `npm run dev` defaults to 3000, not 3001 - keeping both so LAN
    # access works whichever port the frontend actually comes up on.
    "http://192.168.18.38:3000",
    "http://192.168.18.38:3001",
]


def build_allowed_origins(extra: str) -> list[str]:
    extras = [origin.strip() for origin in extra.split(",") if origin.strip()]
    return DEFAULT_DEV_ORIGINS + extras
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && pytest tests/test_config.py -v`
Expected: 3 passed.

- [ ] **Step 5: Use it in `main.py`**

In `backend/app/main.py`, add to imports:
```python
from app.core.config import build_allowed_origins, settings
```
(`settings` is likely already imported — merge into the existing `from app.core.config import settings` line instead of duplicating it.)

Replace the hardcoded `allow_origins=[...]` list (currently `main.py:32-41`) with:
```python
    allow_origins=build_allowed_origins(settings.ALLOWED_ORIGINS),
```

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && pytest`
Expected: all pass.

- [ ] **Step 7: Set the production value**

In Vercel's project environment variables (Production), set `ALLOWED_ORIGINS` to the deployed frontend origin(s), e.g. `https://clothing-store-sky-codein.vercel.app,https://clothing-store-tan-nu.vercel.app`. (Same-origin traffic through the `vercel.json` rewrite doesn't strictly need this, but any direct cross-origin call — a future mobile client, a split custom domain — will.)

- [ ] **Step 8: Commit**

```bash
git add backend/app/core/config.py backend/app/main.py backend/tests/test_config.py
git commit -m "feat: make CORS allowed origins configurable for production"
```

---

### Task 13: Accessibility fix — cart item image alt text

**Files:**
- Modify: `frontend/app/cart/page.tsx:66`

**Interfaces:** None.

- [ ] **Step 1: Confirm the bug**

Run: `cd frontend && grep -n 'alt=""' app/cart/page.tsx`
Expected: one match, line 66 (`<img src={item.image} alt="" ...>`) — a screen reader announces nothing for each cart line's product thumbnail, even though it's meaningful content (not decorative), unlike the already-correct `alt={product.name}` on the product grid/detail pages.

- [ ] **Step 2: Fix it**

Change `frontend/app/cart/page.tsx:66` from:
```tsx
              <img src={item.image} alt="" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_IMAGE; }} />
```
to:
```tsx
              <img src={item.image} alt={item.name} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_IMAGE; }} />
```

- [ ] **Step 3: Verify**

Run: `cd frontend && grep -n 'alt=""' app/cart/page.tsx`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/cart/page.tsx
git commit -m "fix: give cart item thumbnails real alt text instead of empty"
```

---

### Task 14: Admin audit log (role/block changes)

**Files:**
- Create: `backend/app/models/audit.py`
- Modify: `backend/app/routes/users.py` (write + list audit entries)
- Modify: `backend/tests/test_users.py` (add tests)

**Interfaces:**
- Produces: `GET /users/audit-log` (admin-only) → `list[AuditLogEntry]`. Frontend admin-UI tab for this is explicitly out of scope for this plan (see Global Constraints) — this task is backend/API only.

- [ ] **Step 1: Write the model**

```python
# backend/app/models/audit.py
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogEntry(BaseModel):
    id: str
    actor_id: str
    action: str
    target_user_id: str
    details: dict[str, Any]
    created_at: datetime
```

- [ ] **Step 2: Write the failing tests**

Add to `backend/tests/test_users.py`:
```python
def test_role_change_is_recorded_in_audit_log(client, admin_headers, register_user):
    register_user(email="target@example.com")
    users_response = client.get("/users/", headers=admin_headers)
    target_id = next(u["id"] for u in users_response.json() if u["email"] == "target@example.com")

    client.patch(f"/users/{target_id}/role", headers=admin_headers, json={"role": "lister"})

    log_response = client.get("/users/audit-log", headers=admin_headers)
    assert log_response.status_code == 200
    entries = log_response.json()
    assert any(
        e["target_user_id"] == target_id and e["action"] == "role_change" and e["details"]["new_role"] == "lister"
        for e in entries
    )


def test_block_change_is_recorded_in_audit_log(client, admin_headers, register_user):
    register_user(email="target2@example.com")
    users_response = client.get("/users/", headers=admin_headers)
    target_id = next(u["id"] for u in users_response.json() if u["email"] == "target2@example.com")

    client.patch(f"/users/{target_id}/block", headers=admin_headers, json={"is_blocked": True})

    log_response = client.get("/users/audit-log", headers=admin_headers)
    entries = log_response.json()
    assert any(
        e["target_user_id"] == target_id and e["action"] == "block_change" and e["details"]["is_blocked"] is True
        for e in entries
    )


def test_audit_log_requires_admin(client, auth_headers):
    response = client.get("/users/audit-log", headers=auth_headers)
    assert response.status_code == 403
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd backend && pytest tests/test_users.py -k audit -v`
Expected: FAIL — `/users/audit-log` doesn't exist (404).

- [ ] **Step 4: Implement it**

In `backend/app/routes/users.py`, add to imports:
```python
from datetime import datetime, timezone

from app.models.audit import AuditLogEntry
```

Add helper functions after `parse_user_id`:
```python
def serialize_audit_entry(entry: dict) -> dict:
    return {
        "id": str(entry["_id"]),
        "actor_id": entry["actor_id"],
        "action": entry["action"],
        "target_user_id": entry["target_user_id"],
        "details": entry.get("details", {}),
        "created_at": entry["created_at"],
    }


async def record_audit(db, actor_id: str, action: str, target_user_id: str, details: dict) -> None:
    await db["audit_log"].insert_one(
        {
            "actor_id": actor_id,
            "action": action,
            "target_user_id": target_user_id,
            "details": details,
            "created_at": datetime.now(timezone.utc),
        }
    )
```

Add the list route (placed after `list_users`):
```python
@router.get("/audit-log", response_model=list[AuditLogEntry])
async def list_audit_log(_: CurrentUser = Depends(require_admin)):
    db = get_database()
    entries = await db["audit_log"].find({}).sort("created_at", -1).to_list(length=200)
    return [serialize_audit_entry(entry) for entry in entries]
```

In `update_user_role`, after the existing `result = await db["users"].find_one_and_update(...)` call and its `if not result` check, before `updated = await db["users"].find_one(...)`, add:
```python
    await record_audit(db, current_user["user_id"], "role_change", user_id, {"new_role": update.role})
```

In `update_user_block`, at the equivalent point, add:
```python
    await record_audit(db, current_user["user_id"], "block_change", user_id, {"is_blocked": update.is_blocked})
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && pytest tests/test_users.py -v`
Expected: all pass, including the 3 new tests.

- [ ] **Step 6: Run the full suite**

Run: `cd backend && pytest`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/audit.py backend/app/routes/users.py backend/tests/test_users.py
git commit -m "feat: record an audit log entry on admin role/block changes"
```

---

## Follow-ups explicitly deferred (not silently dropped)

- Custom domain (user excluded it from this plan).
- Frontend (browser-side) Sentry instrumentation — Task 9 covers the backend only.
- Per-product-page Open Graph metadata — Task 11 covers sitemap/robots/static pages only; the product detail page would need the same server/client split `ContactForm` got in Task 5.
- Admin-UI "Activity" tab rendering the Task 14 audit log — the API exists, the admin dashboard doesn't yet show it.
- Migrating `<img>` to `next/image` for lazy-loading/responsive sizing — Task 13 only fixed the one real `alt=""` bug; all three image spots already had correctly-populated `alt` otherwise.
