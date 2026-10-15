import { getCartSnapshot, writeCart } from "./shop-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

// The cart lives in localStorage with the price from when the item was added,
// but the server charges the current database price. Re-read the prices so the
// total shown to the shopper is the total they will actually be charged.
// Returns true when at least one line's price changed.
export async function refreshCartPrices(): Promise<boolean> {
  const ids = [...new Set(getCartSnapshot().map((line) => line.id))];
  const prices = new Map<string, number>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const response = await fetch(`${API_BASE}/products/${encodeURIComponent(id)}`);
        if (!response.ok) return;
        const price = Number((await response.json()).price);
        if (Number.isFinite(price)) prices.set(id, price);
      } catch {
        // Offline or product gone: keep the stored price; the server still charges its own.
      }
    }),
  );
  let changed = false;
  // Re-read after the awaits so edits made while fetching are not overwritten.
  const next = getCartSnapshot().map((line) => {
    const price = prices.get(line.id);
    if (price === undefined || price === line.price) return line;
    changed = true;
    return { ...line, price };
  });
  if (changed) writeCart(next);
  return changed;
}
