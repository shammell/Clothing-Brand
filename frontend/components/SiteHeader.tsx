"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getAuthServerSnapshot,
  getCurrentUserSnapshot,
  subscribeToStorage,
} from "@/lib/auth-store";
import { getCartServerSnapshot, getCartSnapshot } from "@/lib/shop-store";

const OWN_SHELL_PREFIXES = ["/admin", "/lister"];

export function SiteHeader() {
  const pathname = usePathname();
  const cart = useSyncExternalStore(subscribeToStorage, getCartSnapshot, getCartServerSnapshot);
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // One-shot cart-icon bump when an item is added, not on every render or on
  // initial load. `previousCartCountRef` starts at `null` (not 0): cart is
  // localStorage-backed via useSyncExternalStore, which reads the server
  // snapshot ([]) on the very first render and self-corrects to the real
  // value one render later - starting the ref at 0 would make a returning
  // visitor who already has items in their bag see a false bump on page
  // load, the moment that correction lands (cartCount jumping from 0 to
  // their real count looks identical to "an item was just added"). Gating
  // on hasHydrated (same one-tick-after-mount pattern used throughout this
  // phase) means the ref's first real write happens after that correction,
  // recording the true baseline instead of comparing against a placeholder.
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => {
    // One-time "past first client paint" signal, not the derived-state
    // anti-pattern this rule targets - same justification as the existing
    // disable in app/admin/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasHydrated(true);
  }, []);
  const previousCartCountRef = useRef<number | null>(null);
  const [cartBumped, setCartBumped] = useState(false);
  useEffect(() => {
    if (!hasHydrated) return;
    if (previousCartCountRef.current !== null && cartCount > previousCartCountRef.current) {
      setCartBumped(true);
      const timeout = setTimeout(() => setCartBumped(false), 420);
      previousCartCountRef.current = cartCount;
      return () => clearTimeout(timeout);
    }
    previousCartCountRef.current = cartCount;
  }, [hasHydrated, cartCount]);

  if (OWN_SHELL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return null;
  }

  return (
    <>
      {pathname === "/" && (
        <div className="announcement">Free shipping on orders over $75 <span>•</span> Easy 30-day returns</div>
      )}
      <nav className="navbar">
        <Link className="brand" href="/">THREAD<span>&</span>CO</Link>
        <div className="nav-links">
          <Link href="/shop">Shop</Link>
          <Link href="/about">Our story</Link>
          <Link href="/contact">Contact</Link>
        </div>
        <div className="nav-actions">
          <Link
            href={currentUser ? "/account" : "/login"}
            className="icon-button interactive"
            aria-label={currentUser ? "Your account" : "Open account"}
            title={currentUser ? `Signed in as ${currentUser}` : "Log in"}
          >
            {currentUser ? currentUser[0].toUpperCase() : "♙"}
          </Link>
          <Link href="/cart" className={`icon-button cart-button interactive${cartBumped ? " bump" : ""}`} aria-label="Open cart">
            ♧ <b>{cartCount}</b>
          </Link>
        </div>
      </nav>
    </>
  );
}
