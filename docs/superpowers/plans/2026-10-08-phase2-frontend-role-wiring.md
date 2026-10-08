# Phase 2: Frontend Role Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the frontend's auth state to carry `role` (string)
instead of `isAdmin` (boolean), so `/admin` keeps working the moment
Phase 1's backend ships — this phase must land before or immediately
after Phase 1's backend deploy, never left half-done in between.

**Architecture:** Rename `auth-store.ts`'s admin-boolean snapshot
functions to role-string snapshot functions, add two pure role-check
helpers, and update the two call sites that currently read
`data.user.is_admin`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, `useSyncExternalStore`
(existing pattern — no new state library).

**Spec:** `docs/superpowers/specs/2026-10-08-site-expansion-design.md`
(section: Frontend Changes → State/logic reuse)

## Global Constraints

- No new frontend test framework is introduced (per spec's Testing
  Strategy) — verification here is `tsc --noEmit`, `npm run build`, and a
  manual login check against the Phase-1 backend.
- `/admin` continues to gate on `role === "admin"` only — Lister access
  to its own dashboard is Phase 4's concern, not this phase's.
- Keep the existing `useSyncExternalStore` pattern (server/client
  snapshot pair) for every piece of localStorage-backed state touched
  here — do not introduce `useState`+`useEffect` as a substitute.

## Review Focus

1. A browser with a stale `threadco_is_admin` key from before this
   change (old key name, now unused) must not break anything — the new
   `getRoleSnapshot` reads a different key (`threadco_role`) and simply
   won't find it, correctly defaulting to `"customer"`. No migration of
   the old localStorage key is needed since it's a key rename, not a
   value transform.
2. `/admin`'s pre-login and logged-in-but-not-admin states must still
   render their existing messages correctly with the renamed field.

---

### Task 1: Rename `auth-store.ts` admin snapshot to role snapshot

**Files:**
- Modify: `frontend/lib/auth-store.ts`

**Interfaces:**
- Produces: `getRoleSnapshot(): string`, `getRoleServerSnapshot(): string`,
  `writeAuth(token: string, user: string, role?: string): void`,
  `isAdminRole(role: string): boolean`,
  `isListerOrAdminRole(role: string): boolean` — consumed by Task 2 and
  every later phase that reads role from auth state.

- [ ] **Step 1: Replace the admin-boolean section with role-string**

```typescript
// frontend/lib/auth-store.ts
// Replace AUTH_IS_ADMIN_KEY and everything from getIsAdminSnapshot
// through the end of getIsAdminServerSnapshot with:

const AUTH_ROLE_KEY = "threadco_role";

// Separate from getAuthServerSnapshot's string default even though both
// are strings - same server/client-mismatch reasoning as the rest of
// this module, kept as its own snapshot pair so callers can subscribe to
// role changes independently of the username.
export function getRoleSnapshot(): string {
  return localStorage.getItem(AUTH_ROLE_KEY) || "customer";
}
export function getRoleServerSnapshot(): string {
  return "customer";
}

// role is client-held UX state only (which UI to show) - the backend
// re-checks the real role from the JWT on every admin/lister write
// regardless, so nothing security-relevant depends on this value being
// accurate.
export function isAdminRole(role: string): boolean {
  return role === "admin";
}
export function isListerOrAdminRole(role: string): boolean {
  return role === "admin" || role === "lister";
}
```

Then update `writeAuth`'s signature and body:

```typescript
export function writeAuth(token: string, user: string, role = "customer"): void {
  if (token && user) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, user);
    localStorage.setItem(AUTH_ROLE_KEY, role);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_ROLE_KEY);
  }
  window.dispatchEvent(new Event(STORAGE_SYNC_EVENT));
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: New errors at every call site still using
`getIsAdminSnapshot`/`getIsAdminServerSnapshot`/the old `writeAuth`
boolean argument (Task 2 fixes these) — confirms the rename is being
caught by the type checker rather than failing silently at runtime.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/auth-store.ts
git commit -m "Rename auth-store admin boolean to role string"
```

---

### Task 2: Fix `/admin` and home page call sites

**Files:**
- Modify: `frontend/app/admin/page.tsx`
- Modify: `frontend/app/page.tsx`

**Interfaces:**
- Consumes: `getRoleSnapshot`, `getRoleServerSnapshot`, `isAdminRole`,
  updated `writeAuth` (Task 1).

- [ ] **Step 1: Update `admin/page.tsx` imports and usage**

```typescript
// frontend/app/admin/page.tsx - update the import block (lines 4-14)
import {
  authenticatedFetch,
  extractErrorMessage,
  getAuthServerSnapshot,
  getAuthTokenSnapshot,
  getCurrentUserSnapshot,
  getRoleServerSnapshot,
  getRoleSnapshot,
  isAdminRole,
  subscribeToStorage,
  writeAuth,
} from "@/lib/auth-store";
```

Replace line 125:
```typescript
const role = useSyncExternalStore(subscribeToStorage, getRoleSnapshot, getRoleServerSnapshot);
```

Replace line 217 (`if (!isAdmin) return;`) with `if (!isAdminRole(role)) return;`
and update the dependency array on line 231 from `[isAdmin]` to `[role]`
(keep the existing eslint-disable comment above it — the reasoning is
unchanged, just the variable name).

Replace line 247:
```typescript
writeAuth(data.access_token, data.user.username, data.user.role ?? "customer");
```

Replace line 361 (`if (!isAdmin) {`) with `if (!isAdminRole(role)) {`.

- [ ] **Step 2: Update `page.tsx`'s equivalent call site**

Find the `writeAuth(data.access_token, data.user.username, Boolean(data.user.is_admin));`
call (around line 329) and replace with:

```typescript
writeAuth(data.access_token, data.user.username, data.user.role ?? "customer");
```

Also find wherever `page.tsx` reads `getIsAdminSnapshot`/`getIsAdminServerSnapshot`
(if it does — confirm via `grep -n "IsAdmin" frontend/app/page.tsx` before
editing, since the import list may differ from `admin/page.tsx`'s) and
apply the same rename as Task 1/Step 1 above.

- [ ] **Step 3: Type-check and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: Both succeed with no errors.

- [ ] **Step 4: Manual verification against Phase 1's backend**

With the Phase 1 backend running locally and at least one account
promoted to `role: "admin"` (via the Task 7 migration script or a direct
DB edit in local dev):
1. Visit `/admin`, log in with a non-admin account → see the "doesn't
   have admin access" message (unchanged UI, now driven by `role`).
2. Log in with the admin account → the full dashboard renders, Products
   and Orders tabs both load data.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/admin/page.tsx frontend/app/page.tsx
git commit -m "Wire admin page and login to role string instead of is_admin boolean"
```

---

## Phase 2 Completion Check

- [ ] `cd frontend && npx tsc --noEmit && npm run build` — both clean
- [ ] Manual admin-login check passes against a Phase-1 backend
- [ ] `git log --oneline -2` shows both commits from this phase
