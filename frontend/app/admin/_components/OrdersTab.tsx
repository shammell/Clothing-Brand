"use client";

import { useMemo, useState } from "react";
import { TableSkeleton } from "@/components/TableSkeleton";
import {
  Badge,
  EmptyState,
  ErrorBanner,
  FilterPills,
  IconBag,
  IconChevronRight,
  IconCopy,
  IconRefresh,
  IconSearch,
  OPEN_ORDER_STATUSES,
  ORDER_STATUSES,
  ORDER_STATUS_TONE,
  cardClass,
  focusRing,
  formatMoney,
  formatRelative,
  ghostButtonClass,
  iconButtonClass,
  inputClass,
  selectClass,
  shortId,
  type Order,
} from "./ui";

const ORDER_FILTERS = ["all", "open", ...ORDER_STATUSES] as const;
export type OrderFilter = (typeof ORDER_FILTERS)[number];
const ORDER_SORTS = ["newest", "oldest", "total-desc", "total-asc"] as const;
const ORDER_SORT_LABELS: Record<(typeof ORDER_SORTS)[number], string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  "total-desc": "Highest total",
  "total-asc": "Lowest total",
};
const PAGE_SIZE = 25;

export function OrdersTab({
  orders,
  loading,
  error,
  actionError,
  updatingOrderId,
  initialFilter = "all",
  initialExpandedId = null,
  onReload,
  onStatusChange,
  onCopied,
}: {
  orders: Order[];
  loading: boolean;
  error: string;
  actionError: string;
  updatingOrderId: string | null;
  initialFilter?: OrderFilter;
  initialExpandedId?: string | null;
  onReload: () => void;
  onStatusChange: (order: Order, status: string) => void;
  onCopied: () => void;
}) {
  const [filter, setFilter] = useState<OrderFilter>(initialFilter);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<(typeof ORDER_SORTS)[number]>("newest");
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: orders.length, open: 0 };
    ORDER_STATUSES.forEach((status) => (result[status] = 0));
    orders.forEach((order) => {
      result[order.status] = (result[order.status] ?? 0) + 1;
      if (OPEN_ORDER_STATUSES.has(order.status)) result.open += 1;
    });
    return result as Record<OrderFilter, number>;
  }, [orders]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matched = orders.filter((order) => {
      if (filter === "open" ? !OPEN_ORDER_STATUSES.has(order.status) : filter !== "all" && order.status !== filter) return false;
      if (!query) return true;
      return `${order.id} ${shortId(order.id)} ${order.shipping_address?.full_name ?? ""}`.toLowerCase().includes(query);
    });
    const time = (order: Order) => new Date(order.created_at).getTime();
    return [...matched].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return time(a) - time(b);
        case "total-desc":
          return b.total - a.total;
        case "total-asc":
          return a.total - b.total;
        default:
          return time(b) - time(a);
      }
    });
  }, [orders, filter, search, sort]);

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      onCopied();
    } catch {
      /* clipboard blocked: nothing useful to do */
    }
  };

  const clearFilters = () => {
    setFilter("all");
    setSearch("");
  };

  return (
    <section className={`${cardClass} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="heading" aria-level={2} className="text-base font-semibold text-slate-900">Orders ({filtered.length})</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Search by order # or name"
              aria-label="Search orders"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${inputClass} w-56 pl-8`}
            />
          </div>
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className={selectClass} aria-label="Sort orders">
            {ORDER_SORTS.map((option) => (
              <option key={option} value={option}>{ORDER_SORT_LABELS[option]}</option>
            ))}
          </select>
          <button type="button" onClick={onReload} className={iconButtonClass} title="Refresh orders" aria-label="Refresh orders">
            <IconRefresh className="h-4 w-4" />
          </button>
        </div>
      </div>

      <FilterPills label="Filter by status" options={ORDER_FILTERS} value={filter} onChange={(next) => { setFilter(next); setVisible(PAGE_SIZE); }} counts={counts} />

      {loading && <TableSkeleton rows={4} cols={3} />}
      {!loading && error && <ErrorBanner message={error} onRetry={onReload} />}
      {!loading && !error && actionError && <ErrorBanner message={actionError} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          icon={IconBag}
          title={orders.length === 0 ? "No orders yet" : "No orders match your filters"}
          hint={orders.length === 0 ? "New orders will show up here." : undefined}
          action={orders.length > 0 ? <button type="button" onClick={clearFilters} className={ghostButtonClass}>Clear filters</button> : undefined}
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <ul className="divide-y divide-slate-100 text-sm">
            {filtered.slice(0, visible).map((order) => {
              const open = expandedId === order.id;
              const address = order.shipping_address;
              const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
              return (
                <li key={order.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={`${open ? "Collapse" : "Expand"} order ${shortId(order.id)}`}
                      onClick={() => setExpandedId(open ? null : order.id)}
                      className={`flex min-w-0 basis-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-slate-50 sm:flex-1 sm:basis-0 ${focusRing}`}
                    >
                      <IconChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
                      <span className="shrink-0 font-mono text-xs text-slate-500">#{shortId(order.id)}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-900 sm:flex-none">{address?.full_name ?? "Unknown customer"}</span>
                      <span className="hidden shrink-0 text-slate-500 sm:inline" title={new Date(order.created_at).toLocaleString()}>
                        {formatRelative(order.created_at)}
                      </span>
                      <span className="hidden shrink-0 text-slate-500 md:inline">{itemCount} {itemCount === 1 ? "item" : "items"}</span>
                    </button>
                    <span className="font-medium tabular-nums text-slate-900">{formatMoney(order.total)}</span>
                    <div className="flex items-center gap-2">
                      <Badge tone={ORDER_STATUS_TONE[order.status] ?? "neutral"}>{order.status}</Badge>
                      <select
                        value={order.status}
                        disabled={updatingOrderId === order.id || order.status === "cancelled"}
                        title={order.status === "cancelled" ? "Cancelled orders can't be reopened" : undefined}
                        aria-label={`Status for order ${shortId(order.id)}`}
                        onChange={(event) => onStatusChange(order, event.target.value)}
                        className={selectClass}
                      >
                        {ORDER_STATUSES.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {open && (
                    <div className="mt-3 grid gap-4 rounded-lg bg-slate-50 p-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>Order id</span>
                          <code className="break-all text-slate-700">{order.id}</code>
                          <button type="button" onClick={() => copyId(order.id)} className={iconButtonClass} aria-label="Copy order id" title="Copy order id">
                            <IconCopy className="h-4 w-4" />
                          </button>
                        </div>
                        <ul className="space-y-1">
                          {order.items.map((item) => (
                            <li key={`${item.product_id}-${item.size}-${item.color}`} className="flex justify-between gap-3 text-slate-700">
                              <span>{item.quantity}× {item.name} ({item.size}{item.color ? `, ${item.color}` : ""})</span>
                              <span className="tabular-nums">{formatMoney(item.subtotal)}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="flex justify-between border-t border-slate-200 pt-2 font-medium text-slate-900">
                          <span>Total</span>
                          <span className="tabular-nums">{formatMoney(order.total)}</span>
                        </div>
                      </div>
                      <div className="text-slate-700">
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Ship to</p>
                        {address ? (
                          <address className="not-italic leading-relaxed">
                            {address.full_name}<br />
                            {address.address_line1}<br />
                            {address.address_line2 && <>{address.address_line2}<br /></>}
                            {address.city}, {address.state} {address.postal_code}<br />
                            {address.country}
                            {address.phone && <><br />{address.phone}</>}
                          </address>
                        ) : (
                          <p className="text-slate-500">No address on file.</p>
                        )}
                        <p className="mt-2 text-xs text-slate-500">Placed {new Date(order.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {filtered.length > visible && (
            <div className="flex justify-center">
              <button type="button" onClick={() => setVisible((current) => current + PAGE_SIZE)} className={ghostButtonClass}>
                Show {Math.min(PAGE_SIZE, filtered.length - visible)} more
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
