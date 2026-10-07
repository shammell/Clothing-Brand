"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  authenticatedFetch,
  extractErrorMessage,
  getAuthServerSnapshot,
  getAuthTokenSnapshot,
  getCurrentUserSnapshot,
  getIsAdminServerSnapshot,
  getIsAdminSnapshot,
  subscribeToStorage,
  writeAuth,
} from "@/lib/auth-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8003";

type Product = {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  brand: string;
  sizes: string[];
  colors: string[];
  image_url: string;
  stock: number;
  rating: number;
};

type ProductFormState = {
  name: string;
  description: string;
  price: string;
  category: string;
  brand: string;
  sizes: string;
  colors: string;
  image_url: string;
  stock: string;
  rating: string;
};

const EMPTY_FORM: ProductFormState = {
  name: "",
  description: "",
  price: "",
  category: "",
  brand: "",
  sizes: "",
  colors: "",
  image_url: "",
  stock: "",
  rating: "0",
};

function productToForm(product: Product): ProductFormState {
  return {
    name: product.name,
    description: product.description ?? "",
    price: String(product.price),
    category: product.category,
    brand: product.brand,
    sizes: product.sizes.join(", "),
    colors: product.colors.join(", "),
    image_url: product.image_url,
    stock: String(product.stock),
    rating: String(product.rating),
  };
}

function formToPayload(form: ProductFormState) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    price: Number(form.price),
    category: form.category.trim(),
    brand: form.brand.trim(),
    sizes: form.sizes.split(",").map((size) => size.trim()).filter(Boolean),
    colors: form.colors.split(",").map((color) => color.trim()).filter(Boolean),
    image_url: form.image_url.trim(),
    stock: Number(form.stock),
    rating: Number(form.rating) || 0,
  };
}

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
  const isAdmin = useSyncExternalStore(subscribeToStorage, getIsAdminSnapshot, getIsAdminServerSnapshot);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");

  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  const logout = () => writeAuth("", "");

  const loadProducts = async () => {
    setProductsLoading(true);
    setProductsError("");
    try {
      const response = await fetch(`${API_BASE}/products/`);
      const data = await response.json();
      if (!response.ok) {
        setProductsError(extractErrorMessage(data, "Could not load products."));
        return;
      }
      setProducts(data as Product[]);
    } catch {
      setProductsError("Could not connect to the server.");
    } finally {
      setProductsLoading(false);
    }
  };

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
    if (!isAdmin) return;
    // Plain data-fetch effect (load admin data once admin access is
    // confirmed) - the case React's own docs call a valid use of useEffect,
    // not the derived-state anti-pattern this rule targets. No external-store
    // equivalent exists for an on-demand network fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProducts();
    loadOrders();
    // loadProducts/loadOrders are intentionally omitted: they're plain
    // functions recreated every render, not memoized, so including them
    // would re-run this effect (and re-fetch) on every render instead of
    // only when admin access is first confirmed - isAdmin is the only
    // actual trigger this effect cares about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

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
      writeAuth(data.access_token, data.user.username, Boolean(data.user.is_admin));
      setLoginPassword("");
    } catch {
      setLoginError("Could not connect to the server.");
    } finally {
      setLoginLoading(false);
    }
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError("");
  };

  const startEdit = (product: Product) => {
    setForm(productToForm(product));
    setEditingId(product.id);
    setFormError("");
  };

  const submitForm = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    setFormSaving(true);
    try {
      const payload = formToPayload(form);
      const url = editingId ? `${API_BASE}/products/${editingId}` : `${API_BASE}/products/`;
      const method = editingId ? "PUT" : "POST";
      const response = await authenticatedFetch(url, authToken, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        logout();
        setFormError("Your session expired. Please log in again.");
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setFormError(extractErrorMessage(data, "Could not save the product."));
        return;
      }
      resetForm();
      loadProducts();
    } catch {
      setFormError("Could not connect to the server.");
    } finally {
      setFormSaving(false);
    }
  };

  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    setDeletingId(product.id);
    try {
      const response = await authenticatedFetch(`${API_BASE}/products/${product.id}`, authToken, {
        method: "DELETE",
      });
      if (response.status === 401) {
        logout();
        setProductsError("Your session expired. Please log in again.");
        return;
      }
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => null);
        setProductsError(extractErrorMessage(data, "Could not delete the product."));
        return;
      }
      if (editingId === product.id) resetForm();
      loadProducts();
    } finally {
      setDeletingId(null);
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

  if (!isAdmin) {
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

        <section className="bg-white border border-neutral-200 p-6 space-y-4">
          <h2 className="text-lg font-medium text-neutral-900">{editingId ? "Edit product" : "Add a product"}</h2>
          <form onSubmit={submitForm} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input required placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} />
            <input required placeholder="Brand" value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} className={inputClass} />
            <input required placeholder="Category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass} />
            <input required type="number" step="0.01" min="0.01" placeholder="Price" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className={inputClass} />
            <input required type="number" min="0" placeholder="Stock" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} className={inputClass} />
            <input type="number" step="0.1" min="0" max="5" placeholder="Rating (0-5)" value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })} className={inputClass} />
            <input required placeholder="Sizes (comma-separated)" value={form.sizes} onChange={(event) => setForm({ ...form, sizes: event.target.value })} className={`${inputClass} md:col-span-2`} />
            <input required placeholder="Colors (comma-separated)" value={form.colors} onChange={(event) => setForm({ ...form, colors: event.target.value })} className={`${inputClass} md:col-span-2`} />
            <input required placeholder="Image URL (e.g. /products/x.jpg)" value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} className={`${inputClass} md:col-span-2`} />
            <textarea placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${inputClass} md:col-span-2`} rows={2} />
            {formError && <p className="text-sm text-red-600 md:col-span-2">{formError}</p>}
            <div className="flex gap-3 md:col-span-2">
              <button type="submit" disabled={formSaving} className="bg-neutral-900 text-white px-4 py-2 text-sm uppercase tracking-wide disabled:opacity-60">
                {formSaving ? "Saving..." : editingId ? "Save changes" : "Add product"}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} className="px-4 py-2 text-sm underline">
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="bg-white border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-neutral-900">Products ({products.length})</h2>
            <button onClick={loadProducts} className="text-sm underline">Refresh</button>
          </div>
          {productsLoading && <p className="text-sm text-neutral-500">Loading...</p>}
          {!productsLoading && productsError && <p className="text-sm text-red-600">{productsError}</p>}
          {!productsLoading && !productsError && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-500 border-b border-neutral-200">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Price</th>
                    <th className="py-2 pr-4">Stock</th>
                    <th className="py-2 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-b border-neutral-100">
                      <td className="py-2 pr-4">{product.name}</td>
                      <td className="py-2 pr-4">{product.category}</td>
                      <td className="py-2 pr-4">${product.price.toFixed(2)}</td>
                      <td className="py-2 pr-4">{product.stock}</td>
                      <td className="py-2 pr-4 flex gap-3 whitespace-nowrap">
                        <button onClick={() => startEdit(product)} className="underline">Edit</button>
                        <button
                          onClick={() => deleteProduct(product)}
                          disabled={deletingId === product.id}
                          className="underline text-red-600 disabled:opacity-60"
                        >
                          {deletingId === product.id ? "Deleting..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

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
