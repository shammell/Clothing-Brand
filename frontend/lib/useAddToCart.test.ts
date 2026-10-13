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

describe("useAddToCart variant ceiling", () => {
  const variants = [
    { size: "S", color: "Black", stock: 2 },
    { size: "M", color: "Black", stock: 0 },
    { size: "S", color: "White", stock: 8 },
    { size: "M", color: "White", stock: 8 },
  ];
  const variantProduct = () => makeProduct({ stock: 18, colors: ["Black", "White"], variants });

  it("clamps quantity to the selected variant's stock", () => {
    const { result } = renderHook(() => useAddToCart());
    const product = variantProduct();
    act(() => result.current.selectSize(product, "S"));
    act(() => result.current.setQuantity(product, 10));
    expect(result.current.getSelection(product).quantity).toBe(2);
  });

  it("re-clamps quantity when the variant changes", () => {
    const { result } = renderHook(() => useAddToCart());
    const product = variantProduct();
    act(() => result.current.selectColor(product, "White"));
    act(() => result.current.selectSize(product, "S"));
    act(() => result.current.setQuantity(product, 8));
    act(() => result.current.selectColor(product, "Black"));
    expect(result.current.getSelection(product).quantity).toBe(2);
  });

  it("refuses to add a sold-out variant and flags it", () => {
    localStorage.clear();
    const { result } = renderHook(() => useAddToCart());
    const product = variantProduct();
    act(() => result.current.selectSize(product, "M"));
    act(() => result.current.addToCart(product));
    expect(result.current.variantErrors[product.id]).toBe(true);
    expect(localStorage.getItem("threadco_cart")).toBeNull();
  });

  it("defaults to the first colour that has stock", () => {
    const { result } = renderHook(() => useAddToCart());
    const product = makeProduct({
      colors: ["Black", "White"],
      variants: [
        { size: "S", color: "Black", stock: 0 },
        { size: "S", color: "White", stock: 3 },
      ],
    });
    expect(result.current.getSelection(product).color).toBe("White");
  });

  it("legacy products without variants keep the product-level ceiling", () => {
    const { result } = renderHook(() => useAddToCart());
    const product = makeProduct({ stock: 4 });
    act(() => result.current.selectSize(product, "S"));
    act(() => result.current.setQuantity(product, 10));
    expect(result.current.getSelection(product).quantity).toBe(4);
  });
});
