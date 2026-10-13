// frontend/app/shop/page.tsx
"use client";

import { useDeferredValue, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { ViewTransition } from "@/components/ViewTransition";
import { ProductCard } from "@/components/ProductCard";
import { SiteFooter } from "@/components/SiteFooter";
import { subscribeToStorage } from "@/lib/auth-store";
import {
  type Product,
  getWishlistServerSnapshot,
  getWishlistSnapshot,
  productFromApi,
  toggleWishlist,
} from "@/lib/shop-store";
import { cacheProducts } from "@/lib/product-cache";
import { useAddToCart } from "@/lib/useAddToCart";
import { ProductGridSkeleton } from "@/components/Skeletons";


const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const CATEGORIES = ["All", "T-Shirts", "Jeans", "Dresses", "Hoodies", "Shoes", "Shirts"];

export default function ShopPage() {
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [, startTransition] = useTransition();
  const wishlist = useSyncExternalStore(subscribeToStorage, getWishlistSnapshot, getWishlistServerSnapshot);
  const addToCartApi = useAddToCart();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError("");
    fetch(`${API_BASE}/products/`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Products unavailable"))))
      .then((data: Array<Record<string, unknown>>) => {
        const loaded = data.map(productFromApi);
        cacheProducts(loaded);
        setCatalog(loaded);
      })
      .catch(() => setLoadError("Products unavailable."))
      .finally(() => setLoading(false));
  }, []);

  const filteredProducts = useMemo(
    () =>
      catalog.filter(
        (product) =>
          (activeCategory === "All" || product.category === activeCategory) &&
          product.name.toLowerCase().includes(deferredQuery.toLowerCase()),
      ),
    [activeCategory, deferredQuery, catalog],
  );

  return (
    <main className="store-shell">

      <section className="category-strip">
        <label className="search-box">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products..." />
        </label>
        <div className="category-list">
          {CATEGORIES.map((category) => (
            <button
              className={activeCategory === category ? "category active interactive" : "category interactive"}
              key={category}
              onClick={() => startTransition(() => setActiveCategory(category))}
            >
              {category}
            </button>
          ))}
        </div>
      </section>

      <section className="products-section">
        <div className="section-heading">
          <div><p className="eyebrow">FULL COLLECTION</p><h2>Shop everything</h2></div>
          <span>{loading ? "" : loadError ? loadError : `${filteredProducts.length} styles`}</span>
        </div>
        {loading && <ProductGridSkeleton count={6} />}
        {!loading && loadError && <p className="detail-status">{loadError}</p>}
        {!loading && !loadError && filteredProducts.length === 0 && (
          <div className="empty-state" style={{ marginTop: "8vh" }}>
            <span>♧</span>
            <p>No styles match</p>
            <small>Try a different search or category.</small>
            <div style={{ marginTop: 18 }}>
              <button
                type="button"
                className="primary-button interactive"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  setQuery("");
                  startTransition(() => setActiveCategory("All"));
                }}
              >
                Clear filters
              </button>
            </div>
          </div>
        )}
        {!loading && !loadError && filteredProducts.length > 0 && (
          <div className="product-grid">
            {filteredProducts.map((product) => (
              <ViewTransition key={product.id}>
                <ProductCard
                  product={product}
                  wishlist={wishlist}
                  onToggleWishlist={(id) => toggleWishlist(wishlist, id)}
                  {...addToCartApi}
                />
              </ViewTransition>
            ))}
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
