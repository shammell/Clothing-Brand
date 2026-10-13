"use client";

import { useEffect, useRef, useState } from "react";
import { type CartLine, type Product, getCartSnapshot, writeCart } from "./shop-store";
import { firstAvailableColor, variantStock } from "./variants";

// Deliberate, brief pacing for the "Add to bag" button's adding -> added
// transition - the cart write itself is synchronous (local state, no network
// round trip), but an instant jump from "Add to bag" straight to "Added"
// reads as no feedback at all. This is purely a perceived-affordance delay,
// not masking any real async work.
const ADD_FEEDBACK_ADDING_MS = 350;
const ADD_FEEDBACK_ADDED_MS = 1100;
const MAX_QUANTITY = 20;

type Selection = { size: string; color: string; quantity: number };

// A selected variant's own stock wins; products without variant data keep the
// old product-level ceiling.
function quantityCeiling(product: Product, selection: Pick<Selection, "size" | "color">): number {
  const variant = selection.size ? variantStock(product, selection.size, selection.color) : undefined;
  if (variant !== undefined) return Math.min(Math.max(variant, 1), MAX_QUANTITY);
  return product.stock && product.stock > 0 ? Math.min(product.stock, MAX_QUANTITY) : MAX_QUANTITY;
}

// Shared by the product grid and the product detail page - both need
// identical size/color/quantity selection and add-to-cart-with-feedback
// behavior, and duplicating this (timeouts, merge-on-add logic, etc.) across
// two components would be the exact kind of drift-prone copy this is meant
// to avoid.
export function useAddToCart() {
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [sizeErrors, setSizeErrors] = useState<Record<string, boolean>>({});
  const [variantErrors, setVariantErrors] = useState<Record<string, boolean>>({});
  const [addStatus, setAddStatus] = useState<Record<string, "adding" | "added">>({});
  const addTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});

  useEffect(() => {
    // Capture the ref's container (not the ref itself) so cleanup still has
    // a real object to iterate, even though addTimeoutsRef.current may have
    // been mutated further by the time this runs.
    const timeoutsByProduct = addTimeoutsRef.current;
    return () => {
      Object.values(timeoutsByProduct).flat().forEach((id) => clearTimeout(id));
    };
  }, []);

  const getSelection = (product: Product): Selection =>
    selections[product.id] ?? { size: "", color: firstAvailableColor(product), quantity: 1 };

  // Changing size or color can lower the ceiling, so re-clamp the quantity.
  const changeVariant = (product: Product, change: Partial<Pick<Selection, "size" | "color">>) => {
    const next = { ...getSelection(product), ...change };
    next.quantity = Math.min(next.quantity, quantityCeiling(product, next));
    setSelections((current) => ({ ...current, [product.id]: next }));
    setVariantErrors((current) => ({ ...current, [product.id]: false }));
  };

  const selectSize = (product: Product, size: string) => {
    changeVariant(product, { size });
    setSizeErrors((current) => ({ ...current, [product.id]: false }));
  };

  const selectColor = (product: Product, color: string) => {
    changeVariant(product, { color });
  };

  const setQuantity = (product: Product, quantity: number) => {
    const ceiling = quantityCeiling(product, getSelection(product));
    const clamped = Math.min(Math.max(1, Math.trunc(quantity) || 1), ceiling);
    setSelections((current) => ({ ...current, [product.id]: { ...getSelection(product), quantity: clamped } }));
  };

  const addToCart = (product: Product) => {
    const selection = getSelection(product);
    if (!selection.size) {
      setSizeErrors((current) => ({ ...current, [product.id]: true }));
      return;
    }
    if (variantStock(product, selection.size, selection.color) === 0) {
      setVariantErrors((current) => ({ ...current, [product.id]: true }));
      return;
    }
    const ceiling = quantityCeiling(product, selection);
    // Read fresh from storage rather than closing over a `cart` value from
    // render scope - this runs from an event handler, and another component
    // (e.g. the product grid and the detail page mounted at the same time)
    // could have written a newer cart state since this component last
    // rendered.
    const currentCart = getCartSnapshot();
    const existingIndex = currentCart.findIndex(
      (line) => line.id === product.id && line.size === selection.size && line.color === selection.color,
    );
    const nextCart: CartLine[] =
      existingIndex >= 0
        ? currentCart.map((line, index) =>
            index === existingIndex ? { ...line, quantity: Math.min(line.quantity + selection.quantity, ceiling) } : line,
          )
        : [...currentCart, { ...product, size: selection.size, color: selection.color, quantity: selection.quantity }];
    writeCart(nextCart);

    // Clear-before-set: if this product was already mid-cycle from a
    // previous click, cancel those pending timeouts first so rapid re-clicks
    // restart a clean idle->adding->added sequence instead of two
    // overlapping cycles racing to update addStatus out of order.
    (addTimeoutsRef.current[product.id] ?? []).forEach((id) => clearTimeout(id));
    setAddStatus((current) => ({ ...current, [product.id]: "adding" }));
    const addedTimeout = setTimeout(() => {
      setAddStatus((current) => ({ ...current, [product.id]: "added" }));
      const idleTimeout = setTimeout(() => {
        setAddStatus((current) => {
          const next = { ...current };
          delete next[product.id];
          return next;
        });
      }, ADD_FEEDBACK_ADDED_MS);
      addTimeoutsRef.current[product.id] = [idleTimeout];
    }, ADD_FEEDBACK_ADDING_MS);
    addTimeoutsRef.current[product.id] = [addedTimeout];
  };

  return { getSelection, selectSize, selectColor, setQuantity, addToCart, addStatus, sizeErrors, variantErrors };
}
