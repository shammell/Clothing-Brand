"use client";

import Link from "next/link";
import { ColorSelector } from "@/components/ColorSelector";
import { ProductImage } from "@/components/ProductImage";
import { SizeSelector } from "@/components/SizeSelector";
import { type Product } from "@/lib/shop-store";
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
    <article className="product-card">
      <div className="product-image">
        {product.badge && <span className="badge">{product.badge}</span>}
        <Link href={`/products/${product.id}`}>
          <ProductImage src={product.image} alt={product.name} transitionName={`product-image-${product.id}`} />
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
      <SizeSelector product={product} color={selection.color} value={selection.size} onSelect={(size) => selectSize(product, size)} variant="compact" showError={sizeErrors[product.id]} />
      {sizeErrors[product.id] && <p className="size-error">Select a size to add to bag</p>}
      <div className="product-meta">
        <span className="stars">★★★★★ <small>{product.rating}</small></span>
        <ColorSelector product={product} value={selection.color} onSelect={(color) => selectColor(product, color)} />
      </div>
      <div className="quantity-row">
        <button type="button" aria-label={`Decrease quantity for ${product.name}`} onClick={() => setQuantity(product, selection.quantity - 1)}>−</button>
        <span>{selection.quantity}</span>
        <button type="button" aria-label={`Increase quantity for ${product.name}`} onClick={() => setQuantity(product, selection.quantity + 1)}>+</button>
      </div>
    </article>
  );
}
