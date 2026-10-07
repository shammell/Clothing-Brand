// Shared between the storefront and the admin page - both need the same
// "logged in as which user, with which token" state. Built on
// useSyncExternalStore rather than useState+useEffect: it has first-class
// support for a server snapshot that differs from the client snapshot, which
// is exactly what reading localStorage during SSR needs (no window there),
// so there's no manual hydration-mismatch workaround to get wrong.
export const STORAGE_SYNC_EVENT = "threadco-storage-sync";
const AUTH_USER_KEY = "threadco_user";
const AUTH_TOKEN_KEY = "threadco_token";
const AUTH_IS_ADMIN_KEY = "threadco_is_admin";

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

// Separate from getAuthServerSnapshot's string default since this snapshot
// is a boolean - same server/client-mismatch reasoning as the rest of this
// module, just a different value type.
export function getIsAdminSnapshot(): boolean {
  return localStorage.getItem(AUTH_IS_ADMIN_KEY) === "true";
}
export function getIsAdminServerSnapshot(): boolean {
  return false;
}

// isAdmin is client-held UX state only (which UI to show) - the backend
// re-checks the real role from the JWT on every admin write regardless, so
// nothing security-relevant depends on this flag being accurate.
export function writeAuth(token: string, user: string, isAdmin = false): void {
  if (token && user) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, user);
    localStorage.setItem(AUTH_IS_ADMIN_KEY, String(isAdmin));
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_IS_ADMIN_KEY);
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
