"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { Product } from "@/lib/shop-store";
import { sizeAvailability, variantStock } from "@/lib/variants";

type Props = {
  product: Product;
  color: string;
  value: string;
  onSelect: (size: string) => void;
  variant?: "compact" | "full";
  showError?: boolean;
  // Size to flag with a "Recommended" marker (from Find my size).
  recommendedSize?: string | null;
};

export function SizeSelector({ product, color, value, onSelect, variant = "full", showError = false, recommendedSize = null }: Props) {
  const availability = sizeAvailability(product, color);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [soldOutSize, setSoldOutSize] = useState<string | null>(null);
  const selectedIndex = product.sizes.indexOf(value);
  const tabIndex = focusIndex ?? (selectedIndex >= 0 ? selectedIndex : 0);

  const move = (event: KeyboardEvent, from: number) => {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !backward) return;
    event.preventDefault();
    const next = (from + (forward ? 1 : -1) + product.sizes.length) % product.sizes.length;
    setFocusIndex(next);
    buttons.current[next]?.focus();
    // Native radio behaviour: arrowing onto a size selects it.
    choose(product.sizes[next]);
  };

  function choose(size: string) {
    if (availability[size] === "sold_out") {
      setSoldOutSize(size);
      return;
    }
    setSoldOutSize(null);
    onSelect(size);
  }

  // Colours that still have the sold-out size, for the inline note.
  const colorsWithSize = (size: string) =>
    product.colors.filter((candidate) => (variantStock(product, size, candidate) ?? 0) > 0);

  const selectedStock = value ? variantStock(product, value, color) : undefined;
  const lowStockCaption =
    variant === "full" && value && availability[value] === "low" && selectedStock !== undefined
      ? `Only ${selectedStock} left`
      : null;

  return (
    <>
      <div
        role="radiogroup"
        aria-label="Size"
        className={`size-row size-row-${variant}${showError ? " shake" : ""}`}
      >
        {product.sizes.map((size, index) => {
          const state = availability[size];
          const soldOut = state === "sold_out";
          const classes = ["size-chip", `size-chip-${variant}`];
          if (value === size) classes.push("active");
          if (soldOut) classes.push("sold-out");
          return (
            <button
              key={size}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={value === size}
              aria-disabled={soldOut || undefined}
              aria-label={`${size}${soldOut ? ", sold out" : state === "low" ? ", low stock" : ""}${recommendedSize === size ? ", recommended" : ""}`}
              title={soldOut ? `${size} is sold out in ${color}` : undefined}
              tabIndex={index === tabIndex ? 0 : -1}
              className={classes.join(" ")}
              onClick={() => choose(size)}
              onFocus={() => setFocusIndex(index)}
              onKeyDown={(event) => move(event, index)}
            >
              {size}
              {recommendedSize === size && variant === "full" && <em className="rec-mark">Recommended</em>}
              {state === "low" && variant === "compact" && <i className="low-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {lowStockCaption && <p className="size-low">{lowStockCaption}</p>}
      {variant === "full" && soldOutSize && (
        <p className="size-note" role="status">
          Sold out in {color}.
          {colorsWithSize(soldOutSize).length > 0 && ` Size ${soldOutSize} is available in ${colorsWithSize(soldOutSize).join(", ")}.`}
        </p>
      )}
    </>
  );
}
