# Phase 4: Lister Dashboard & Admin Users Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Listers their own dashboard (`/lister`, product CRUD
only) and give Admins a Users tab (`/admin`, promote/demote/block), both
built on Phase 1's backend API.

**Architecture:** Extract the existing product CRUD form+table out of
`admin/page.tsx` into a shared `components/ProductManager.tsx`, reused
by both `/admin` and the new `/lister`. Add a Users section to
`admin/page.tsx` using Phase 1's `/users/` endpoints.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind utility
classes (matching `admin/page.tsx`'s existing convention — this is the
one page in the frontend that uses Tailwind rather than the hand-written
CSS in `globals.css`, and this phase follows that existing precedent
rather than introducing a third styling approach).

**Spec:** `docs/superpowers/specs/2026-10-08-site-expansion-design.md`
(sections: Frontend Changes → New pages behavior detail → `/lister`,
Admin Users tab)

**Depends on:** Phase 1 (`/users/` API, `require_role`), Phase 2 (role
wiring in `auth-store.ts`).

## Global Constraints

- `ProductManager` is the single source of truth for product CRUD UI —
  `/admin` and `/lister` both render it with no behavior differences
  between them (same create/edit/delete capability, since both roles
  have identical product permissions per the spec).
- No client-side "disable the admin's own row" in the Users table: that
  would require storing the logged-in user's id in `auth-store.ts`
  (currently only username/token/role are stored) purely for a UX
  nicety. The backend already returns `400` for self-demotion/self-block
  (Phase 1, Task 6) — this phase surfaces that as the existing inline
  error pattern (`usersError`), which is simpler and already correct.
- `/lister` keeps its own self-contained login form, matching
  `admin/page.tsx`'s existing precedent (an embedded form, not a
  redirect to the global `/login` page) — consistency with the one
  existing admin-style page beats introducing a second pattern.

## Review Focus

1. A Lister visiting `/admin` (not just a customer) must still see the
   "doesn't have admin access" message — `/admin` stays strictly
   `role === "admin"`, never widened to include `lister`.
2. An Admin visiting `/lister` should work (Admin has every Lister
   permission) — `/lister`'s gate is `role === "admin" || role === "lister"`.
3. Blocking a user from the Users tab who is *currently viewing* a page
   must not look silently broken — their next authenticated request will
   fail server-side (Phase 1 already handles this at `login`; mid-session
   blocking is a documented gap per Phase 1's Review Focus item 1, not
   re-solved here).
4. The Users table must visibly distinguish `is_blocked: true` rows
   (not just a boolean buried in a tooltip) — an admin scanning the list
   needs to see who's blocked at a glance.

---

### Task 1: Extract `ProductManager` component

**Files:**
- Create: `frontend/components/ProductManager.tsx`
- Modify: `frontend/app/admin/page.tsx`

**Interfaces:**
- Produces: `<ProductManager authToken={authToken} onSessionExpired={logout} />`
  — consumed by Task 2 (admin) and Task 4 (lister).

- [ ] **Step 1: Create the component** — this is the existing product
  type/helpers/state/handlers/JSX from `admin/page.tsx` (current lines
  18-86, 132-165, 256-322, 383-452), unchanged except `logout()` calls
  become the `onSessionExpired` prop:

