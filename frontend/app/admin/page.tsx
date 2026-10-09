"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  authenticatedFetch,
  extractErrorMessage,
  getAuthServerSnapshot,
  getAuthTokenSnapshot,
  getCurrentUserSnapshot,
  getRoleServerSnapshot,
  getRoleSnapshot,
  isAdminRole,
  subscribeToStorage,
  writeAuth,
} from "@/lib/auth-store";
import { ProductManager } from "@/components/ProductManager";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type OrderItem = {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  size: string;
  color: string;
};

type ShippingAddress = {
  full_name: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone?: string | null;
};

type Order = {
  id: string;
  items: OrderItem[];
  total: number;
  status: string;
  created_at: string;
  shipping_address?: ShippingAddress | null;
};

const ORDER_STATUSES = ["placed", "processing", "shipped", "delivered", "cancelled"] as const;

const inputClass = "border border-neutral-300 px-3 py-2 text-sm w-full";

export default function AdminPage() {
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);
  const authToken = useSyncExternalStore(subscribeToStorage, getAuthTokenSnapshot, getAuthServerSnapshot);
  const role = useSyncExternalStore(subscribeToStorage, getRoleSnapshot, getRoleServerSnapshot);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  const logout = () => writeAuth("", "");

  const loadOrders = async () => {
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const response = await authenticatedFetch(`${API_BASE}/orders/`, authToken);
      if (response.status === 401) {
        logout();
        setOrdersError("Your session expired. Please log in again.");
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setOrdersError(extractErrorMessage(data, "Could not load orders."));
        return;
      }
      setOrders(data as Order[]);
    } catch {
      setOrdersError("Could not connect to the server.");
    } finally {
      setOrdersLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    setUpdatingOrderId(orderId);
    try {
      const response = await authenticatedFetch(`${API_BASE}/orders/${orderId}/status`, authToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (response.status === 401) {
        logout();
        setOrdersError("Your session expired. Please log in again.");
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setOrdersError(extractErrorMessage(data, "Could not update order status."));
        return;
      }
      setOrders((current) => current.map((order) => (order.id === orderId ? (data as Order) : order)));
    } catch {
      setOrdersError("Could not connect to the server.");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  useEffect(() => {
    if (!isAdminRole(role)) return;
    // Plain data-fetch effect (load admin data once admin access is
    // confirmed) - the case React's own docs call a valid use of useEffect,
    // not the derived-state anti-pattern this rule targets. No external-store
    // equivalent exists for an on-demand network fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrders();
    // loadOrders is intentionally omitted: it's a plain function recreated
    // every render, not memoized, so including it would re-run this effect
    // (and re-fetch) on every render instead of only when admin access is
    // first confirmed - role is the only actual trigger this effect cares
    // about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const login = async () => {
    setLoginError("");
    setLoginLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLoginError(extractErrorMessage(data, "Login failed."));
        return;
      }
      writeAuth(data.access_token, data.user.username, data.user.role ?? "customer");
      setLoginPassword("");
    } catch {
      setLoginError("Could not connect to the server.");
    } finally {
      setLoginLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
        <form
          className="w-full max-w-sm space-y-4 bg-white p-8 shadow-sm border border-neutral-200"
          onSubmit={(event) => { event.preventDefault(); login(); }}
        >
          <h1 className="text-xl font-semibold text-neutral-900">Admin login</h1>
          <input
            type="email"
            required
            placeholder="Email address"
            value={loginEmail}
            onChange={(event) => setLoginEmail(event.target.value)}
            className={inputClass}
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
            className={inputClass}
          />
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <button
            type="submit"
            disabled={loginLoading}
            className="w-full bg-neutral-900 text-white py-2 text-sm uppercase tracking-wide disabled:opacity-60"
          >
            {loginLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </main>
    );
  }

  if (!isAdminRole(role)) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
        <div className="text-center space-y-4">
          <p className="text-neutral-700">Signed in as {currentUser}, but this account doesn&apos;t have admin access.</p>
          <button onClick={logout} className="underline text-sm">Log out</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-neutral-900">Thread&amp;Co admin</h1>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-neutral-500">Signed in as {currentUser}</span>
            <button onClick={logout} className="underline">Log out</button>
          </div>
        </header>

        <ProductManager authToken={authToken} onSessionExpired={logout} />

        <section className="bg-white border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-neutral-900">Orders ({orders.length})</h2>
            <button onClick={loadOrders} className="text-sm underline">Refresh</button>
          </div>
          {ordersLoading && <p className="text-sm text-neutral-500">Loading...</p>}
          {!ordersLoading && ordersError && <p className="text-sm text-red-600">{ordersError}</p>}
          {!ordersLoading && !ordersError && orders.length === 0 && (
            <p className="text-sm text-neutral-500">No orders yet.</p>
          )}
          {!ordersLoading && !ordersError && orders.length > 0 && (
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.id} className="border border-neutral-200 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div>
                      <span className="text-neutral-500">{new Date(order.created_at).toLocaleString()}</span>
                      {order.shipping_address && (
                        <span className="ml-3 text-neutral-700">
                          {order.shipping_address.full_name} · {order.shipping_address.city}, {order.shipping_address.country}
                        </span>
                      )}
                    </div>
                    <select
                      value={order.status}
                      disabled={updatingOrderId === order.id}
                      onChange={(event) => updateOrderStatus(order.id, event.target.value)}
                      className="border border-neutral-300 px-2 py-1 text-sm disabled:opacity-60"
                    >
                      {ORDER_STATUSES.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  <ul className="space-y-1 mb-2">
                    {order.items.map((item) => (
                      <li key={`${item.product_id}-${item.size}-${item.color}`} className="flex justify-between text-neutral-700">
                        <span>{item.quantity}× {item.name} ({item.size}{item.color ? `, ${item.color}` : ""})</span>
                        <span>${item.subtotal.toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between font-medium border-t border-neutral-100 pt-2">
                    <span>Total</span>
                    <span>${order.total.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
