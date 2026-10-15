"use client";

import Link from "next/link";
import { useEffect } from "react";
import { refreshCartPrices } from "@/lib/refreshCartPrices";
import { FALLBACK_IMAGE } from "@/lib/shop-store";
import { useCart } from "@/lib/useCart";

export default function CartPage() {
  const { cart, cartTotal, cartCount, removeFromCart, updateCartQuantity, goToCheckout } = useCart();

  // Show what the server will actually charge, not the price saved when the item was added.
  useEffect(() => {
    refreshCartPrices();
  }, []);

  return (
    <main className="page-shell">
      <Link href="/" className="back-link">← Continue shopping</Link>
      <h1>Your bag {cartCount > 0 && <span style={{ color: "var(--accent)", fontSize: 16 }}>({cartCount})</span>}</h1>

      {cart.length === 0 ? (
        <div className="empty-state" style={{ marginTop: "10vh" }}>
          <span>♧</span>
          <p>Your bag is waiting</p>
          <small>Add something you love.</small>
        </div>
      ) : (
        <>
          {cart.map((item, index) => (
            <div className="cart-item" key={`${item.id}-${item.size}-${item.color}-${index}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary seller/Blob URLs */}
              <img src={item.image} alt={item.name} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_IMAGE; }} />
              <div>
                <b>{item.name}</b>
                <small>{item.category} · {item.size}{item.color ? ` · ${item.color}` : ""}</small>
                <div className="cart-item-qty">
                  <button type="button" aria-label={`Decrease quantity for ${item.name}`} onClick={() => updateCartQuantity(index, -1)}>−</button>
                  <span>{item.quantity}</span>
                  <button type="button" aria-label={`Increase quantity for ${item.name}`} onClick={() => updateCartQuantity(index, 1)}>+</button>
                </div>
                <strong>${(item.price * item.quantity).toFixed(2)}</strong>
              </div>
              <button className="cart-item-remove" aria-label={`Remove ${item.name} from bag`} onClick={() => removeFromCart(index)}>×</button>
            </div>
          ))}
          <button className="checkout interactive" onClick={goToCheckout}>
            Proceed to checkout <span>${cartTotal.toFixed(2)}</span>
          </button>
        </>
      )}
    </main>
  );
}
