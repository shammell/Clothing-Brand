import type { Product } from "./shop-store";

// In-memory only. Filled whenever a page loads products so the product page
// can render its image in the same commit as the navigation (needed for the
// shared-element morph), then refetches in the background for fresh stock.
const cache = new Map<string, Product>();

export function cacheProducts(products: Product[]): void {
  products.forEach((product) => cache.set(product.id, product));
}

export function getCachedProduct(id: string | undefined): Product | null {
  return (id && cache.get(id)) || null;
}

export function clearProductCache(): void {
  cache.clear();
}
