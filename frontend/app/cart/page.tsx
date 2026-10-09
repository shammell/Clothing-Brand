"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { getAuthServerSnapshot, getCurrentUserSnapshot, subscribeToStorage } from "@/lib/auth-store";
import { FALLBACK_IMAGE, getCartServerSnapshot, getCartSnapshot, writeCart } from "@/lib/shop-store";

export default function CartPage() {
  const router = useRouter();
  const cart = useSyncExternalStore(subscribeToStorage, getCartSnapshot, getCartServerSnapshot);
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);

  const removeFromCart = (index: number) => {
    writeCart(cart.filter((_, cartIndex) => cartIndex !== index));
  };

  const updateCartQuantity = (index: number, delta: number) => {
    const line = cart[index];
    if (!line) return;
    // Ceiling must distinguish "known stock of exactly 0" from "stock
    // unknown": `line.stock && line.stock > 0` treats 0 as falsy and falls
    // through to the 20 fallback, which would let an out-of-stock line's
    // quantity climb to 20. Computing the ceiling first (0 when stock is a
    // known number, 20 only when stock is genuinely unspecified) and then
    // checking the capped result against <=0 means a 0-stock line always
    // routes through removeFromCart instead of ever being written with a
    // quantity of 0.
    const ceiling = typeof line.stock === "number" ? Math.max(line.stock, 0) : 20;
    const nextQuantity = Math.min(line.quantity + delta, ceiling);
    if (nextQuantity <= 0) {
      removeFromCart(index);
      return;
    }
    writeCart(cart.map((item, cartIndex) => (cartIndex === index ? { ...item, quantity: nextQuantity } : item)));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const goToCheckout = () => {
    if (!currentUser) {
      router.push("/login?next=/checkout");
      return;
    }
    router.push("/checkout");
  };

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
              <img src={item.image} alt="" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_IMAGE; }} />
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
