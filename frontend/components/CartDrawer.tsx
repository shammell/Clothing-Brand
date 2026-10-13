"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { PairsWellWith } from "@/components/CompleteTheLook";
import { ProductImage } from "@/components/ProductImage";
import { useCart } from "@/lib/useCart";
import { closeCartDrawer, getUiServerSnapshot, getUiSnapshot, subscribeToUi } from "@/lib/ui-store";

// A native <dialog> opened with showModal() gives the focus trap, Escape to
// close, an inert page behind it, and focus restoration to whatever opened it.
export function CartDrawer() {
  const pathname = usePathname();
  const { cartOpen } = useSyncExternalStore(subscribeToUi, getUiSnapshot, getUiServerSnapshot);
  const { cart, cartTotal, cartCount, removeFromCart, updateCartQuantity, goToCheckout } = useCart();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (cartOpen && !dialog.open) dialog.showModal();
    if (!cartOpen && dialog.open) dialog.close();
  }, [cartOpen]);

  if (pathname.startsWith("/admin") || pathname.startsWith("/lister")) return null;

  return (
    <dialog
      ref={dialogRef}
      className="cart-drawer"
      aria-labelledby="cart-drawer-title"
      // Escape and the native close path both fire `close`; keep the store in sync.
      onClose={closeCartDrawer}
      // A click on the dialog element itself (not its children) is a click on the scrim.
      onClick={(event) => {
        if (event.target === event.currentTarget) closeCartDrawer();
      }}
    >
      <div className="drawer-panel">
      <div className="drawer-heading">
        <h2 id="cart-drawer-title">
          Your bag {cartCount > 0 && <span>({cartCount})</span>}
        </h2>
        <button type="button" aria-label="Close bag" onClick={closeCartDrawer}>×</button>
      </div>

      {cart.length === 0 ? (
        <div className="empty-state" style={{ marginTop: "12vh" }}>
          <span>♧</span>
          <p>Your bag is waiting</p>
          <small>Add something you love.</small>
        </div>
      ) : (
        <>
          <div className="drawer-lines">
            {cart.map((item, index) => (
              <div className="cart-item drawer-line" key={`${item.id}-${item.size}-${item.color}`}>
                <ProductImage src={item.image} alt={item.name} />
                <div>
                  <b>{item.name}</b>
                  <small>{item.size}{item.color ? ` · ${item.color}` : ""}</small>
                  <div className="cart-item-qty">
                    <button type="button" aria-label={`Decrease quantity for ${item.name}`} onClick={() => updateCartQuantity(index, -1)}>−</button>
                    <span>{item.quantity}</span>
                    <button type="button" aria-label={`Increase quantity for ${item.name}`} onClick={() => updateCartQuantity(index, 1)}>+</button>
                  </div>
                  <strong>${(item.price * item.quantity).toFixed(2)}</strong>
                </div>
                <button type="button" className="cart-item-remove" aria-label={`Remove ${item.name} from bag`} onClick={() => removeFromCart(index)}>×</button>
              </div>
            ))}
          </div>
          <PairsWellWith cart={cart} />
          <div className="drawer-footer">
            <div className="drawer-subtotal"><span>Subtotal</span><b key={cartTotal} className="fade-in">${cartTotal.toFixed(2)}</b></div>
            <button
              type="button"
              className="checkout interactive"
              onClick={() => {
                closeCartDrawer();
                goToCheckout();
              }}
            >
              Proceed to checkout <span>${cartTotal.toFixed(2)}</span>
            </button>
            <Link href="/cart" className="back-link" onClick={closeCartDrawer}>View bag</Link>
          </div>
        </>
      )}
      </div>
    </dialog>
  );
}
