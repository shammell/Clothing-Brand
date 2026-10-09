"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, useState } from "react";
import { getAuthServerSnapshot, getAuthTokenSnapshot, subscribeToStorage } from "@/lib/auth-store";
import { getCartServerSnapshot, getCartSnapshot } from "@/lib/shop-store";

export const CHECKOUT_ADDRESS_KEY = "threadco_checkout_address";

type ShippingAddressForm = {
  fullName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
};

const EMPTY_SHIPPING_ADDRESS: ShippingAddressForm = {
  fullName: "", addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "", phone: "",
};
const REQUIRED_FIELDS: Array<keyof ShippingAddressForm> = ["fullName", "addressLine1", "city", "state", "postalCode", "country"];

export default function CheckoutPage() {
  const router = useRouter();
  const cart = useSyncExternalStore(subscribeToStorage, getCartSnapshot, getCartServerSnapshot);
  const authToken = useSyncExternalStore(subscribeToStorage, getAuthTokenSnapshot, getAuthServerSnapshot);
  const [address, setAddress] = useState<ShippingAddressForm>(EMPTY_SHIPPING_ADDRESS);
  const [formError, setFormError] = useState("");
  // authToken/cart read getAuthServerSnapshot/getCartServerSnapshot ("" / [])
  // during the hydration render, then correct to the real localStorage value
  // one render later. On a hard page load, this component's own effects run
  // once with that still-stale ("", []) pair before the correction lands -
  // without this gate, a fully logged-in user with items in their bag would
  // momentarily read as logged-out and get bounced to /login?next=/checkout
  // (which, via that page's own already-logged-in effect, bounces again to
  // a hardcoded /account - confirmed by hand, this chain actually fires and
  // 404s, since /account isn't a real route). Deferring the redirect check
  // to the render after mount means authToken/cart are read fresh (no
  // longer the hydration snapshot) by the time this effect is allowed to act.
  const [readyToRedirect, setReadyToRedirect] = useState(false);
  useEffect(() => {
    // One-time "past first client paint" signal, not the derived-state
    // anti-pattern this rule targets - same justification as the existing
    // disable in app/admin/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReadyToRedirect(true);
  }, []);

  useEffect(() => {
    if (!readyToRedirect) return;
    if (!authToken) router.replace("/login?next=/checkout");
    else if (cart.length === 0) router.replace("/cart");
  }, [readyToRedirect, authToken, cart.length, router]);

  const updateField = (field: keyof ShippingAddressForm, value: string) => {
    setAddress((current) => ({ ...current, [field]: value }));
  };

  const continueToPayment = () => {
    const missingField = REQUIRED_FIELDS.find((field) => !address[field].trim());
    if (missingField) {
      setFormError("Please fill in your shipping address before continuing.");
      return;
    }
    setFormError("");
    sessionStorage.setItem(CHECKOUT_ADDRESS_KEY, JSON.stringify(address));
    router.push("/checkout/payment");
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (!authToken || cart.length === 0) return null;

  return (
    <main className="page-shell">
      <Link href="/cart" className="back-link">← Back to bag</Link>
      <h1>Checkout</h1>

      <div className="shipping-form" style={{ borderTop: "none", paddingTop: 0 }}>
        <p className="eyebrow">Shipping address</p>
        <input placeholder="Full name" value={address.fullName} onChange={(event) => updateField("fullName", event.target.value)} />
        <input placeholder="Address line 1" value={address.addressLine1} onChange={(event) => updateField("addressLine1", event.target.value)} />
        <input placeholder="Address line 2 (optional)" value={address.addressLine2} onChange={(event) => updateField("addressLine2", event.target.value)} />
        <div className="shipping-form-row">
          <input placeholder="City" value={address.city} onChange={(event) => updateField("city", event.target.value)} />
          <input placeholder="State" value={address.state} onChange={(event) => updateField("state", event.target.value)} />
        </div>
        <div className="shipping-form-row">
          <input placeholder="Postal code" value={address.postalCode} onChange={(event) => updateField("postalCode", event.target.value)} />
          <input placeholder="Country" value={address.country} onChange={(event) => updateField("country", event.target.value)} />
        </div>
        <input placeholder="Phone (optional)" value={address.phone} onChange={(event) => updateField("phone", event.target.value)} />
      </div>
      {formError && <p className="auth-error">{formError}</p>}
      <button className="checkout interactive" onClick={continueToPayment}>
        Continue to payment <span>${cartTotal.toFixed(2)}</span>
      </button>
    </main>
  );
}
