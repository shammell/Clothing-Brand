// Turns a 429 into a sentence a shopper can act on. Retry-After is the length of
// the window that was exceeded, so a daily cap reads as "come back later".
export function rateLimitMessage(response: Response, feature: string): string {
  const seconds = Number(response.headers.get("Retry-After"));
  if (!Number.isFinite(seconds) || seconds <= 0) return `You're going a little fast. Please wait a moment and try again.`;
  if (seconds >= 3600) return `${feature} has reached its limit for now. Please try again later today or tomorrow.`;
  if (seconds <= 90) return `You're going a little fast. Please wait about a minute and try again.`;
  return `${feature} is busy. Please wait ${Math.ceil(seconds / 60)} minutes and try again.`;
}
