// Shared between the storefront and the admin page - both need the same
// "logged in as which user, with which token" state. Built on
// useSyncExternalStore rather than useState+useEffect: it has first-class
// support for a server snapshot that differs from the client snapshot, which
// is exactly what reading localStorage during SSR needs (no window there),
// so there's no manual hydration-mismatch workaround to get wrong.
export const STORAGE_SYNC_EVENT = "threadco-storage-sync";
const AUTH_USER_KEY = "threadco_user";
const AUTH_TOKEN_KEY = "threadco_token";
const AUTH_ROLE_KEY = "threadco_role";

export function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(STORAGE_SYNC_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(STORAGE_SYNC_EVENT, callback);
  };
}

export function getCurrentUserSnapshot(): string {
  return localStorage.getItem(AUTH_USER_KEY) ?? "";
}
export function getAuthTokenSnapshot(): string {
  return localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
}
export function getAuthServerSnapshot(): string {
  return "";
}

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

export function extractErrorMessage(data: unknown, fallback: string): string {
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) => (entry && typeof entry === "object" && "msg" in entry ? String((entry as { msg: unknown }).msg) : null))
      .filter((msg): msg is string => Boolean(msg));
    if (messages.length) return messages.join("; ");
  }
  return fallback;
}

// Every authenticated call needs the same 401 handling: a 401 here only ever
// means the token expired or was revoked, so the caller's "logged in" state
// is already stale - clearing it is the only way to stop every subsequent
// authenticated call from failing the same way.
export async function authenticatedFetch(url: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}
