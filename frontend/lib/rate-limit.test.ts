import { describe, expect, it } from "vitest";
import { rateLimitMessage } from "./rate-limit";

const res = (retryAfter?: string) => new Response(null, { status: 429, headers: retryAfter ? { "Retry-After": retryAfter } : {} });

describe("rateLimitMessage", () => {
  it("asks for a short wait on a per-minute limit", () => {
    expect(rateLimitMessage(res("60"), "Photo search")).toMatch(/about a minute/);
  });
  it("says to come back later on a daily cap", () => {
    expect(rateLimitMessage(res("86400"), "Photo search")).toMatch(/Photo search has reached its limit/);
  });
  it("falls back to a generic wait without a usable header", () => {
    expect(rateLimitMessage(res(), "Photo search")).toMatch(/a little fast/);
    expect(rateLimitMessage(res("soon"), "Photo search")).toMatch(/a little fast/);
  });
  it("names minutes for mid-length windows", () => {
    expect(rateLimitMessage(res("600"), "The style assistant")).toMatch(/10 minutes/);
  });
});
