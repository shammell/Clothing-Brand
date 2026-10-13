"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode, type SVGProps } from "react";
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

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500";
const cardClass = "bg-white rounded-xl border border-slate-200 shadow-sm p-6";
const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors";
const ghostButtonClass =
  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-60";
const iconButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors disabled:opacity-50";
const selectClass =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 disabled:opacity-60";

function formatAction(action: string): string {
  return action.replace(/_/g, " ");
}

function formatDetails(details: Record<string, unknown>): string {
  const entries = Object.entries(details);
  if (entries.length === 0) return "—";
  return entries.map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value)}`).join(", ");
}

type BadgeTone = "neutral" | "green" | "red" | "amber" | "blue" | "purple";

const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-blue-100 text-blue-700",
  purple: "bg-purple-100 text-purple-700",
};

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${BADGE_TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

const ORDER_STATUS_TONE: Record<string, BadgeTone> = {
  placed: "blue",
  processing: "amber",
  shipped: "purple",
  delivered: "green",
  cancelled: "red",
};

const ROLE_TONE: Record<UserSummary["role"], BadgeTone> = {
  admin: "purple",
  lister: "blue",
  customer: "neutral",
};

type IconProps = SVGProps<SVGSVGElement>;
const iconDefaults = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function IconGrid(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function IconBox(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
      <path d="M3.5 7.5 12 12l8.5-4.5" />
      <path d="M12 12v9" />
    </svg>
  );
}

function IconBag(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <path d="M6 7h12l1 13H5z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </svg>
  );
}

function IconUsers(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14c2.5.3 4.5 2.5 4.5 6" />
    </svg>
  );
}

function IconClipboard(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3h6v3H9z" />
      <path d="M8 10h8M8 14h8M8 18h5" />
    </svg>
  );
}

function IconLogout(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M16 16l4-4-4-4" />
      <path d="M20 12H9" />
    </svg>
  );
}

function IconSearch(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  );
}

function IconRefresh(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <path d="M3 11a9 9 0 0 1 15.3-5.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 13a9 9 0 0 1-15.3 5.3L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function IconLock(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function IconUnlock(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7-2.6" />
    </svg>
  );
}

const NAV_ICONS: Record<Tab, (props: IconProps) => ReactNode> = {
  overview: IconGrid,
  products: IconBox,
  orders: IconBag,
  users: IconUsers,
  audit: IconClipboard,
};

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
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <form
          className="w-full max-w-sm space-y-5 bg-white p-8 rounded-2xl shadow-sm border border-slate-200"
          onSubmit={(event) => { event.preventDefault(); login(); }}
        >
          <div className="space-y-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white font-semibold">T</div>
            <p role="heading" aria-level={1} className="text-xl font-semibold text-slate-900 pt-2">Admin sign in</p>
            <p className="text-sm text-slate-500">Thread&amp;Co administration</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="admin-email" className="block text-sm font-medium text-slate-700">Email address</label>
            <input
              id="admin-email"
              type="email"
              required
              placeholder="you@company.com"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="admin-password" className="block text-sm font-medium text-slate-700">Password</label>
            <input
              id="admin-password"
              type="password"
              required
              placeholder="••••••••"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              className={inputClass}
            />
          </div>
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <button type="submit" disabled={loginLoading} className={`${primaryButtonClass} w-full`}>
            {loginLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </main>
    );
  }

  if (!isAdminRole(role)) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center space-y-4 bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-sm">
          <p className="text-slate-700">Signed in as {currentUser}, but this account doesn&apos;t have admin access.</p>
          <button onClick={logout} className={ghostButtonClass}>Log out</button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col bg-white border-r border-slate-200">
        <div className="flex h-16 items-center gap-2 px-6 border-b border-slate-200">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white">T</span>
          <span className="font-semibold text-slate-900">Thread&amp;Co</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {TABS.map((item) => {
            const Icon = NAV_ICONS[item];
            const active = tab === item;
            return (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={
                  active
                    ? "flex w-full items-center gap-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700"
                    : "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                {TAB_LABELS[item]}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 px-3 py-4">
          <p className="truncate px-3 text-xs text-slate-500">Signed in as</p>
          <p className="mb-2 truncate px-3 text-sm font-medium text-slate-900">{currentUser}</p>
          <button onClick={logout} className={`${ghostButtonClass} w-full`}>
            <IconLogout className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      <div className="flex-1 md:ml-64">
        <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
          <div className="flex h-16 items-center justify-between px-4 md:px-8">
            <p role="heading" aria-level={1} className="text-lg font-semibold text-slate-900">{TAB_LABELS[tab]}</p>
            <div className="flex items-center gap-3 text-sm text-slate-500 md:hidden">
              <span className="max-w-[120px] truncate">{currentUser}</span>
              <button onClick={logout} className={iconButtonClass} title="Log out">
                <IconLogout className="h-5 w-5" />
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 md:hidden">
            {TABS.map((item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={
                  tab === item
                    ? "whitespace-nowrap border-b-2 border-indigo-600 px-3 py-2.5 text-sm font-medium text-indigo-700"
                    : "whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm text-slate-500 hover:text-slate-900"
                }
              >
                {TAB_LABELS[item]}
              </button>
            ))}
          </nav>
        </header>

        <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-8">
          {tab === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatCard icon={IconBag} label="Revenue" value={`$${stats.revenue.toFixed(2)}`} />
                <StatCard icon={IconBox} label="Orders" value={orders.length} sub={`${stats.openOrders} open`} />
                <StatCard icon={IconUsers} label="Users" value={users.length} sub={`${stats.blockedUsers} blocked`} />
                <StatCard icon={IconGrid} label="Products" value={productCount ?? "—"} />
              </div>

              <section className={cardClass}>
                <div className="mb-4 flex items-center justify-between">
                  <p role="heading" aria-level={2} className="text-base font-semibold text-slate-900">Recent orders</p>
                  <button onClick={() => setTab("orders")} className={ghostButtonClass}>View all</button>
                </div>
                {ordersLoading && <p className="text-sm text-slate-500">Loading...</p>}
                {!ordersLoading && orders.length === 0 && <p className="text-sm text-slate-500">No orders yet.</p>}
                {!ordersLoading && orders.length > 0 && (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {orders.slice(0, 5).map((order) => (
                      <li key={order.id} className="flex items-center justify-between gap-3 py-3">
                        <span className="text-slate-700">
                          {order.shipping_address?.full_name ?? "Unknown"} · {new Date(order.created_at).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-3">
                          <Badge tone={ORDER_STATUS_TONE[order.status] ?? "neutral"}>{order.status}</Badge>
                          <span className="font-medium text-slate-900">${order.total.toFixed(2)}</span>
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
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p role="heading" aria-level={2} className="text-base font-semibold text-slate-900">Orders ({filteredOrders.length})</p>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      placeholder="Search by order id or name"
                      value={orderSearch}
                      onChange={(event) => setOrderSearch(event.target.value)}
                      className={`${inputClass} w-56 pl-8`}
                    />
                  </div>
                  <select
                    value={orderStatusFilter}
                    onChange={(event) => setOrderStatusFilter(event.target.value as typeof orderStatusFilter)}
                    className={selectClass}
                  >
                    {ORDER_FILTERS.map((status) => (
                      <option key={status} value={status}>{status === "all" ? "All statuses" : status}</option>
                    ))}
                  </select>
                  <button onClick={loadOrders} className={iconButtonClass} title="Refresh orders">
                    <IconRefresh className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {ordersLoading && <p className="text-sm text-slate-500">Loading...</p>}
              {!ordersLoading && ordersError && <p className="text-sm text-red-600">{ordersError}</p>}
              {!ordersLoading && !ordersError && orderActionError && (
                <p className="mb-3 text-sm text-red-600">{orderActionError}</p>
              )}
              {!ordersLoading && !ordersError && filteredOrders.length === 0 && (
                <p className="text-sm text-slate-500">{orders.length === 0 ? "No orders yet." : "No orders match your filters."}</p>
              )}
              {!ordersLoading && !ordersError && filteredOrders.length > 0 && (
                <div className="space-y-4">
                  {filteredOrders.map((order) => (
                    <div key={order.id} className="rounded-xl border border-slate-200 p-4 text-sm">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-slate-500">{new Date(order.created_at).toLocaleString()}</span>
                          {order.shipping_address && (
                            <span className="text-slate-700">
                              {order.shipping_address.full_name} · {order.shipping_address.city}, {order.shipping_address.country}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={ORDER_STATUS_TONE[order.status] ?? "neutral"}>{order.status}</Badge>
                          <select
                            value={order.status}
                            disabled={updatingOrderId === order.id}
                            onChange={(event) => updateOrderStatus(order.id, event.target.value)}
                            className={selectClass}
                          >
                            {ORDER_STATUSES.map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <ul className="mb-2 space-y-1">
                        {order.items.map((item) => (
                          <li key={`${item.product_id}-${item.size}-${item.color}`} className="flex justify-between text-slate-700">
                            <span>{item.quantity}× {item.name} ({item.size}{item.color ? `, ${item.color}` : ""})</span>
                            <span>${item.subtotal.toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex justify-between border-t border-slate-100 pt-2 font-medium text-slate-900">
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
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p role="heading" aria-level={2} className="text-base font-semibold text-slate-900">Users ({filteredUsers.length})</p>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      placeholder="Search by username or email"
                      value={userSearch}
                      onChange={(event) => setUserSearch(event.target.value)}
                      className={`${inputClass} w-56 pl-8`}
                    />
                  </div>
                  <select
                    value={userRoleFilter}
                    onChange={(event) => setUserRoleFilter(event.target.value as typeof userRoleFilter)}
                    className={selectClass}
                  >
                    {USER_ROLE_FILTERS.map((roleOption) => (
                      <option key={roleOption} value={roleOption}>{roleOption === "all" ? "All roles" : roleOption}</option>
                    ))}
                  </select>
                  <button onClick={loadUsers} className={iconButtonClass} title="Refresh users">
                    <IconRefresh className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {usersLoading && <p className="text-sm text-slate-500">Loading...</p>}
              {!usersLoading && usersError && <p className="text-sm text-red-600">{usersError}</p>}
              {!usersLoading && !usersError && userActionError && (
                <p className="mb-3 text-sm text-red-600">{userActionError}</p>
              )}
              {!usersLoading && !usersError && filteredUsers.length === 0 && (
                <p className="text-sm text-slate-500">{users.length === 0 ? "No users yet." : "No users match your filters."}</p>
              )}
              {!usersLoading && !usersError && filteredUsers.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-2 pr-4 font-medium">Username</th>
                        <th className="py-2 pr-4 font-medium">Email</th>
                        <th className="py-2 pr-4 font-medium">Role</th>
                        <th className="py-2 pr-4 font-medium">Status</th>
                        <th className="py-2 pr-4 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2.5 pr-4 text-slate-900">{user.username}</td>
                          <td className="py-2.5 pr-4 text-slate-600">{user.email}</td>
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-2">
                              <Badge tone={ROLE_TONE[user.role]}>{user.role}</Badge>
                              <select
                                value={user.role}
                                disabled={updatingUserId === user.id}
                                onChange={(event) => {
                                  const nextRole = event.target.value;
                                  if (nextRole === user.role) return;
                                  if (!window.confirm(`Change ${user.username}'s role to "${nextRole}"?`)) return;
                                  updateUserRole(user.id, nextRole);
                                }}
                                className={selectClass}
                              >
                                {ROLES.map((roleOption) => (
                                  <option key={roleOption} value={roleOption}>{roleOption}</option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="py-2.5 pr-4">
                            <Badge tone={user.is_blocked ? "red" : "green"}>{user.is_blocked ? "Blocked" : "Active"}</Badge>
                          </td>
                          <td className="py-2.5 pr-4">
                            <button
                              onClick={() => {
                                const next = !user.is_blocked;
                                const verb = next ? "Block" : "Unblock";
                                if (!window.confirm(`${verb} ${user.username}?`)) return;
                                updateUserBlock(user.id, next);
                              }}
                              disabled={updatingUserId === user.id}
                              className={iconButtonClass}
                              title={user.is_blocked ? "Unblock user" : "Block user"}
                            >
                              {user.is_blocked ? <IconUnlock className="h-4 w-4" /> : <IconLock className="h-4 w-4" />}
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
              <div className="mb-4 flex items-center justify-between">
                <p role="heading" aria-level={2} className="text-base font-semibold text-slate-900">Audit log</p>
                <button onClick={loadAuditLog} className={iconButtonClass} title="Refresh audit log">
                  <IconRefresh className="h-4 w-4" />
                </button>
              </div>
              {auditLoading && <p className="text-sm text-slate-500">Loading...</p>}
              {!auditLoading && auditError && <p className="text-sm text-red-600">{auditError}</p>}
              {!auditLoading && !auditError && auditEntries.length === 0 && (
                <p className="text-sm text-slate-500">No admin actions recorded yet.</p>
              )}
              {!auditLoading && !auditError && auditEntries.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-2 pr-4 font-medium">When</th>
                        <th className="py-2 pr-4 font-medium">Actor</th>
                        <th className="py-2 pr-4 font-medium">Action</th>
                        <th className="py-2 pr-4 font-medium">Target</th>
                        <th className="py-2 pr-4 font-medium">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditEntries.map((entry) => (
                        <tr key={entry.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                          <td className="whitespace-nowrap py-2.5 pr-4 text-slate-500">{new Date(entry.created_at).toLocaleString()}</td>
                          <td className="py-2.5 pr-4 text-slate-900">{usernameById.get(entry.actor_id) ?? entry.actor_id}</td>
                          <td className="py-2.5 pr-4"><Badge>{formatAction(entry.action)}</Badge></td>
                          <td className="py-2.5 pr-4 text-slate-900">{usernameById.get(entry.target_user_id) ?? entry.target_user_id}</td>
                          <td className="py-2.5 pr-4 text-slate-600">{formatDetails(entry.details)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: (props: IconProps) => ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
