import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllProducts, PRODUCTS_PAGE_SIZE, ProductsFetchError } from "./fetchAllProducts";

const page = (count: number, start = 0) => Array.from({ length: count }, (_, i) => ({ id: String(start + i) }));
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("fetchAllProducts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps fetching until a short page, so catalogues over one page are complete", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(page(PRODUCTS_PAGE_SIZE)))
      .mockResolvedValueOnce(ok(page(PRODUCTS_PAGE_SIZE, PRODUCTS_PAGE_SIZE)))
      .mockResolvedValueOnce(ok(page(7, PRODUCTS_PAGE_SIZE * 2)));
    vi.stubGlobal("fetch", fetchMock);
    const all = await fetchAllProducts("/api");
    expect(all).toHaveLength(PRODUCTS_PAGE_SIZE * 2 + 7);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `/api/products/?skip=0&limit=${PRODUCTS_PAGE_SIZE}`,
      `/api/products/?skip=${PRODUCTS_PAGE_SIZE}&limit=${PRODUCTS_PAGE_SIZE}`,
      `/api/products/?skip=${PRODUCTS_PAGE_SIZE * 2}&limit=${PRODUCTS_PAGE_SIZE}`,
    ]);
  });

  it("does one request for a small catalogue", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ok(page(3)));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchAllProducts("/api")).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws the server message on a failed response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ detail: "Boom" }), { status: 500 })));
    await expect(fetchAllProducts("/api")).rejects.toThrow(ProductsFetchError);
    await expect(fetchAllProducts("/api")).rejects.toThrow("Boom");
  });
});
