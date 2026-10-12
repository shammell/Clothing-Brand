// Never derive this from the incoming request's URL/Host header - a Route
// Handler's `request.url` reflects whatever Host the caller sent, and an
// attacker who sends a direct request with a forged Host could redirect
// this authorization check (and the bearer token sent with it) to a
// server they control, bypassing the real backend's role check entirely.
// Only trusted, server-controlled sources are used: the same
// NEXT_PUBLIC_API_URL convention every other page already reads, or
// Vercel's own VERCEL_URL env var (set by the platform, never by the
// client).
export function resolveAuthMeUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured && configured.startsWith("http")) {
    return `${configured}/auth/me`;
  }
  const deploymentHost = process.env.VERCEL_URL;
  if (deploymentHost) {
    return `https://${deploymentHost}/api/auth/me`;
  }
  return "http://127.0.0.1:8003/auth/me";
}
