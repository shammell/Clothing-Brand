import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshCartPrices } from "./refreshCartPrices";
import { getCartSnapshot, writeCart, type CartLine } from "./shop-store";

const line = (id: string, price: number): CartLine => ({
  id, name: id, category: "T-Shirts", price, rating: 0, image: "/x", colors: ["Black"], sizes: ["S"],
  size: "S", color: "Black", quantity: 1,
});

describe("refreshCartPrices", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("replaces a stale cart price with the current server price", async () => {
    writeCart([line("a", 10), line("b", 5)]);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true, json: async () => ({ price: url.endsWith("/a") ? 25 : 5 }),
    })));
    expect(await refreshCartPrices()).toBe(true);
    expect(getCartSnapshot().map((l) => l.price)).toEqual([25, 5]);
  });

  it("keeps stored prices when the server cannot be reached", async () => {
    writeCart([line("a", 10)]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await refreshCartPrices()).toBe(false);
    expect(getCartSnapshot()[0].price).toBe(10);
  });
});
