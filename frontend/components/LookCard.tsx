"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { SizeSelector } from "@/components/SizeSelector";
import { type Product } from "@/lib/shop-store";
import { useAddToCart } from "@/lib/useAddToCart";
import { useInViewport } from "@/lib/useInViewport";
import { variantStock } from "@/lib/variants";

export type Look = { product: Product; companions: Product[] };

export function LookCard({ look }: { look: Look }) {
  const { ref, isVisible } = useInViewport<HTMLElement>();
  const pieces = [look.product, ...look.companions];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cart = useAddToCart();
  const { getSelection, selectSize, addToCart, sizeErrors } = cart;
  const [soldOutNote, setSoldOutNote] = useState("");

  const total = pieces.reduce((sum, piece) => sum + piece.price, 0);

  const addAll = () => {
    setSoldOutNote("");
    const missing = pieces.filter((piece) => !getSelection(piece).size);
    if (missing.length > 0) {
      // addToCart flags the missing sizes without adding anything.
      missing.forEach((piece) => addToCart(piece));
      return;
    }
    const soldOut = pieces.find((piece) => {
      const { size, color } = getSelection(piece);
      return variantStock(piece, size, color) === 0;
    });
    if (soldOut) {
      setSoldOutNote(`${soldOut.name} is sold out in that size. Please choose another.`);
      return;
    }
    // Each piece becomes its own bag line; the drawer opens as they land.
    pieces.forEach((piece) => addToCart(piece));
    dialogRef.current?.close();
  };

  return (
    <article ref={ref} className={`look-card reveal${isVisible ? " is-visible" : ""}`}>
      <Link href={`/products/${look.product.id}`} className="look-anchor">
        <ProductImage src={look.product.image} alt={look.product.name} />
      </Link>
      <div className="look-pieces">
        <p className="eyebrow">THE LOOK</p>
        <ul>
          {pieces.map((piece) => (
            <li key={piece.id}>
              <Link href={`/products/${piece.id}`}>{piece.name}</Link>
              <span>${piece.price.toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <p className="look-total">Complete look <b>${total.toFixed(2)}</b></p>
        <button type="button" className="primary-button" onClick={() => dialogRef.current?.showModal()}>
          Shop this look
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className="fit-dialog"
        aria-label="Choose sizes for this look"
        onClick={(event) => event.target === event.currentTarget && dialogRef.current?.close()}
      >
        <div className="fit-panel">
          <div className="drawer-heading">
            <h2>Choose your sizes</h2>
            <button type="button" aria-label="Close" onClick={() => dialogRef.current?.close()}>×</button>
          </div>
          {pieces.map((piece) => {
            const selection = getSelection(piece);
            return (
              <div key={piece.id} className="look-size-row">
                <b>{piece.name}</b>
                <SizeSelector
                  product={piece}
                  color={selection.color}
                  value={selection.size}
                  onSelect={(size) => selectSize(piece, size)}
                  variant="compact"
                  showError={sizeErrors[piece.id]}
                />
                {sizeErrors[piece.id] && <p className="size-error">Select a size</p>}
              </div>
            );
          })}
          {soldOutNote && <p className="size-error" role="alert">{soldOutNote}</p>}
          <button type="button" className="checkout interactive" onClick={addAll}>
            Add all to bag <span>${total.toFixed(2)}</span>
          </button>
        </div>
      </dialog>
    </article>
  );
}
