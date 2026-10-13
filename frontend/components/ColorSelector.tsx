"use client";

import type { Product } from "@/lib/shop-store";

type Props = {
  product: Product;
  value: string;
  onSelect: (color: string) => void;
  variant?: "compact" | "full";
};

// A colour with no stock in any size gets a diagonal line through it.
function colorSoldOut(product: Product, color: string): boolean {
  if (!product.variants?.length) return false;
  return !product.variants.some((v) => v.color === color && v.stock > 0);
}

export function ColorSelector({ product, value, onSelect, variant = "compact" }: Props) {
  return (
    <>
      <span role="radiogroup" aria-label="Color" className={`swatches swatches-${variant}`}>
        {product.colors.map((color) => {
          const soldOut = colorSoldOut(product, color);
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={value === color}
              aria-label={soldOut ? `${color}, sold out` : color}
              title={soldOut ? `${color} is sold out` : color}
              className={`swatch swatch-${variant}${value === color ? " active" : ""}${soldOut ? " sold-out" : ""}`}
              style={{ backgroundColor: color }}
              onClick={() => onSelect(color)}
            />
          );
        })}
      </span>
      {variant === "full" && <span className="swatch-name">{value}</span>}
    </>
  );
}
