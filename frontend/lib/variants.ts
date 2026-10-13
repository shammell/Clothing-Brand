import type { Product } from "./shop-store";

export type Availability = "in_stock" | "low" | "sold_out";

export const LOW_STOCK_THRESHOLD = 5;

// undefined means "unknown": the product has no variant data (legacy), so
// callers must fall back to today's behaviour instead of treating it as sold out.
export function variantStock(product: Product, size: string, color: string): number | undefined {
  if (!product.variants?.length) return undefined;
  return product.variants.find((v) => v.size === size && v.color === color)?.stock ?? 0;
}

function toAvailability(stock: number): Availability {
  if (stock <= 0) return "sold_out";
  return stock < LOW_STOCK_THRESHOLD ? "low" : "in_stock";
}

export function sizeAvailability(product: Product, color: string): Record<string, Availability> {
  return Object.fromEntries(
    product.sizes.map((size) => {
      const stock = variantStock(product, size, color);
      return [size, stock === undefined ? "in_stock" : toAvailability(stock)];
    }),
  );
}

export function firstAvailableColor(product: Product): string {
  if (!product.variants?.length) return product.colors[0] ?? "";
  const available = product.colors.find((color) => product.variants!.some((v) => v.color === color && v.stock > 0));
  return available ?? product.colors[0] ?? "";
}
