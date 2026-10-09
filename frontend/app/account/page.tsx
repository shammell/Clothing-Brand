"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { authenticatedFetch, getAuthServerSnapshot, getAuthTokenSnapshot, getCurrentUserSnapshot, subscribeToStorage, writeAuth } from "@/lib/auth-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type OrderSummary = { id: string; total: number; status: string; created_at: string };

export default function AccountPage() {
  const router = useRouter();
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);
  const authToken = useSyncExternalStore(subscribeToStorage, getAuthTokenSnapshot, getAuthServerSnapshot);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Same hydration-timing hazard fixed on /checkout, /checkout/payment, and
  // /orders/[id]: authToken reads the "" server snapshot on the very first
  // render, then self-corrects one render later. Without this gate, a hard
  // reload of this page by a fully logged-in user would hit the
  // `router.replace("/login?next=/account")` below on that stale "" value
  // and genuinely bounce them to the login page - not just a render flash
  // this time, since this branch (unlike /orders/[id]'s) actually navigates.
  const [readyToRedirect, setReadyToRedirect] = useState(false);
  useEffect(() => {
    setReadyToRedirect(true);
  }, []);

  useEffect(() => {
    if (!readyToRedirect) return;
    if (!authToken) {
      router.replace("/login?next=/account");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    authenticatedFetch(`${API_BASE}/orders/me`, authToken)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Could not load orders"))))
      .then((data: OrderSummary[]) => setOrders(data))
      .catch(() => setError("Could not load your orders."))
      .finally(() => setLoading(false));
  }, [readyToRedirect, authToken, router]);

  const logout = () => {
    writeAuth("", "");
    router.push("/");
  };

  if (!authToken) return null;

  return (
    <main className="page-shell">
      <Link href="/" className="back-link">← Back home</Link>
      <h1>Your account</h1>
      <p style={{ marginBottom: 24 }}>Signed in as <b>{currentUser}</b></p>

      <h2 style={{ fontSize: 20, marginBottom: 16 }}>Order history</h2>
      {loading && <p className="orders-status">Loading your orders...</p>}
      {!loading && error && <p className="auth-error">{error}</p>}
      {!loading && !error && orders.length === 0 && (
        <div className="empty-state"><span>♧</span><p>No orders yet</p><small>Your past purchases will show up here.</small></div>
      )}
      {!loading && !error && orders.length > 0 && (
        <div className="orders-list" style={{ maxHeight: "none" }}>
          {orders.map((order) => (
            <Link href={`/orders/${order.id}`} key={order.id} className="order-card interactive" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
              <div className="order-card-head">
                <span>{new Date(order.created_at).toLocaleDateString()}</span>
                <span>#{order.id.slice(-6).toUpperCase()}</span>
              </div>
              <div className="order-card-total"><span>{order.status}</span><span>${order.total.toFixed(2)}</span></div>
            </Link>
          ))}
        </div>
      )}

      <button className="auth-switch" onClick={logout} style={{ marginTop: 24 }}>Log out</button>
    </main>
  );
}
