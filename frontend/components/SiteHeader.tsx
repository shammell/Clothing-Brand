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
import { cartDrawerSuppressedFor, getUiServerSnapshot, getUiSnapshot, openCartDrawer, subscribeToUi } from "@/lib/ui-store";

const OWN_SHELL_PREFIXES = ["/admin", "/lister"];

export function SiteHeader() {
  const pathname = usePathname();
  const cart = useSyncExternalStore(subscribeToStorage, getCartSnapshot, getCartServerSnapshot);
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);
  const { announcement } = useSyncExternalStore(subscribeToUi, getUiSnapshot, getUiServerSnapshot);
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
  // Mobile menu is open only for the page it was opened on, so a link tap closes it.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setMenuPath(null);
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);
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
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
      <nav className="navbar">
        <Link className="brand" href="/">THREAD<span>&</span>CO</Link>
        <div className={`nav-links${menuOpen ? " open" : ""}`} id="site-menu">
          <Link href="/shop">Shop</Link>
          <Link href="/lookbook">Lookbook</Link>
          <Link href="/about">Our story</Link>
          <Link href="/contact">Contact</Link>
        </div>
        <div className="nav-actions">
          <button
            type="button"
            className="icon-button interactive menu-toggle"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            onClick={() => setMenuPath(menuOpen ? null : pathname)}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
          <Link
            href={currentUser ? "/account" : "/login"}
            className="icon-button interactive"
            aria-label={currentUser ? "Your account" : "Open account"}
            title={currentUser ? `Signed in as ${currentUser}` : "Log in"}
          >
            {currentUser ? currentUser[0].toUpperCase() : "♙"}
          </Link>
          <Link href="/shop?photo=1" className="icon-button interactive" aria-label="Search by photo" title="Search by photo">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </Link>
          {cartDrawerSuppressedFor(pathname) ? (
            <Link href="/cart" className={`icon-button cart-button interactive${cartBumped ? " bump" : ""}`} aria-label="Open cart">
              ♧ <b>{cartCount}</b>
            </Link>
          ) : (
            <button type="button" onClick={openCartDrawer} className={`icon-button cart-button interactive${cartBumped ? " bump" : ""}`} aria-label="Open cart">
              ♧ <b>{cartCount}</b>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
