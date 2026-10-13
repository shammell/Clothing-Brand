"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { subscribeToStorage } from "@/lib/auth-store";
import { ColorSelector } from "@/components/ColorSelector";
import { ProductImage } from "@/components/ProductImage";
import { FindMySize } from "@/components/FindMySize";
import { SizeSelector } from "@/components/SizeSelector";
import { SiteFooter } from "@/components/SiteFooter";
import {
  type Product,
  getWishlistServerSnapshot,
  getWishlistSnapshot,
  productFromApi,
  toggleWishlist,
} from "@/lib/shop-store";
import { cacheProducts, getCachedProduct } from "@/lib/product-cache";
import { useAddToCart } from "@/lib/useAddToCart";
import { ProductDetailSkeleton } from "@/components/Skeletons";


const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const [product, setProduct] = useState<Product | null>(() => getCachedProduct(productId));
  const [loading, setLoading] = useState(() => !getCachedProduct(productId));
  const [loadError, setLoadError] = useState("");
  const [recommendedSize, setRecommendedSize] = useState<string | null>(null);
  const wishlist = useSyncExternalStore(subscribeToStorage, getWishlistSnapshot, getWishlistServerSnapshot);
  const { getSelection, selectSize, selectColor, setQuantity, addToCart, addStatus, sizeErrors } = useAddToCart();

  useEffect(() => {
    if (!productId) return;
    // Plain data-fetch effect (load the product once the route's id is
    // known) - the case React's own docs call a valid use of useEffect, not
    // the derived-state anti-pattern this rule targets. No external-store
    // equivalent exists for an on-demand network fetch.
    // A cached copy renders immediately (so the image can morph in from the
    // card); the fetch below still refreshes stock in the background.
    const cached = getCachedProduct(productId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProduct(cached);
    setLoading(!cached);
    setLoadError("");
    fetch(`${API_BASE}/products/${productId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("not found"))))
      .then((data: Record<string, unknown>) => {
        const fresh = productFromApi(data);
        cacheProducts([fresh]);
        setProduct(fresh);
      })
      .catch(() => setLoadError("We couldn't find that product."))
      .finally(() => setLoading(false));
  }, [productId]);

  const selection = product ? getSelection(product) : null;

  return (
    <main className="store-shell">

      {loading && <ProductDetailSkeleton />}
      {!loading && loadError && <p className="detail-status">{loadError}</p>}

      {!loading && !loadError && product && selection && (
        <section className="product-detail">
          <div className="product-detail-image">
            {product.badge && <span className="badge">{product.badge}</span>}
            <ProductImage src={product.image} alt={product.name} priority transitionName={`product-image-${product.id}`} />
          </div>
          <div className="product-detail-info">
            {product.brand && <p className="eyebrow">{product.brand}</p>}
            <h1>{product.name}</h1>
            <p className="product-detail-category">{product.category}</p>
            <strong className="product-detail-price">${product.price.toFixed(2)}</strong>
            <span className="stars">★★★★★ <small>{product.rating}</small></span>
            {product.description && <p className="product-detail-description">{product.description}</p>}

            <SizeSelector product={product} color={selection.color} value={selection.size} onSelect={(size) => selectSize(product, size)} variant="full" showError={sizeErrors[product.id]} recommendedSize={recommendedSize} />
            <FindMySize key={product.id} product={product} onSelectSize={(size) => selectSize(product, size)} onRecommendation={setRecommendedSize} />
            {sizeErrors[product.id] && <p className="size-error">Select a size to add to bag</p>}

            <ColorSelector product={product} value={selection.color} onSelect={(color) => selectColor(product, color)} variant="full" />

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
      <SiteFooter />
    </main>
  );
}
