import { extractErrorMessage } from "./auth-store";

export const PRODUCTS_PAGE_SIZE = 200;

export class ProductsFetchError extends Error {}

/**
 * The whole catalogue, fetched page by page. The API caps a page at
 * PRODUCTS_PAGE_SIZE; a page shorter than that is the last one. Throws
 * ProductsFetchError (with the server's message) on a non-OK response.
 */
export async function fetchAllProducts(apiBase: string): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  for (;;) {
    const response = await fetch(`${apiBase}/products/?skip=${all.length}&limit=${PRODUCTS_PAGE_SIZE}`);
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ProductsFetchError(extractErrorMessage(data, "Could not load products."));
    const page = data as Array<Record<string, unknown>>;
    all.push(...page);
    if (page.length < PRODUCTS_PAGE_SIZE) return all;
  }
}