```tsx
// frontend/components/ProductManager.tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { authenticatedFetch, extractErrorMessage } from "@/lib/auth-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type Product = {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  brand: string;
  sizes: string[];
  colors: string[];
  image_url: string;
  stock: number;
  rating: number;
};

type ProductFormState = {
  name: string; description: string; price: string; category: string; brand: string;
  sizes: string; colors: string; image_url: string; stock: string; rating: string;
};

const EMPTY_FORM: ProductFormState = {
  name: "", description: "", price: "", category: "", brand: "",
  sizes: "", colors: "", image_url: "", stock: "", rating: "0",
};

function productToForm(product: Product): ProductFormState {
  return {
    name: product.name, description: product.description ?? "", price: String(product.price),
    category: product.category, brand: product.brand, sizes: product.sizes.join(", "),
    colors: product.colors.join(", "), image_url: product.image_url, stock: String(product.stock),
    rating: String(product.rating),
  };
}

function formToPayload(form: ProductFormState) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    price: Number(form.price),
    category: form.category.trim(),
    brand: form.brand.trim(),
    sizes: form.sizes.split(",").map((size) => size.trim()).filter(Boolean),
    colors: form.colors.split(",").map((color) => color.trim()).filter(Boolean),
    image_url: form.image_url.trim(),
    stock: Number(form.stock),
    rating: Number(form.rating) || 0,
  };
}

const inputClass = "border border-neutral-300 px-3 py-2 text-sm w-full";

export function ProductManager({ authToken, onSessionExpired }: { authToken: string; onSessionExpired: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadProducts = async () => {
    setProductsLoading(true);
    setProductsError("");
    try {
      const response = await fetch(`${API_BASE}/products/`);
      const data = await response.json();
      if (!response.ok) {
        setProductsError(extractErrorMessage(data, "Could not load products."));
        return;
      }
      setProducts(data as Product[]);
    } catch {
      setProductsError("Could not connect to the server.");
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProducts();
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError("");
  };

  const startEdit = (product: Product) => {
    setForm(productToForm(product));
    setEditingId(product.id);
    setFormError("");
  };

  const submitForm = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    setFormSaving(true);
    try {
      const payload = formToPayload(form);
      const url = editingId ? `${API_BASE}/products/${editingId}` : `${API_BASE}/products/`;
      const method = editingId ? "PUT" : "POST";
      const response = await authenticatedFetch(url, authToken, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        onSessionExpired();
        setFormError("Your session expired. Please log in again.");
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setFormError(extractErrorMessage(data, "Could not save the product."));
        return;
      }
      resetForm();
      loadProducts();
    } catch {
      setFormError("Could not connect to the server.");
    } finally {
      setFormSaving(false);
    }
  };

  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    setDeletingId(product.id);
    try {
      const response = await authenticatedFetch(`${API_BASE}/products/${product.id}`, authToken, { method: "DELETE" });
      if (response.status === 401) {
        onSessionExpired();
        setProductsError("Your session expired. Please log in again.");
        return;
      }
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => null);
        setProductsError(extractErrorMessage(data, "Could not delete the product."));
        return;
      }
      if (editingId === product.id) resetForm();
      loadProducts();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <section className="bg-white border border-neutral-200 p-6 space-y-4">
        <h2 className="text-lg font-medium text-neutral-900">{editingId ? "Edit product" : "Add a product"}</h2>
        <form onSubmit={submitForm} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input required placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} />
          <input required placeholder="Brand" value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} className={inputClass} />
          <input required placeholder="Category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass} />
          <input required type="number" step="0.01" min="0.01" placeholder="Price" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className={inputClass} />
          <input required type="number" min="0" placeholder="Stock" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} className={inputClass} />
          <input type="number" step="0.1" min="0" max="5" placeholder="Rating (0-5)" value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })} className={inputClass} />
          <input required placeholder="Sizes (comma-separated)" value={form.sizes} onChange={(event) => setForm({ ...form, sizes: event.target.value })} className={`${inputClass} md:col-span-2`} />
          <input required placeholder="Colors (comma-separated)" value={form.colors} onChange={(event) => setForm({ ...form, colors: event.target.value })} className={`${inputClass} md:col-span-2`} />
          <input required placeholder="Image URL (e.g. /products/x.jpg)" value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} className={`${inputClass} md:col-span-2`} />
          <textarea placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${inputClass} md:col-span-2`} rows={2} />
          {formError && <p className="text-sm text-red-600 md:col-span-2">{formError}</p>}
          <div className="flex gap-3 md:col-span-2">
            <button type="submit" disabled={formSaving} className="bg-neutral-900 text-white px-4 py-2 text-sm uppercase tracking-wide disabled:opacity-60">
              {formSaving ? "Saving..." : editingId ? "Save changes" : "Add product"}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="px-4 py-2 text-sm underline">
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="bg-white border border-neutral-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-neutral-900">Products ({products.length})</h2>
          <button onClick={loadProducts} className="text-sm underline">Refresh</button>
        </div>
        {productsLoading && <p className="text-sm text-neutral-500">Loading...</p>}
        {!productsLoading && productsError && <p className="text-sm text-red-600">{productsError}</p>}
        {!productsLoading && !productsError && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-neutral-200">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Price</th>
                  <th className="py-2 pr-4">Stock</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-4">{product.name}</td>
                    <td className="py-2 pr-4">{product.category}</td>
                    <td className="py-2 pr-4">${product.price.toFixed(2)}</td>
                    <td className="py-2 pr-4">{product.stock}</td>
                    <td className="py-2 pr-4 flex gap-3 whitespace-nowrap">
                      <button onClick={() => startEdit(product)} className="underline">Edit</button>
                      <button onClick={() => deleteProduct(product)} disabled={deletingId === product.id} className="underline text-red-600 disabled:opacity-60">
                        {deletingId === product.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 2: Update `admin/page.tsx` to use it** — remove the
  `Product`/`ProductFormState` types, `EMPTY_FORM`, `productToForm`,
  `formToPayload`, `inputClass`, the `products`/`productsLoading`/
  `productsError`/`form`/`editingId`/`formError`/`formSaving`/
  `deletingId` state, and the `loadProducts`/`resetForm`/`startEdit`/
  `submitForm`/`deleteProduct` functions (all now in `ProductManager`).
  Update the admin-data-loading effect to only call `loadOrders()`
  (products load themselves inside `ProductManager`):

```tsx
useEffect(() => {
  if (!isAdminRole(role)) return;
  // eslint-disable-next-line react-hooks/set-state-in-effect
  loadOrders();
  loadUsers(); // added in Task 3 below — if implementing Task 2 and
               // Task 3 together, include this line now; if strictly
               // task-by-task, add it when Task 3 adds loadUsers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [role]);
```

Replace the "Add a product"/"Products" sections (the two `<section>`
blocks currently rendering the form and table) with:

```tsx
<ProductManager authToken={authToken} onSessionExpired={logout} />
```

Add the import:

```tsx
import { ProductManager } from "@/components/ProductManager";
```

- [ ] **Step 3: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`

- [ ] **Step 4: Manual verification** — log into `/admin` as an admin,
  confirm product add/edit/delete still works exactly as before the
  extraction, and Orders still loads.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/ProductManager.tsx frontend/app/admin/page.tsx
git commit -m "Extract ProductManager component from admin page"
```

---

### Task 2: Admin Users tab

**Files:**
- Modify: `frontend/app/admin/page.tsx`

**Interfaces:**
- Consumes: `GET /users/`, `PATCH /users/{id}/role`,
  `PATCH /users/{id}/block` (Phase 1, Task 6).

- [ ] **Step 1: Add types, state, and handlers**

```tsx
// Add near the other type definitions
type UserSummary = {
  id: string;
  username: string;
  email: string;
  role: "customer" | "lister" | "admin";
  is_blocked: boolean;
  created_at: string;
};

const ROLES = ["customer", "lister", "admin"] as const;
```

```tsx
// Add near the other state declarations
const [users, setUsers] = useState<UserSummary[]>([]);
const [usersLoading, setUsersLoading] = useState(false);
const [usersError, setUsersError] = useState("");
const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

const loadUsers = async () => {
  setUsersLoading(true);
  setUsersError("");
  try {
    const response = await authenticatedFetch(`${API_BASE}/users/`, authToken);
    if (response.status === 401) {
      logout();
      setUsersError("Your session expired. Please log in again.");
      return;
    }
    const data = await response.json();
    if (!response.ok) {
      setUsersError(extractErrorMessage(data, "Could not load users."));
      return;
    }
    setUsers(data as UserSummary[]);
  } catch {
    setUsersError("Could not connect to the server.");
  } finally {
    setUsersLoading(false);
  }
};

const updateUserRole = async (userId: string, role: string) => {
  setUpdatingUserId(userId);
  setUsersError("");
  try {
    const response = await authenticatedFetch(`${API_BASE}/users/${userId}/role`, authToken, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await response.json();
    if (!response.ok) {
      // Covers the self-demotion 400 from the backend - surfaced here
      // rather than pre-disabled client-side (see plan's Global Constraints).
      setUsersError(extractErrorMessage(data, "Could not update role."));
      return;
    }
    setUsers((current) => current.map((user) => (user.id === userId ? (data as UserSummary) : user)));
  } catch {
    setUsersError("Could not connect to the server.");
  } finally {
    setUpdatingUserId(null);
  }
};

const updateUserBlock = async (userId: string, isBlocked: boolean) => {
  setUpdatingUserId(userId);
  setUsersError("");
  try {
    const response = await authenticatedFetch(`${API_BASE}/users/${userId}/block`, authToken, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_blocked: isBlocked }),
    });
    const data = await response.json();
    if (!response.ok) {
      setUsersError(extractErrorMessage(data, "Could not update block status."));
      return;
    }
    setUsers((current) => current.map((user) => (user.id === userId ? (data as UserSummary) : user)));
  } catch {
    setUsersError("Could not connect to the server.");
  } finally {
    setUpdatingUserId(null);
  }
};
```

Add `loadUsers();` to the admin-data-loading effect from Task 1/Step 2
if not already added.

- [ ] **Step 2: Add the Users section JSX** (after the Orders section):

```tsx
<section className="bg-white border border-neutral-200 p-6">
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-lg font-medium text-neutral-900">Users ({users.length})</h2>
    <button onClick={loadUsers} className="text-sm underline">Refresh</button>
  </div>
  {usersLoading && <p className="text-sm text-neutral-500">Loading...</p>}
  {!usersLoading && usersError && <p className="text-sm text-red-600">{usersError}</p>}
  {!usersLoading && !usersError && (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-500 border-b border-neutral-200">
            <th className="py-2 pr-4">Username</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Role</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-neutral-100">
              <td className="py-2 pr-4">{user.username}</td>
              <td className="py-2 pr-4">{user.email}</td>
              <td className="py-2 pr-4">
                <select
                  value={user.role}
                  disabled={updatingUserId === user.id}
                  onChange={(event) => updateUserRole(user.id, event.target.value)}
                  className="border border-neutral-300 px-2 py-1 text-sm disabled:opacity-60"
                >
                  {ROLES.map((roleOption) => (
                    <option key={roleOption} value={roleOption}>{roleOption}</option>
                  ))}
                </select>
              </td>
              <td className="py-2 pr-4">
                <span className={user.is_blocked ? "text-red-600 font-medium" : "text-neutral-500"}>
                  {user.is_blocked ? "Blocked" : "Active"}
                </span>
              </td>
              <td className="py-2 pr-4">
                <button
                  onClick={() => updateUserBlock(user.id, !user.is_blocked)}
                  disabled={updatingUserId === user.id}
                  className="underline disabled:opacity-60"
                >
                  {user.is_blocked ? "Unblock" : "Block"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</section>
```

- [ ] **Step 3: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`

- [ ] **Step 4: Manual verification** — as an admin, open `/admin`,
  confirm the Users table lists every user with correct role/status;
  promote a customer to `lister`, confirm the select updates and persists
  on refresh; block a user, confirm the status changes to "Blocked" and
  that user can no longer log in (per Phase 1's `test_blocked_user_cannot_log_in`
  behavior — verify this against the real login form too, not just the
  test); attempt to change your own role, confirm the inline error from
  the backend's 400 appears.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/admin/page.tsx
git commit -m "Add Users tab to admin dashboard (promote, demote, block)"
```

---

### Task 3: `/lister` dashboard page

**Files:**
- Create: `frontend/app/lister/page.tsx`

**Interfaces:**
- Consumes: `ProductManager` (Task 1), `isListerOrAdminRole` (Phase 2).

- [ ] **Step 1: Write the page** (self-contained login form, matching
  `admin/page.tsx`'s existing precedent, gated to lister-or-admin):

```tsx
// frontend/app/lister/page.tsx
"use client";

import { useState, useSyncExternalStore } from "react";
import {
  extractErrorMessage,
  getAuthServerSnapshot,
  getAuthTokenSnapshot,
  getCurrentUserSnapshot,
  getRoleServerSnapshot,
  getRoleSnapshot,
  isListerOrAdminRole,
  subscribeToStorage,
  writeAuth,
} from "@/lib/auth-store";
import { ProductManager } from "@/components/ProductManager";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const inputClass = "border border-neutral-300 px-3 py-2 text-sm w-full";

export default function ListerPage() {
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);
  const authToken = useSyncExternalStore(subscribeToStorage, getAuthTokenSnapshot, getAuthServerSnapshot);
  const role = useSyncExternalStore(subscribeToStorage, getRoleSnapshot, getRoleServerSnapshot);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const logout = () => writeAuth("", "");

  const login = async () => {
    setLoginError("");
    setLoginLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLoginError(extractErrorMessage(data, "Login failed."));
        return;
      }
      writeAuth(data.access_token, data.user.username, data.user.role ?? "customer");
      setLoginPassword("");
    } catch {
      setLoginError("Could not connect to the server.");
    } finally {
      setLoginLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
        <form
          className="w-full max-w-sm space-y-4 bg-white p-8 shadow-sm border border-neutral-200"
          onSubmit={(event) => { event.preventDefault(); login(); }}
        >
          <h1 className="text-xl font-semibold text-neutral-900">Lister login</h1>
          <input type="email" required placeholder="Email address" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} className={inputClass} />
          <input type="password" required placeholder="Password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} className={inputClass} />
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <button type="submit" disabled={loginLoading} className="w-full bg-neutral-900 text-white py-2 text-sm uppercase tracking-wide disabled:opacity-60">
            {loginLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </main>
    );
  }

  if (!isListerOrAdminRole(role)) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
        <div className="text-center space-y-4">
          <p className="text-neutral-700">Signed in as {currentUser}, but this account doesn&apos;t have lister access.</p>
          <button onClick={logout} className="underline text-sm">Log out</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-neutral-900">Thread&amp;Co lister dashboard</h1>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-neutral-500">Signed in as {currentUser}</span>
            <button onClick={logout} className="underline">Log out</button>
          </div>
        </header>
        <ProductManager authToken={authToken} onSessionExpired={logout} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`

- [ ] **Step 3: Manual verification** — promote a test account to
  `lister` via `/admin`'s Users tab, log into `/lister` with it, confirm
  product CRUD works and there's no Orders/Users section visible;
  confirm an `admin` account can also log into `/lister` successfully;
  confirm a plain `customer` account sees the "doesn't have lister
  access" message.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/lister/page.tsx
git commit -m "Add /lister dashboard page"
```

---

## Phase 4 Completion Check

- [ ] `cd frontend && npx tsc --noEmit && npm run build` — clean
- [ ] Manual verification: admin promotes a user to lister, that user
  manages products at `/lister`, admin blocks a user, blocked user
  cannot log in
- [ ] `git log --oneline -3` shows all 3 commits from this phase
