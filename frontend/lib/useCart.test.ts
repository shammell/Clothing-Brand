import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { useCart } from "./useCart";
import { type CartLine, getCartSnapshot, writeCart } from "./shop-store";

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: "p1", name: "Tee", category: "T", price: 10, rating: 4, image: "/x",
    colors: ["Black"], sizes: ["S"], size: "S", color: "Black", quantity: 1, stock: 3,
    ...overrides,
  };
}

describe("useCart", () => {
  beforeEach(() => {
    localStorage.clear();
    push.mockClear();
  });

  it("increments up to the stock ceiling", () => {
    writeCart([line({ quantity: 2 })]);
    const { result } = renderHook(() => useCart());
    act(() => result.current.updateCartQuantity(0, 5));
    expect(getCartSnapshot()[0].quantity).toBe(3);
  });

  it("uses the line's variant stock when present", () => {
    writeCart([line({ stock: 50, variants: [{ size: "S", color: "Black", stock: 2 }] })]);
    const { result } = renderHook(() => useCart());
    act(() => result.current.updateCartQuantity(0, 10));
    expect(getCartSnapshot()[0].quantity).toBe(2);
  });

  it("removes the line when decremented to zero", () => {
    writeCart([line()]);
    const { result } = renderHook(() => useCart());
    act(() => result.current.updateCartQuantity(0, -1));
    expect(getCartSnapshot()).toHaveLength(0);
  });

  it("routes a zero-stock line to removal instead of writing quantity 0", () => {
    writeCart([line({ stock: 0 })]);
    const { result } = renderHook(() => useCart());
    act(() => result.current.updateCartQuantity(0, 1));
    expect(getCartSnapshot()).toHaveLength(0);
  });

  it("totals the bag and sends signed-out shoppers to login", () => {
    writeCart([line({ quantity: 2, price: 10 }), line({ id: "p2", quantity: 1, price: 5 })]);
    const { result } = renderHook(() => useCart());
    expect(result.current.cartTotal).toBe(25);
    expect(result.current.cartCount).toBe(3);
    act(() => result.current.goToCheckout());
    expect(push).toHaveBeenCalledWith("/login?next=/checkout");
  });
});
