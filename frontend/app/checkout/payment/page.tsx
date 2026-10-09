"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { authenticatedFetch, extractErrorMessage, getAuthServerSnapshot, getAuthTokenSnapshot, subscribeToStorage } from "@/lib/auth-store";
import { getCartServerSnapshot, getCartSnapshot, writeCart } from "@/lib/shop-store";
import { CHECKOUT_ADDRESS_KEY } from "../page";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

function isValidCardNumber(raw: string): boolean {
  const digits = raw.replace(/\s+/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export default function PaymentPage() {
  const router = useRouter();
  const authToken = useSyncExternalStore(subscribeToStorage, getAuthTokenSnapshot, getAuthServerSnapshot);
  const cart = useSyncExternalStore(subscribeToStorage, getCartSnapshot, getCartServerSnapshot);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  // Same hydration-timing hazard fixed on /checkout: authToken reads the ""
  // server snapshot on the very first render, then self-corrects one render
  // later. Deferring both the redirect effect AND the render-time draft
  // check to the render after mount means they act on the real
  // authToken/sessionStorage values, not the stale hydration snapshot -
  // without this, a hard reload of this page by a fully logged-in user with
  // a valid draft would momentarily read as logged-out and bounce to
  // /checkout, same class of bug as the one found and fixed there.
  const [readyToRedirect, setReadyToRedirect] = useState(false);
  useEffect(() => {
    setReadyToRedirect(true);
  }, []);

  useEffect(() => {
    if (!readyToRedirect) return;
    if (!authToken || !sessionStorage.getItem(CHECKOUT_ADDRESS_KEY)) {
      router.replace("/checkout");
    }
  }, [readyToRedirect, authToken, router]);

  const cardValid = isValidCardNumber(cardNumber);
  const expiryValid = /^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry);
  const cvcValid = /^\d{3,4}$/.test(cvc);
  const canPay = cardValid && expiryValid && cvcValid && !loading;

  const pay = async () => {
    const draft = sessionStorage.getItem(CHECKOUT_ADDRESS_KEY);
    if (!draft || !authToken) {
      router.replace("/checkout");
      return;
    }
    const address = JSON.parse(draft);
    setError("");
    setLoading(true);
    try {
      if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
      const response = await authenticatedFetch(`${API_BASE}/orders/`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKeyRef.current },
        body: JSON.stringify({
          items: cart.map((item) => ({ product_id: item.id, quantity: item.quantity, size: item.size, color: item.color })),
          shipping_address: {
            full_name: address.fullName.trim(),
            address_line1: address.addressLine1.trim(),
            address_line2: address.addressLine2.trim() || null,
            city: address.city.trim(),
            state: address.state.trim(),
            postal_code: address.postalCode.trim(),
            country: address.country.trim(),
            phone: address.phone.trim() || null,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(extractErrorMessage(data, "Could not place the order."));
        return;
      }
      writeCart([]);
      sessionStorage.removeItem(CHECKOUT_ADDRESS_KEY);
      idempotencyKeyRef.current = null;
      router.push(`/orders/${data.id}`);
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  if (!authToken) return null;
  // Guards the Review Focus requirement ("must redirect to /checkout, not
  // render a payment form with no destination for the order") - without
  // this, the page rendered the full form for one tick before the effect
  // above fired the actual redirect. `readyToRedirect` gates the
  // sessionStorage read so it's never touched before mount (SSR-safe) and
  // never read as the stale hydration snapshot (same reasoning as above).
  if (readyToRedirect && !sessionStorage.getItem(CHECKOUT_ADDRESS_KEY)) return null;

  return (
    <main className="page-shell">
      <Link href="/checkout" className="back-link">← Back to shipping</Link>
      <h1>Payment</h1>
      <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 20 }}>
        Demo payment — no real charge is made and no card data is transmitted or stored.
      </p>

      <div className="shipping-form" style={{ borderTop: "none", paddingTop: 0 }}>
        <input placeholder="Card number" value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} maxLength={19} />
        {cardNumber && !cardValid && <p className="size-error">Enter a valid card number</p>}
        <div className="shipping-form-row">
          <input placeholder="MM/YY" value={expiry} onChange={(event) => setExpiry(event.target.value)} maxLength={5} />
          <input placeholder="CVC" value={cvc} onChange={(event) => setCvc(event.target.value)} maxLength={4} />
        </div>
      </div>
      {error && <p className="auth-error">{error}</p>}
      <button className="checkout interactive" disabled={!canPay} onClick={pay}>
        {loading && <span className="spinner" />}
        {loading ? "Placing order..." : "Pay now"}
      </button>
    </main>
  );
}
