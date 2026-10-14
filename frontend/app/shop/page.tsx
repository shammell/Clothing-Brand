// frontend/app/shop/page.tsx
"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
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
import { fetchAllProducts } from "@/lib/fetchAllProducts";
import { useAddToCart } from "@/lib/useAddToCart";
import { ProductGridSkeleton } from "@/components/Skeletons";
import { VisualSearch, describeMatch, type VisualState } from "@/components/VisualSearch";


const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const CATEGORIES = ["All", "T-Shirts", "Jeans", "Dresses", "Hoodies", "Shoes", "Shirts"];

export default function ShopPage() {
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [visual, setVisual] = useState<VisualState>({ status: "idle" });
  // Filters to put back when the photo results are cleared.
  const savedFilters = useRef({ category: "All", query: "" });
  const [, startTransition] = useTransition();
  const wishlist = useSyncExternalStore(subscribeToStorage, getWishlistSnapshot, getWishlistServerSnapshot);
  const addToCartApi = useAddToCart();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError("");
    fetchAllProducts(API_BASE)
      .then((data) => {
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

  // The header's camera icon lands here with ?photo=1: bring the photo button into focus.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("photo") === "1") {
      document.querySelector<HTMLButtonElement>(".photo-button")?.focus();
    }
  }, []);

  const handleVisual = (next: VisualState) => {
    if (visual.status === "idle") savedFilters.current = { category: activeCategory, query };
    setVisual(next);
  };

  const clearVisual = () => {
    setVisual({ status: "idle" });
    startTransition(() => setActiveCategory(savedFilters.current.category));
    setQuery(savedFilters.current.query);
  };

  // Photo results replace the filtered list, in ranked order.
  const displayedProducts =
    visual.status === "done"
      ? visual.results.flatMap((match) => catalog.find((product) => product.id === match.id) ?? [])
      : filteredProducts;
  const waitingOnPhoto = visual.status === "loading";

  return (
    <main className="store-shell">

      <section className="category-strip">
        <label className="search-box">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products..." />
        </label>
        <VisualSearch onChange={handleVisual} />
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
          <span>{loading ? "" : loadError ? loadError : `${displayedProducts.length} styles`}</span>
        </div>
        {visual.status !== "idle" && (
          <div className="visual-bar">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={visual.thumbnail} alt="Your photo" className={waitingOnPhoto ? "scanning" : undefined} />
            <span role="status">
              {visual.status === "loading" && "Looking for matches..."}
              {visual.status === "done" && (describeMatch(visual.attributes) ? `Showing matches for: ${describeMatch(visual.attributes)}` : "No clear style found in that photo")}
              {visual.status === "error" && visual.message}
            </span>
            {visual.status === "error" && <button type="button" onClick={visual.retry}>Try again</button>}
            <button type="button" onClick={clearVisual}>Clear</button>
          </div>
        )}
        {(loading || waitingOnPhoto) && <ProductGridSkeleton count={6} />}
        {!loading && loadError && <p className="detail-status">{loadError}</p>}
        {!loading && !loadError && !waitingOnPhoto && visual.status !== "error" && displayedProducts.length === 0 && (
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
                  setVisual({ status: "idle" });
                  setQuery("");
                  startTransition(() => setActiveCategory("All"));
                }}
              >
                Clear filters
              </button>
            </div>
          </div>
        )}
        {!loading && !loadError && !waitingOnPhoto && visual.status !== "error" && displayedProducts.length > 0 && (
          <div className="product-grid">
            {displayedProducts.map((product) => (
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
