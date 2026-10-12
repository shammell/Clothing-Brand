import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAddToCart } from "./useAddToCart";
import type { Product } from "./shop-store";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Test Tee",
    category: "T-Shirts",
    price: 20,
    image: "/x.jpg",
    sizes: ["S", "M"],
    colors: ["Black"],
    stock: 3,
    rating: 4,
    ...overrides,
  } as Product;
}

describe("useAddToCart quantity ceiling", () => {
  it("clamps quantity to available stock", () => {
    const { result } = renderHook(() => useAddToCart());
    const product = makeProduct({ stock: 3 });
    act(() => result.current.setQuantity(product, 10));
    expect(result.current.getSelection(product).quantity).toBe(3);
  });

  it("clamps quantity to at least 1", () => {
    const { result } = renderHook(() => useAddToCart());
    const product = makeProduct({ stock: 3 });
    act(() => result.current.setQuantity(product, 0));
    expect(result.current.getSelection(product).quantity).toBe(1);
  });

  it("caps at MAX_QUANTITY (20) when stock is 0 (treated as unlimited)", () => {
    const { result } = renderHook(() => useAddToCart());
    const product = makeProduct({ stock: 0 });
    act(() => result.current.setQuantity(product, 999));
    expect(result.current.getSelection(product).quantity).toBe(20);
  });
});
