"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { SizeSelector } from "@/components/SizeSelector";
import { type CartLine, type Product, productFromApi } from "@/lib/shop-store";
import { useAddToCart } from "@/lib/useAddToCart";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

async function fetchCompanions(productId: string): Promise<Product[]> {
  const response = await fetch(`${API_BASE}/products/${productId}/companions`);
  if (!response.ok) return [];
  const data: Array<Record<string, unknown>> = await response.json();
  return data.map(productFromApi);
}

// Companions the shopper does not already have in the bag.
export function excludeInBag(companions: Product[], cart: CartLine[]): Product[] {
  const inBag = new Set(cart.map((line) => line.id));
  return companions.filter((companion) => !inBag.has(companion.id));
}

// Product page rail. Omitted entirely when there is nothing to show.
export function CompleteTheLook({ productId }: { productId: string }) {
  const [companions, setCompanions] = useState<Product[] | null>(null);
  const { getSelection, selectSize, addToCart, sizeErrors, variantErrors, addStatus } = useAddToCart();

  useEffect(() => {
    let cancelled = false;
    fetchCompanions(productId)
      .then((items) => !cancelled && setCompanions(items))
      .catch(() => !cancelled && setCompanions([]));
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (companions === null) {
    return (
      <section className="look-rail" aria-hidden="true">
        <div className="skeleton skeleton-line" style={{ width: 160, height: 22 }} />
        <div className="look-items">
          {[0, 1, 2].map((index) => (
            <div key={index} className="look-item skeleton" style={{ height: 320 }} />
          ))}
        </div>
      </section>
    );
  }
  if (companions.length === 0) return null;

  return (
    <section className="look-rail" aria-labelledby="look-rail-title">
      <h2 id="look-rail-title">Complete the look</h2>
      <div className="look-items" tabIndex={0} aria-label="Pairing suggestions">
        {companions.map((product) => {
          const selection = getSelection(product);
          return (
            <article key={product.id} className="look-item">
              <Link href={`/products/${product.id}`} className="look-image">
                <ProductImage src={product.image} alt={product.name} />
              </Link>
              <h3><Link href={`/products/${product.id}`}>{product.name}</Link></h3>
              <strong>${product.price.toFixed(2)}</strong>
              <SizeSelector
                product={product}
                color={selection.color}
                value={selection.size}
                onSelect={(size) => selectSize(product, size)}
                variant="compact"
                showError={sizeErrors[product.id]}
              />
              {sizeErrors[product.id] && <p className="size-error">Select a size</p>}
              {variantErrors[product.id] && <p className="size-error">That size is sold out</p>}
              <button
                type="button"
                className="primary-button"
                disabled={addStatus[product.id] === "adding"}
                onClick={() => addToCart(product)}
              >
                {addStatus[product.id] === "added" ? "Added ✓" : "Add"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// One suggestion in the bag drawer, based on the line added most recently.
export function PairsWellWith({ cart }: { cart: CartLine[] }) {
  const [companions, setCompanions] = useState<Product[]>([]);
  const lastId = cart.length ? cart[cart.length - 1].id : null;

  useEffect(() => {
    let cancelled = false;
    if (!lastId) return;
    fetchCompanions(lastId)
      .then((items) => !cancelled && setCompanions(items))
      .catch(() => !cancelled && setCompanions([]));
    return () => {
      cancelled = true;
    };
  }, [lastId]);

  const suggestion = lastId ? excludeInBag(companions, cart)[0] : undefined;
  if (!suggestion) return null;
  return (
    <Link href={`/products/${suggestion.id}`} className="pairs-well">
      <span className="pairs-image"><ProductImage src={suggestion.image} alt="" /></span>
      <span>
        <small>Pairs well with</small>
        <b>{suggestion.name}</b>
        <em>${suggestion.price.toFixed(2)}</em>
      </span>
    </Link>
  );
}
