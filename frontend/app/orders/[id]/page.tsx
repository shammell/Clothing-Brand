"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { authenticatedFetch, getAuthServerSnapshot, getAuthTokenSnapshot, getRoleServerSnapshot, getRoleSnapshot, isAdminRole, subscribeToStorage } from "@/lib/auth-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const ORDER_STEPS = ["placed", "processing", "shipped", "delivered"] as const;

type OrderItem = { product_id: string; name: string; price: number; quantity: number; subtotal: number; size: string; color: string };
type ShippingAddress = { full_name: string; address_line1: string; address_line2?: string | null; city: string; state: string; postal_code: string; country: string; phone?: string | null };
type Order = { id: string; items: OrderItem[]; total: number; status: string; created_at: string; shipping_address?: ShippingAddress | null };

function OrderTracker({ status }: { status: string }) {
  if (status === "cancelled") return <p className="order-tracker-cancelled">Cancelled</p>;
  const currentIndex = ORDER_STEPS.indexOf(status as (typeof ORDER_STEPS)[number]);
  return (
    <div className="order-tracker">
      {ORDER_STEPS.map((step, index) => (
        <div key={step} className={index <= currentIndex ? "order-step done" : "order-step"}>
          <span className="order-step-dot" />
          <small>{step}</small>
        </div>
      ))}
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const authToken = useSyncExternalStore(subscribeToStorage, getAuthTokenSnapshot, getAuthServerSnapshot);
  const role = useSyncExternalStore(subscribeToStorage, getRoleSnapshot, getRoleServerSnapshot);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Same hydration-timing hazard fixed on /checkout and /checkout/payment:
  // authToken reads the "" server snapshot on the very first render, then
  // self-corrects one render later. Without this gate, a hard reload of
  // this page by a fully logged-in user would show the "please log in"
  // prompt below for one tick before self-correcting - not a bad redirect
  // like the earlier bugs (this branch never navigates), but still a
  // visibly wrong message flashed at an actually-authenticated user.
  // Deferring the "not authenticated" branch until after mount means it
  // only ever fires on a real, settled authToken.
  const [clientReady, setClientReady] = useState(false);
  useEffect(() => {
    // One-time "past first client paint" signal, not the derived-state
    // anti-pattern this rule targets - same justification as the existing
    // disable in app/admin/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClientReady(true);
  }, []);

  useEffect(() => {
    if (!authToken || !orderId) return;
    const endpoint = isAdminRole(role) ? "/orders/" : "/orders/me";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setNotFound(false);
    authenticatedFetch(`${API_BASE}${endpoint}`, authToken)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Could not load orders"))))
      .then((orders: Order[]) => {
        const match = orders.find((candidate) => candidate.id === orderId);
        if (!match) {
          setNotFound(true);
          return;
        }
        setOrder(match);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [authToken, orderId, role]);

  if (clientReady && !authToken) {
    return (
      <main className="page-shell">
        <p>Please <Link href={`/login?next=/orders/${orderId}`}>log in</Link> to view this order.</p>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <Link href="/account" className="back-link">← Back to your orders</Link>
      <h1>Order detail</h1>

      {(!clientReady || loading) && <p className="detail-status">Loading...</p>}
      {clientReady && !loading && notFound && <p className="detail-status">We couldn&apos;t find that order.</p>}

      {clientReady && !loading && !notFound && order && (
        <div className="order-card" style={{ padding: 24 }}>
          <div className="order-card-head">
            <span>{new Date(order.created_at).toLocaleString()}</span>
            <span>#{order.id.slice(-6).toUpperCase()}</span>
          </div>
          <OrderTracker status={order.status} />
          {order.items.map((item) => (
            <div className="order-line" key={`${item.product_id}-${item.size}-${item.color}`}>
              <span>{item.quantity}× {item.name}{item.size && <small> ({item.size}{item.color ? `, ${item.color}` : ""})</small>}</span>
              <span>${item.subtotal.toFixed(2)}</span>
            </div>
          ))}
          <div className="order-card-total"><span>Total</span><span>${order.total.toFixed(2)}</span></div>
          {order.shipping_address && (
            <div style={{ marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
              <p className="eyebrow">Shipping to</p>
              <p>{order.shipping_address.full_name}</p>
              <p>{order.shipping_address.address_line1}{order.shipping_address.address_line2 ? `, ${order.shipping_address.address_line2}` : ""}</p>
              <p>{order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postal_code}</p>
              <p>{order.shipping_address.country}</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
