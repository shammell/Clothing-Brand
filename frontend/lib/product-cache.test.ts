import { beforeEach, describe, expect, it } from "vitest";
import { cacheProducts, clearProductCache, getCachedProduct } from "./product-cache";
import type { Product } from "./shop-store";

const product = { id: "p1", name: "Tee", category: "T", price: 1, rating: 1, image: "/x", sizes: [], colors: [] } as Product;

describe("product cache", () => {
  beforeEach(() => clearProductCache());

  it("returns seeded products by id and null otherwise", () => {
    cacheProducts([product]);
    expect(getCachedProduct("p1")).toBe(product);
    expect(getCachedProduct("nope")).toBeNull();
    expect(getCachedProduct(undefined)).toBeNull();
  });
});
