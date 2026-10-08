"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { subscribeToStorage } from "@/lib/auth-store";
import {
  FALLBACK_IMAGE,
  type Product,
  getWishlistServerSnapshot,
  getWishlistSnapshot,
  productFromApi,
  toggleWishlist,
} from "@/lib/shop-store";
import { useAddToCart } from "@/lib/useAddToCart";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const wishlist = useSyncExternalStore(subscribeToStorage, getWishlistSnapshot, getWishlistServerSnapshot);
  const { getSelection, selectSize, selectColor, setQuantity, addToCart, addStatus, sizeErrors } = useAddToCart();

  useEffect(() => {
    if (!productId) return;
    // Plain data-fetch effect (load the product once the route's id is
    // known) - the case React's own docs call a valid use of useEffect, not
    // the derived-state anti-pattern this rule targets. No external-store
    // equivalent exists for an on-demand network fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError("");
    fetch(`${API_BASE}/products/${productId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("not found"))))
      .then((data: Record<string, unknown>) => setProduct(productFromApi(data)))
      .catch(() => setLoadError("We couldn't find that product."))
      .finally(() => setLoading(false));
  }, [productId]);

  const selection = product ? getSelection(product) : null;

  return (
    <main className="store-shell">
      <nav className="navbar">
        <Link className="brand" href="/">THREAD<span>&</span>CO</Link>
        <Link href="/" className="back-link">← Back to shop</Link>
      </nav>

      {loading && <p className="detail-status">Loading...</p>}
      {!loading && loadError && <p className="detail-status">{loadError}</p>}

      {!loading && !loadError && product && selection && (
        <section className="product-detail">
          <div className="product-detail-image">
            {product.badge && <span className="badge">{product.badge}</span>}
            <img
              src={product.image}
              alt={product.name}
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = FALLBACK_IMAGE;
              }}
            />
          </div>
          <div className="product-detail-info">
            {product.brand && <p className="eyebrow">{product.brand}</p>}
            <h1>{product.name}</h1>
            <p className="product-detail-category">{product.category}</p>
            <strong className="product-detail-price">${product.price.toFixed(2)}</strong>
            <span className="stars">★★★★★ <small>{product.rating}</small></span>
            {product.description && <p className="product-detail-description">{product.description}</p>}

            <div className="size-row">
              {product.sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={selection.size === size ? "size-chip active" : "size-chip"}
                  aria-pressed={selection.size === size}
                  onClick={() => selectSize(product, size)}
                >
                  {size}
                </button>
              ))}
            </div>
            {sizeErrors[product.id] && <p className="size-error">Select a size to add to bag</p>}

            <span className="swatches">
              {product.colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={selection.color === color ? "swatch active" : "swatch"}
                  style={{ backgroundColor: color }}
                  aria-label={`Select color ${color}`}
                  aria-pressed={selection.color === color}
                  onClick={() => selectColor(product, color)}
                />
              ))}
            </span>

            <div className="quantity-row">
              <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(product, selection.quantity - 1)}>−</button>
              <span>{selection.quantity}</span>
              <button type="button" aria-label="Increase quantity" onClick={() => setQuantity(product, selection.quantity + 1)}>+</button>
            </div>

            <div className="product-detail-actions">
              <button
                className={addStatus[product.id] ? `primary-button ${addStatus[product.id]}` : "primary-button"}
                disabled={addStatus[product.id] === "adding"}
                onClick={() => addToCart(product)}
              >
                {addStatus[product.id] === "adding" ? "Adding..." : addStatus[product.id] === "added" ? "Added ✓" : "Add to bag"}
              </button>
              <button
                className={wishlist.includes(product.id) ? "heart-inline active" : "heart-inline"}
                aria-label={wishlist.includes(product.id) ? `Remove ${product.name} from saved` : `Save ${product.name}`}
                aria-pressed={wishlist.includes(product.id)}
                onClick={() => toggleWishlist(wishlist, product.id)}
              >
                {wishlist.includes(product.id) ? "♥" : "♡"} Save
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
