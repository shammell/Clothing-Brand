// Guards the `?next=` redirect target read from the URL after login/register.
// Without this, an attacker-crafted link (?next=https://evil.com or
// ?next=//evil.com) would send a user straight from a real login form to an
// external site post-auth - a classic open-redirect phishing vector. Only a
// same-origin path starting with a single "/" (never "//", which browsers
// resolve as a protocol-relative URL to a different host) is accepted;
// anything else falls back to the safe default.
export function safeNextPath(value: string | null): string {
  if (!value) return "/account";
  if (value === "/" || /^\/[^/\\]/.test(value)) return value;
  return "/account";
}
