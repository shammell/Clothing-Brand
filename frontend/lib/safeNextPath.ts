// Guards the `?next=` redirect target read from the URL after login/register.
// Without this, an attacker-crafted link (?next=https://evil.com or
// ?next=//evil.com) would send a user straight from a real login form to an
// external site post-auth - a classic open-redirect phishing vector. Only a
// same-origin path starting with a single "/" (never "//", which browsers
// resolve as a protocol-relative URL to a different host) is accepted;
// anything else falls back to the safe default.
export function safeNextPath(value: string | null): string {
  if (!value) return "/account";
  // The URL spec (and every browser) silently strips ASCII tab/CR/LF when
  // resolving a URL, so "/\t/evil.com" would pass a naive check against the
  // raw string below but still resolve as "//evil.com" (protocol-relative)
  // once the router actually navigates - strip them first so validation
  // happens against the same string that will actually be acted on.
  const cleaned = value.replace(/[\t\r\n]+/g, "");
  if (cleaned === "/" || /^\/[^/\\]/.test(cleaned)) return cleaned;
  return "/account";
}
