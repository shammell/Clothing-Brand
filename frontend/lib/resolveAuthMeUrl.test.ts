import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAuthMeUrl } from "./resolveAuthMeUrl";

describe("resolveAuthMeUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses NEXT_PUBLIC_API_URL when it's an absolute URL", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:8003");
    expect(resolveAuthMeUrl()).toBe("http://localhost:8003/auth/me");
  });

  it("falls back to VERCEL_URL (trusted, not request-derived) when NEXT_PUBLIC_API_URL is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("VERCEL_URL", "clothing-store-tan-nu.vercel.app");
    expect(resolveAuthMeUrl()).toBe("https://clothing-store-tan-nu.vercel.app/api/auth/me");
  });

  it("falls back to the local backend default when neither is set", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    expect(resolveAuthMeUrl()).toBe("http://127.0.0.1:8003/auth/me");
  });
});
