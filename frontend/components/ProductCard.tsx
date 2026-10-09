"use client";

import Link from "next/link";
import { FALLBACK_IMAGE, type Product } from "@/lib/shop-store";
import type { useAddToCart } from "@/lib/useAddToCart";

type AddToCartApi = ReturnType<typeof useAddToCart>;

type ProductCardProps = AddToCartApi & {
  product: Product;
  wishlist: string[];
  onToggleWishlist: (productId: string) => void;
};

export function ProductCard({
  product,
  wishlist,
  onToggleWishlist,
  getSelection,
  selectSize,
  selectColor,
  setQuantity,
  addToCart,
  addStatus,
  sizeErrors,
}: ProductCardProps) {
  const selection = getSelection(product);
  return (
    <article className="product-card reveal">
      <div className="product-image">
        {product.badge && <span className="badge">{product.badge}</span>}
        <Link href={`/products/${product.id}`}>
          <img
            src={product.image}
            alt={product.name}
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = FALLBACK_IMAGE;
            }}
          />
        </Link>
        <button
          className={wishlist.includes(product.id) ? "heart active" : "heart"}
          aria-label={wishlist.includes(product.id) ? `Remove ${product.name} from saved` : `Save ${product.name}`}
          aria-pressed={wishlist.includes(product.id)}
          onClick={() => onToggleWishlist(product.id)}
        >
          {wishlist.includes(product.id) ? "♥" : "♡"}
        </button>
        <button
          className={addStatus[product.id] ? `quick-add ${addStatus[product.id]}` : "quick-add"}
          disabled={addStatus[product.id] === "adding"}
          onClick={() => addToCart(product)}
        >
          {addStatus[product.id] === "adding" ? "Adding..." : addStatus[product.id] === "added" ? "Added ✓" : <>Add to bag <span>+</span></>}
        </button>
      </div>
      <div className="product-info">
        <div>
          <h3><Link href={`/products/${product.id}`}>{product.name}</Link></h3>
          <p>{product.category}</p>
        </div>
        <strong>${product.price.toFixed(2)}</strong>
      </div>
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
      <div className="product-meta">
        <span className="stars">★★★★★ <small>{product.rating}</small></span>
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
      </div>
      <div className="quantity-row">
        <button type="button" aria-label={`Decrease quantity for ${product.name}`} onClick={() => setQuantity(product, selection.quantity - 1)}>−</button>
        <span>{selection.quantity}</span>
        <button type="button" aria-label={`Increase quantity for ${product.name}`} onClick={() => setQuantity(product, selection.quantity + 1)}>+</button>
      </div>
    </article>
  );
}
