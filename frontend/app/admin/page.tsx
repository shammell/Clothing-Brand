"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { AdminLogin, AccessDenied } from "./_components/AdminLogin";
import { OverviewTab } from "./_components/OverviewTab";
import { OrdersTab, type OrderFilter } from "./_components/OrdersTab";
import { UsersTab } from "./_components/UsersTab";
import { AuditTab } from "./_components/AuditTab";
import { useConfirm } from "./_components/ConfirmDialog";
import { useToast } from "./_components/Toast";
import {
  API_BASE,
  Avatar,
  Badge,
  IconLogout,
  IconRefresh,
  NAV_ICONS,
  TABS,
  TAB_LABELS,
  TAB_SUBTITLES,
  computeStats,
  focusRing,
  formatRelative,
  ghostButtonClass,
  iconButtonClass,
  shortId,
  type AdminProduct,
  type AuditLogEntry,
  type Order,
  type Tab,
  type UserSummary,
} from "./_components/ui";

const SESSION_EXPIRED = "Your session expired. Sign in again to continue.";

function tabFromHash(): Tab {
  if (typeof window === "undefined") return "overview";
  const hash = window.location.hash.replace("#", "");
  return (TABS as readonly string[]).includes(hash) ? (hash as Tab) : "overview";
}

export default function AdminPage() {
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);
  const authToken = useSyncExternalStore(subscribeToStorage, getAuthTokenSnapshot, getAuthServerSnapshot);
  const role = useSyncExternalStore(subscribeToStorage, getRoleSnapshot, getRoleServerSnapshot);

  const { confirm, dialog: confirmDialog } = useConfirm();
  const { notify, toaster } = useToast();
  const mainRef = useRef<HTMLElement>(null);

  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [ordersNav, setOrdersNav] = useState<{ filter: OrderFilter; expandedId: string | null }>({ filter: "all", expandedId: null });
  const [productsKey, setProductsKey] = useState(0);
  const [sessionNotice, setSessionNotice] = useState("");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const [products, setProducts] = useState<AdminProduct[] | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [orderActionError, setOrderActionError] = useState("");

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [userActionError, setUserActionError] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditLoaded, setAuditLoaded] = useState(false);

  const logout = (reason = "") => {
    setSessionNotice(reason);
    writeAuth("", "");
  };
  const expire = () => logout(SESSION_EXPIRED);

  const goTo = (next: Tab, nav?: { filter?: OrderFilter; expandedId?: string }) => {
    setOrdersNav({ filter: nav?.filter ?? "all", expandedId: nav?.expandedId ?? null });
    setTab(next);
    window.history.replaceState(null, "", `#${next}`);
  };

  const usernameById = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((user) => map.set(user.id, user.username));
    return map;
  }, [users]);

  const stats = useMemo(() => computeStats(orders, users), [orders, users]);

  const touch = () => setLastUpdated(Date.now());

  const loadProducts = async () => {
    try {
      const response = await fetch(`${API_BASE}/products/`);
      if (!response.ok) return;
      setProducts((await response.json()) as AdminProduct[]);
    } catch {
      /* KPI falls back to the placeholder; the Products tab reports its own errors */
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError("");
    try {
      const response = await authenticatedFetch(`${API_BASE}/users/`, authToken);
      if (response.status === 401) {
        expire();
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setUsersError(extractErrorMessage(data, "Could not load users."));
        return;
      }
      setUsers(data as UserSummary[]);
      touch();
    } catch {
      setUsersError("Could not connect to the server.");
    } finally {
      setUsersLoading(false);
    }
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const response = await authenticatedFetch(`${API_BASE}/orders/`, authToken);
      if (response.status === 401) {
        expire();
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setOrdersError(extractErrorMessage(data, "Could not load orders."));
        return;
      }
      setOrders(data as Order[]);
      touch();
    } catch {
      setOrdersError("Could not connect to the server.");
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadAuditLog = async () => {
    setAuditLoading(true);
    setAuditError("");
    try {
      const response = await authenticatedFetch(`${API_BASE}/users/audit-log`, authToken);
      if (response.status === 401) {
        expire();
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setAuditError(extractErrorMessage(data, "Could not load the audit log."));
        return;
      }
      setAuditEntries(data as AuditLogEntry[]);
      setAuditLoaded(true);
      touch();
    } catch {
      setAuditError("Could not connect to the server.");
    } finally {
      setAuditLoading(false);
    }
  };

  // Action failures go through *ActionError, not *Error: the latter gates
  // whether the list renders, and one rejected row update must not blank it.
  const changeOrderStatus = async (order: Order, status: string) => {
    if (status === order.status) return;
    if (status === "cancelled") {
      const ok = await confirm({
        title: `Cancel order #${shortId(order.id)}?`,
        body: "The items go back into stock.",
        confirmLabel: "Cancel order",
        tone: "danger",
      });
      if (!ok) return;
    }
    setUpdatingOrderId(order.id);
    setOrderActionError("");
    try {
      const response = await authenticatedFetch(`${API_BASE}/orders/${order.id}/status`, authToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (response.status === 401) {
        expire();
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setOrderActionError(extractErrorMessage(data, "Could not update order status."));
        return;
      }
      setOrders((current) => current.map((item) => (item.id === order.id ? (data as Order) : item)));
      notify(`Order #${shortId(order.id)} marked ${status}`);
    } catch {
      setOrderActionError("Could not connect to the server.");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const patchUser = async (user: UserSummary, path: "role" | "block", body: object, failure: string, success: string) => {
    setUpdatingUserId(user.id);
    setUserActionError("");
    try {
      const response = await authenticatedFetch(`${API_BASE}/users/${user.id}/${path}`, authToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        // Covers the self-demotion 400 from the backend: surfaced, not pre-disabled.
        setUserActionError(extractErrorMessage(data, failure));
        return;
      }
      setUsers((current) => current.map((item) => (item.id === user.id ? (data as UserSummary) : item)));
      notify(success);
    } catch {
      setUserActionError("Could not connect to the server.");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const changeUserRole = async (user: UserSummary, nextRole: string) => {
    if (nextRole === user.role) return;
    const ok = await confirm({
      title: `Change ${user.username}'s role?`,
      body: `${user.role} → ${nextRole}. Their permissions change immediately.`,
      confirmLabel: "Change role",
    });
    if (!ok) return;
    await patchUser(user, "role", { role: nextRole }, "Could not update role.", `${user.username} is now ${nextRole}`);
  };

  const changeUserBlock = async (user: UserSummary, nextBlocked: boolean) => {
    const ok = await confirm({
      title: `${nextBlocked ? "Block" : "Unblock"} ${user.username}?`,
      body: nextBlocked
        ? "They'll be signed out of protected actions immediately."
        : "They'll be able to sign in and order again.",
      confirmLabel: nextBlocked ? "Block" : "Unblock",
      tone: nextBlocked ? "danger" : "default",
    });
    if (!ok) return;
    await patchUser(
      user,
      "block",
      { is_blocked: nextBlocked },
      "Could not update block status.",
      `${user.username} ${nextBlocked ? "blocked" : "unblocked"}`
    );
  };

  useEffect(() => {
    if (!isAdminRole(role)) return;
    // Plain data-fetch effect (load admin data once admin access is
    // confirmed): a valid use of useEffect, not derived state. The load
    // functions are recreated every render, so they are deliberately omitted -
    // role is the only trigger this effect cares about.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrders();
    loadUsers();
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    // Audit log is fetched lazily, the first time that tab is opened: it is
    // the least-visited tab.
    if (tab === "audit" && !auditLoaded && !auditLoading && isAdminRole(role)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadAuditLog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, role]);

  useEffect(() => {
    // Back/forward and manual hash edits switch tabs too.
    const onHashChange = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    // Re-render once a minute so "Updated Xm ago" stays honest.
    const timer = setInterval(() => setTick((value) => value + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const reloadCurrent = useCallback(() => {
    if (tab === "overview") {
      loadOrders();
      loadUsers();
      loadProducts();
    } else if (tab === "products") {
      setProductsKey((value) => value + 1);
      loadProducts();
    } else if (tab === "orders") loadOrders();
    else if (tab === "users") loadUsers();
    else loadAuditLog();
    // load* are plain per-render functions; the current tab is the real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authToken]);

  if (!currentUser) return <AdminLogin sessionNotice={sessionNotice} />;
  if (!isAdminRole(role)) return <AccessDenied username={currentUser} role={role} onSwitch={() => logout()} />;

  const openOrderCount = stats.openOrders;
  const navBadge = (item: Tab): number => (item === "orders" ? openOrderCount : item === "users" ? stats.blockedUsers : 0);

  const renderNavButton = (item: Tab, layout: "side" | "top") => {
    const Icon = NAV_ICONS[item];
    const active = tab === item;
    const count = navBadge(item);
    const base =
      layout === "side"
        ? `flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm ${
            active ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-100"
          }`
        : `flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${
            active ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-900"
          }`;
    return (
      <button key={item} type="button" onClick={() => goTo(item)} aria-current={active ? "page" : undefined} className={`${base} ${focusRing}`}>
        {layout === "side" && <Icon className="h-5 w-5 shrink-0" />}
        {TAB_LABELS[item]}
        {count > 0 && (
          <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-700">{count}</span>
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <a
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg"
      >
        Skip to content
      </a>

      <aside className="hidden bg-white md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col md:border-r md:border-slate-200">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white">T</span>
          <span className="font-semibold text-slate-900">Thread&amp;Co</span>
        </div>
        <nav aria-label="Admin sections" className="flex-1 space-y-1 px-3 py-4">
          {TABS.map((item) => renderNavButton(item, "side"))}
        </nav>
        <div className="space-y-2 border-t border-slate-200 px-3 py-4">
          <div className="flex items-center gap-3 px-3">
            <Avatar name={currentUser} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{currentUser}</p>
              <Badge tone="purple">Admin</Badge>
            </div>
          </div>
          <Link href="/" className={`${ghostButtonClass} w-full`}>View store ↗</Link>
          <button type="button" onClick={() => logout()} className={`${ghostButtonClass} w-full`}>
            <IconLogout className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      <div className="flex-1 md:ml-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-8">
            <div className="min-w-0">
              <p role="heading" aria-level={1} className="truncate text-lg font-semibold text-slate-900">{TAB_LABELS[tab]}</p>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{TAB_SUBTITLES[tab]}</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              {lastUpdated && (
                <span className="hidden sm:inline" title={new Date(lastUpdated).toLocaleString()}>
                  Updated {formatRelative(new Date(lastUpdated).toISOString())}
                </span>
              )}
              <button type="button" onClick={reloadCurrent} className={iconButtonClass} title="Refresh" aria-label={`Refresh ${TAB_LABELS[tab]}`}>
                <IconRefresh className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => logout()} className={`${iconButtonClass} md:hidden`} title="Log out" aria-label="Log out">
                <IconLogout className="h-5 w-5" />
              </button>
            </div>
          </div>
          <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 md:hidden">
            {TABS.map((item) => renderNavButton(item, "top"))}
          </nav>
        </header>

        <main id="main-content" ref={mainRef} tabIndex={-1} className="mx-auto max-w-6xl space-y-6 px-4 py-6 outline-none md:px-8 md:py-8">
          {tab === "overview" && (
            <OverviewTab
              orders={orders}
              users={users}
              products={products}
              stats={stats}
              ordersLoading={ordersLoading}
              onNavigate={(next, filter) => goTo(next, filter ? { filter: filter as OrderFilter } : undefined)}
              onOpenOrder={(orderId) => goTo("orders", { expandedId: orderId })}
            />
          )}

          {tab === "products" && (
            <ProductManager
              key={productsKey}
              authToken={authToken}
              onSessionExpired={expire}
              onProductsChange={(list) => {
                setProducts(list);
                touch();
              }}
              confirm={confirm}
              notify={notify}
            />
          )}

          {tab === "orders" && (
            <OrdersTab
              orders={orders}
              loading={ordersLoading}
              error={ordersError}
              actionError={orderActionError}
              updatingOrderId={updatingOrderId}
              initialFilter={ordersNav.filter}
              initialExpandedId={ordersNav.expandedId}
              onReload={loadOrders}
              onStatusChange={changeOrderStatus}
              onCopied={() => notify("Order id copied")}
            />
          )}

          {tab === "users" && (
            <UsersTab
              users={users}
              loading={usersLoading}
              error={usersError}
              actionError={userActionError}
              updatingUserId={updatingUserId}
              currentUsername={currentUser}
              onReload={loadUsers}
              onRoleChange={changeUserRole}
              onBlockChange={changeUserBlock}
            />
          )}

          {tab === "audit" && (
            <AuditTab entries={auditEntries} loading={auditLoading} error={auditError} usernameById={usernameById} onReload={loadAuditLog} />
          )}
        </main>
      </div>

      {confirmDialog}
      {toaster}
    </div>
  );
}
