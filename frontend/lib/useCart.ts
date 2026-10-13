"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { getAuthServerSnapshot, getCurrentUserSnapshot, subscribeToStorage } from "./auth-store";
import { type CartLine, getCartServerSnapshot, getCartSnapshot, writeCart } from "./shop-store";
import { variantStock } from "./variants";

const MAX_QUANTITY = 20;

// Ceiling must distinguish "known stock of exactly 0" from "stock unknown":
// `line.stock && line.stock > 0` treats 0 as falsy and falls through to the
// 20 fallback, which would let an out-of-stock line's quantity climb to 20.
// Computing the ceiling first (capped at 20 same as the quantity selector in
// lib/useAddToCart.ts, but only when stock is a known number - 20 outright
// when stock is genuinely unspecified) and then checking the capped result
// against <=0 means a 0-stock line always routes through removal instead of
// ever being written with a quantity of 0. The line's own variant stock wins
// over the product total when the line carries variant data.
export function lineCeiling(line: CartLine): number {
  const variant = variantStock(line, line.size, line.color);
  const known = variant ?? (typeof line.stock === "number" ? line.stock : undefined);
  return known === undefined ? MAX_QUANTITY : Math.min(known, MAX_QUANTITY);
}

// One implementation of bag mutations, shared by /cart and the side drawer.
export function useCart() {
  const router = useRouter();
  const cart = useSyncExternalStore(subscribeToStorage, getCartSnapshot, getCartServerSnapshot);
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);

  const removeFromCart = (index: number) => {
    writeCart(cart.filter((_, cartIndex) => cartIndex !== index));
  };

  const updateCartQuantity = (index: number, delta: number) => {
    const line = cart[index];
    if (!line) return;
    const nextQuantity = Math.min(line.quantity + delta, lineCeiling(line));
    if (nextQuantity <= 0) {
      removeFromCart(index);
      return;
    }
    writeCart(cart.map((item, cartIndex) => (cartIndex === index ? { ...item, quantity: nextQuantity } : item)));
  };

  const goToCheckout = () => {
    router.push(currentUser ? "/checkout" : "/login?next=/checkout");
  };

  return {
    cart,
    cartTotal: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
    removeFromCart,
    updateCartQuantity,
    goToCheckout,
  };
}
