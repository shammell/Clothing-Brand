import { STORAGE_SYNC_EVENT } from "./auth-store";

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  rating: number;
  image: string;
  colors: string[];
  sizes: string[];
  badge?: string;
  description?: string;
  brand?: string;
  stock?: number;
};

export type CartLine = Product & { size: string; color: string; quantity: number };

export const FALLBACK_IMAGE = "/products/no-image.svg";

export function resolveImageUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return FALLBACK_IMAGE;
  const imageUrl = value.trim();
  if (imageUrl.startsWith("/") || /^https?:\/\//i.test(imageUrl)) return imageUrl;
  return FALLBACK_IMAGE;
}

export function productFromApi(item: Record<string, unknown>): Product {
  return {
    id: String(item.id),
    name: String(item.name),
    category: String(item.category),
    price: Number(item.price),
    rating: Number(item.rating ?? 0),
    image: resolveImageUrl(item.image_url),
    colors: Array.isArray(item.colors) ? item.colors.map(String) : [],
    sizes: Array.isArray(item.sizes) ? item.sizes.map(String) : [],
    description: typeof item.description === "string" ? item.description : undefined,
    brand: typeof item.brand === "string" ? item.brand : undefined,
    stock: typeof item.stock === "number" ? item.stock : undefined,
  };
}

// Wishlist and cart both use useSyncExternalStore rather than useState: both
// render into always-visible UI (heart icons, the cart badge), so each needs
// a server-safe default and a post-hydration real value with no mismatch in
// between - and both should survive a reload rather than vanishing the
// moment the customer refreshes.
const WISHLIST_STORAGE_KEY = "threadco_wishlist";
const EMPTY_WISHLIST: string[] = [];

// getSnapshot must return the same array reference when the underlying data
// hasn't changed, or React treats every call as "changed" and re-renders in
// a loop - so the parsed array is cached and only re-parsed when the raw
// stored string actually differs from last time.
let wishlistCache: { raw: string | null; value: string[] } = { raw: null, value: EMPTY_WISHLIST };

export function getWishlistSnapshot(): string[] {
  const raw = localStorage.getItem(WISHLIST_STORAGE_KEY);
  if (raw === wishlistCache.raw) return wishlistCache.value;
  let value: string[] = EMPTY_WISHLIST;
  try {
    const parsed = JSON.parse(raw ?? "null");
    if (Array.isArray(parsed)) value = parsed.filter((id): id is string => typeof id === "string");
  } catch {
    value = EMPTY_WISHLIST;
  }
  wishlistCache = { raw, value };
  return value;
}
export function getWishlistServerSnapshot(): string[] {
  return EMPTY_WISHLIST;
}

export function writeWishlist(next: string[]): void {
  localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(STORAGE_SYNC_EVENT));
}

export function toggleWishlist(wishlist: string[], productId: string): void {
  const next = wishlist.includes(productId)
    ? wishlist.filter((id) => id !== productId)
    : [...wishlist, productId];
  writeWishlist(next);
}

const CART_STORAGE_KEY = "threadco_cart";
const EMPTY_CART: CartLine[] = [];

function isValidCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.category === "string" &&
    typeof record.price === "number" &&
    typeof record.rating === "number" &&
    typeof record.image === "string" &&
    Array.isArray(record.colors) &&
    Array.isArray(record.sizes) &&
    typeof record.size === "string" &&
    typeof record.color === "string" &&
    typeof record.quantity === "number" &&
    record.quantity > 0
  );
}

let cartCache: { raw: string | null; value: CartLine[] } = { raw: null, value: EMPTY_CART };

export function getCartSnapshot(): CartLine[] {
  const raw = localStorage.getItem(CART_STORAGE_KEY);
  if (raw === cartCache.raw) return cartCache.value;
  let value: CartLine[] = EMPTY_CART;
  try {
    const parsed = JSON.parse(raw ?? "null");
    if (Array.isArray(parsed)) value = parsed.filter(isValidCartLine);
  } catch {
    value = EMPTY_CART;
  }
  cartCache = { raw, value };
  return value;
}
export function getCartServerSnapshot(): CartLine[] {
  return EMPTY_CART;
}

export function writeCart(next: CartLine[]): void {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(STORAGE_SYNC_EVENT));
}
