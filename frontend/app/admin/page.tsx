"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
const ORDER_FILTERS = ["all", ...ORDER_STATUSES] as const;
const OPEN_ORDER_STATUSES = new Set(["placed", "processing"]);

type UserSummary = {
  id: string;
  username: string;
  email: string;
  role: "customer" | "lister" | "admin";
  is_blocked: boolean;
  created_at: string;
};

const ROLES = ["customer", "lister", "admin"] as const;
const USER_ROLE_FILTERS = ["all", ...ROLES] as const;

type Product = { id: string };

type AuditLogEntry = {
  id: string;
  actor_id: string;
  action: string;
  target_user_id: string;
  details: Record<string, unknown>;
  created_at: string;
};

const TABS = ["overview", "products", "orders", "users", "audit"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  products: "Products",
  orders: "Orders",
  users: "Users",
  audit: "Audit log",
};

const inputClass = "border border-neutral-300 px-3 py-2 text-sm w-full";
const cardClass = "bg-white border border-neutral-200 p-6";

function formatAction(action: string): string {
  return action.replace(/_/g, " ");
}

function formatDetails(details: Record<string, unknown>): string {
  const entries = Object.entries(details);
  if (entries.length === 0) return "—";
  return entries.map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value)}`).join(", ");
}

export default function AdminPage() {
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);
  const authToken = useSyncExternalStore(subscribeToStorage, getAuthTokenSnapshot, getAuthServerSnapshot);
  const role = useSyncExternalStore(subscribeToStorage, getRoleSnapshot, getRoleServerSnapshot);

  const [tab, setTab] = useState<Tab>("overview");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [productCount, setProductCount] = useState<number | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [orderActionError, setOrderActionError] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<(typeof ORDER_FILTERS)[number]>("all");
  const [orderSearch, setOrderSearch] = useState("");

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [userActionError, setUserActionError] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [userRoleFilter, setUserRoleFilter] = useState<(typeof USER_ROLE_FILTERS)[number]>("all");
  const [userSearch, setUserSearch] = useState("");

  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditLoaded, setAuditLoaded] = useState(false);

  const logout = () => writeAuth("", "");

  const usernameById = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((user) => map.set(user.id, user.username));
    return map;
  }, [users]);

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError("");
    try {
      const response = await authenticatedFetch(`${API_BASE}/users/`, authToken);
      if (response.status === 401) {
        logout();
        setUsersError("Your session expired. Please log in again.");
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setUsersError(extractErrorMessage(data, "Could not load users."));
        return;
      }
      setUsers(data as UserSummary[]);
    } catch {
      setUsersError("Could not connect to the server.");
    } finally {
      setUsersLoading(false);
    }
  };

  const updateUserRole = async (userId: string, nextRole: string) => {
    setUpdatingUserId(userId);
    setUserActionError("");
    try {
      const response = await authenticatedFetch(`${API_BASE}/users/${userId}/role`, authToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = await response.json();
      if (!response.ok) {
        // Covers the self-demotion 400 from the backend - surfaced here
        // rather than pre-disabled client-side (see plan's Global Constraints).
        // A failed action is reported through userActionError, not
        // usersError - the latter gates whether the table itself renders,
        // and a rejected single-row update must not blank out the whole
        // list the admin is looking at.
        setUserActionError(extractErrorMessage(data, "Could not update role."));
        return;
      }
      setUsers((current) => current.map((user) => (user.id === userId ? (data as UserSummary) : user)));
    } catch {
      setUserActionError("Could not connect to the server.");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const updateUserBlock = async (userId: string, isBlocked: boolean) => {
    setUpdatingUserId(userId);
    setUserActionError("");
    try {
      const response = await authenticatedFetch(`${API_BASE}/users/${userId}/block`, authToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_blocked: isBlocked }),
      });
      const data = await response.json();
      if (!response.ok) {
        setUserActionError(extractErrorMessage(data, "Could not update block status."));
        return;
      }
      setUsers((current) => current.map((user) => (user.id === userId ? (data as UserSummary) : user)));
    } catch {
      setUserActionError("Could not connect to the server.");
    } finally {
      setUpdatingUserId(null);
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
    setOrderActionError("");
    try {
      const response = await authenticatedFetch(`${API_BASE}/orders/${orderId}/status`, authToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (response.status === 401) {
        logout();
        setOrderActionError("Your session expired. Please log in again.");
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        // See updateUserRole's comment: action failures go through
        // orderActionError so a single rejected update doesn't blank out
        // the whole order list.
        setOrderActionError(extractErrorMessage(data, "Could not update order status."));
        return;
      }
      setOrders((current) => current.map((order) => (order.id === orderId ? (data as Order) : order)));
    } catch {
      setOrderActionError("Could not connect to the server.");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const loadAuditLog = async () => {
    setAuditLoading(true);
    setAuditError("");
    try {
      const response = await authenticatedFetch(`${API_BASE}/users/audit-log`, authToken);
      if (response.status === 401) {
        logout();
        setAuditError("Your session expired. Please log in again.");
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setAuditError(extractErrorMessage(data, "Could not load the audit log."));
        return;
      }
      setAuditEntries(data as AuditLogEntry[]);
      setAuditLoaded(true);
    } catch {
      setAuditError("Could not connect to the server.");
    } finally {
      setAuditLoading(false);
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
    loadUsers();
    // loadOrders/loadUsers are intentionally omitted: they're plain
    // functions recreated every render, not memoized, so including them
    // would re-run this effect (and re-fetch) on every render instead of
    // only when admin access is first confirmed - role is the only actual
    // trigger this effect cares about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    // Audit log is fetched lazily, the first time that tab is opened, rather
    // than alongside orders/users above - it's the least-visited tab and the
    // data (who changed what role/block) is only useful once someone's
    // actually looking at it.
    if (tab === "audit" && !auditLoaded && !auditLoading && isAdminRole(role)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadAuditLog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, role]);

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

  const filteredOrders = useMemo(() => {
    const query = orderSearch.trim().toLowerCase();
    return orders.filter((order) => {
      if (orderStatusFilter !== "all" && order.status !== orderStatusFilter) return false;
      if (!query) return true;
      const haystack = `${order.id} ${order.shipping_address?.full_name ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [orders, orderStatusFilter, orderSearch]);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return users.filter((user) => {
      if (userRoleFilter !== "all" && user.role !== userRoleFilter) return false;
      if (!query) return true;
      return `${user.username} ${user.email}`.toLowerCase().includes(query);
    });
  }, [users, userRoleFilter, userSearch]);

  const stats = useMemo(() => {
    const revenue = orders.reduce((sum, order) => sum + order.total, 0);
    const openOrders = orders.filter((order) => OPEN_ORDER_STATUSES.has(order.status)).length;
    const blockedUsers = users.filter((user) => user.is_blocked).length;
    return { revenue, openOrders, blockedUsers };
  }, [orders, users]);

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
    <main className="min-h-screen bg-neutral-50">
      <header className="bg-neutral-900 text-white">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-5 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Thread&amp;Co admin</h1>
          <div className="flex items-center gap-4 text-sm text-neutral-300">
            <span>Signed in as {currentUser}</span>
            <button onClick={logout} className="underline text-white">Log out</button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-6 md:px-10 flex gap-1 overflow-x-auto">
          {TABS.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={
                tab === item
                  ? "px-4 py-3 text-sm font-medium text-white border-b-2 border-white whitespace-nowrap"
                  : "px-4 py-3 text-sm text-neutral-400 border-b-2 border-transparent hover:text-neutral-200 whitespace-nowrap"
              }
            >
              {TAB_LABELS[item]}
            </button>
          ))}
        </nav>
      </header>

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-8 space-y-8">
        {tab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Revenue" value={`$${stats.revenue.toFixed(2)}`} />
              <StatCard label="Orders" value={orders.length} sub={`${stats.openOrders} open`} />
              <StatCard label="Users" value={users.length} sub={`${stats.blockedUsers} blocked`} />
              <StatCard label="Products" value={productCount ?? "—"} />
            </div>

            <section className={cardClass}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-neutral-900">Recent orders</h2>
                <button onClick={() => setTab("orders")} className="text-sm underline">View all</button>
              </div>
              {ordersLoading && <p className="text-sm text-neutral-500">Loading...</p>}
              {!ordersLoading && orders.length === 0 && <p className="text-sm text-neutral-500">No orders yet.</p>}
              {!ordersLoading && orders.length > 0 && (
                <ul className="divide-y divide-neutral-100 text-sm">
                  {orders.slice(0, 5).map((order) => (
                    <li key={order.id} className="py-2 flex items-center justify-between gap-3">
                      <span className="text-neutral-700">
                        {order.shipping_address?.full_name ?? "Unknown"} · {new Date(order.created_at).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="uppercase text-xs tracking-wide text-neutral-500">{order.status}</span>
                        <span className="font-medium">${order.total.toFixed(2)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {tab === "products" && (
          <ProductManager
            authToken={authToken}
            onSessionExpired={logout}
            onProductsChange={(products: Product[]) => setProductCount(products.length)}
          />
        )}

        {tab === "orders" && (
          <section className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-medium text-neutral-900">Orders ({filteredOrders.length})</h2>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  placeholder="Search by order id or name"
                  value={orderSearch}
                  onChange={(event) => setOrderSearch(event.target.value)}
                  className="border border-neutral-300 px-3 py-1.5 text-sm"
                />
                <select
                  value={orderStatusFilter}
                  onChange={(event) => setOrderStatusFilter(event.target.value as typeof orderStatusFilter)}
                  className="border border-neutral-300 px-2 py-1.5 text-sm"
                >
                  {ORDER_FILTERS.map((status) => (
                    <option key={status} value={status}>{status === "all" ? "All statuses" : status}</option>
                  ))}
                </select>
                <button onClick={loadOrders} className="text-sm underline">Refresh</button>
              </div>
            </div>
            {ordersLoading && <p className="text-sm text-neutral-500">Loading...</p>}
            {!ordersLoading && ordersError && <p className="text-sm text-red-600">{ordersError}</p>}
            {!ordersLoading && !ordersError && orderActionError && (
              <p className="text-sm text-red-600 mb-3">{orderActionError}</p>
            )}
            {!ordersLoading && !ordersError && filteredOrders.length === 0 && (
              <p className="text-sm text-neutral-500">{orders.length === 0 ? "No orders yet." : "No orders match your filters."}</p>
            )}
            {!ordersLoading && !ordersError && filteredOrders.length > 0 && (
              <div className="space-y-4">
                {filteredOrders.map((order) => (
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
        )}

        {tab === "users" && (
          <section className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-medium text-neutral-900">Users ({filteredUsers.length})</h2>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  placeholder="Search by username or email"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  className="border border-neutral-300 px-3 py-1.5 text-sm"
                />
                <select
                  value={userRoleFilter}
                  onChange={(event) => setUserRoleFilter(event.target.value as typeof userRoleFilter)}
                  className="border border-neutral-300 px-2 py-1.5 text-sm"
                >
                  {USER_ROLE_FILTERS.map((roleOption) => (
                    <option key={roleOption} value={roleOption}>{roleOption === "all" ? "All roles" : roleOption}</option>
                  ))}
                </select>
                <button onClick={loadUsers} className="text-sm underline">Refresh</button>
              </div>
            </div>
            {usersLoading && <p className="text-sm text-neutral-500">Loading...</p>}
            {!usersLoading && usersError && <p className="text-sm text-red-600">{usersError}</p>}
            {!usersLoading && !usersError && userActionError && (
              <p className="text-sm text-red-600 mb-3">{userActionError}</p>
            )}
            {!usersLoading && !usersError && filteredUsers.length === 0 && (
              <p className="text-sm text-neutral-500">{users.length === 0 ? "No users yet." : "No users match your filters."}</p>
            )}
            {!usersLoading && !usersError && filteredUsers.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-neutral-500 border-b border-neutral-200">
                      <th className="py-2 pr-4">Username</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Role</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="border-b border-neutral-100">
                        <td className="py-2 pr-4">{user.username}</td>
                        <td className="py-2 pr-4">{user.email}</td>
                        <td className="py-2 pr-4">
                          <select
                            value={user.role}
                            disabled={updatingUserId === user.id}
                            onChange={(event) => {
                              const nextRole = event.target.value;
                              if (nextRole === user.role) return;
                              if (!window.confirm(`Change ${user.username}'s role to "${nextRole}"?`)) return;
                              updateUserRole(user.id, nextRole);
                            }}
                            className="border border-neutral-300 px-2 py-1 text-sm disabled:opacity-60"
                          >
                            {ROLES.map((roleOption) => (
                              <option key={roleOption} value={roleOption}>{roleOption}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          <span className={user.is_blocked ? "text-red-600 font-medium" : "text-neutral-500"}>
                            {user.is_blocked ? "Blocked" : "Active"}
                          </span>
                        </td>
                        <td className="py-2 pr-4">
                          <button
                            onClick={() => {
                              const next = !user.is_blocked;
                              const verb = next ? "Block" : "Unblock";
                              if (!window.confirm(`${verb} ${user.username}?`)) return;
                              updateUserBlock(user.id, next);
                            }}
                            disabled={updatingUserId === user.id}
                            className="underline disabled:opacity-60"
                          >
                            {user.is_blocked ? "Unblock" : "Block"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === "audit" && (
          <section className={cardClass}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-neutral-900">Audit log</h2>
              <button onClick={loadAuditLog} className="text-sm underline">Refresh</button>
            </div>
            {auditLoading && <p className="text-sm text-neutral-500">Loading...</p>}
            {!auditLoading && auditError && <p className="text-sm text-red-600">{auditError}</p>}
            {!auditLoading && !auditError && auditEntries.length === 0 && (
              <p className="text-sm text-neutral-500">No admin actions recorded yet.</p>
            )}
            {!auditLoading && !auditError && auditEntries.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-neutral-500 border-b border-neutral-200">
                      <th className="py-2 pr-4">When</th>
                      <th className="py-2 pr-4">Actor</th>
                      <th className="py-2 pr-4">Action</th>
                      <th className="py-2 pr-4">Target</th>
                      <th className="py-2 pr-4">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditEntries.map((entry) => (
                      <tr key={entry.id} className="border-b border-neutral-100 align-top">
                        <td className="py-2 pr-4 whitespace-nowrap text-neutral-500">{new Date(entry.created_at).toLocaleString()}</td>
                        <td className="py-2 pr-4">{usernameById.get(entry.actor_id) ?? entry.actor_id}</td>
                        <td className="py-2 pr-4 capitalize">{formatAction(entry.action)}</td>
                        <td className="py-2 pr-4">{usernameById.get(entry.target_user_id) ?? entry.target_user_id}</td>
                        <td className="py-2 pr-4 text-neutral-600">{formatDetails(entry.details)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className={cardClass}>
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="text-2xl font-semibold text-neutral-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-neutral-500 mt-1">{sub}</p>}
    </div>
  );
}
