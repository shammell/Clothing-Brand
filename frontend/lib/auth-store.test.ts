import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedFetch, getAuthTokenSnapshot, writeAuth } from "./auth-store";

describe("authenticatedFetch", () => {
  beforeEach(() => {
    localStorage.clear();
    writeAuth("tok", "jane", "customer");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends the bearer token and keeps the login on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await authenticatedFetch("/x", "tok");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
    expect(getAuthTokenSnapshot()).toBe("tok");
  });

  it("clears the stale login on 401 so every page sees the user as signed out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    const response = await authenticatedFetch("/x", "tok");
    expect(response.status).toBe(401);
    expect(getAuthTokenSnapshot()).toBe("");
    expect(localStorage.getItem("threadco_user")).toBeNull();
  });

  it("does not touch auth state on other errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 })));
    await authenticatedFetch("/x", "tok");
    expect(getAuthTokenSnapshot()).toBe("tok");
  });
});
