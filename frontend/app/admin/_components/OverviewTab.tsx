"use client";

import type { ReactNode } from "react";
import { RevenueChart, OrderStatusBreakdown } from "@/components/RevenueChart";
import { TableSkeleton, CardSkeleton } from "@/components/TableSkeleton";
import {
  Badge,
  EmptyState,
  IconBag,
  IconBox,
  IconGrid,
  IconUsers,
  ORDER_STATUS_TONE,
  cardClass,
  focusRing,
  formatMoney,
  formatRelative,
  ghostButtonClass,
  shortId,
  type AdminProduct,
  type IconProps,
  type Order,
  type Tab,
  type UserSummary,
} from "./ui";

type Stats = { revenue: number; openOrders: number; blockedUsers: number; averageOrder: number; countedOrders: number };

export function OverviewTab({
  orders,
  users,
  products,
  stats,
  ordersLoading,
  onNavigate,
  onOpenOrder,
}: {
  orders: Order[];
  users: UserSummary[];
  products: AdminProduct[] | null;
  stats: Stats;
  ordersLoading: boolean;
  onNavigate: (tab: Tab, orderFilter?: string) => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const customers = users.filter((user) => user.role === "customer").length;
  const placed = orders.filter((order) => order.status === "placed").length;
  const outOfStock = (products ?? []).filter((product) => product.stock === 0);
  const lowStock = (products ?? []).filter((product) => product.stock > 0 && product.stock < 5);
  const stockAlerts = [...outOfStock, ...lowStock].slice(0, 5);
  const nothingNeedsAttention = placed === 0 && stockAlerts.length === 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={IconBag} label="Revenue" value={formatMoney(stats.revenue)} sub="Excludes cancelled" />
        <StatCard
          icon={IconBox}
          label="Orders"
          value={orders.length}
          sub={`${stats.openOrders} open`}
          onClick={() => onNavigate("orders", "open")}
        />
        <StatCard icon={IconGrid} label="Avg order" value={formatMoney(stats.averageOrder)} sub={`${stats.countedOrders} counted`} />
        <StatCard
          icon={IconUsers}
          label="Customers"
          value={customers}
          sub={`${stats.blockedUsers} blocked`}
          onClick={() => onNavigate("users")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <section className={`${cardClass} md:col-span-2`}>
          <p role="heading" aria-level={2} className="mb-4 text-base font-semibold text-slate-900">Revenue, last 14 days</p>
          {ordersLoading ? <CardSkeleton /> : <RevenueChart orders={orders} />}
        </section>
        <section className={cardClass}>
          <p role="heading" aria-level={2} className="mb-4 text-base font-semibold text-slate-900">Orders by status</p>
          {ordersLoading ? <CardSkeleton /> : <OrderStatusBreakdown orders={orders} />}
        </section>
      </div>

      <section className={cardClass}>
        <p role="heading" aria-level={2} className="mb-3 text-base font-semibold text-slate-900">Needs attention</p>
        {products === null && ordersLoading ? (
          <CardSkeleton />
        ) : nothingNeedsAttention ? (
          <p className="text-sm text-slate-500">All clear: no new orders waiting and stock looks healthy.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {placed > 0 && (
              <li className="flex items-center justify-between gap-3">
                <span className="text-slate-700">
                  <strong className="tabular-nums">{placed}</strong> new {placed === 1 ? "order" : "orders"} waiting to be processed
                </span>
                <button type="button" onClick={() => onNavigate("orders", "placed")} className={ghostButtonClass}>Review</button>
              </li>
            )}
            {stockAlerts.map((product) => (
              <li key={product.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-slate-700">{product.name}</span>
                <span className="flex items-center gap-3">
                  <Badge tone={product.stock === 0 ? "red" : "amber"}>{product.stock === 0 ? "Out of stock" : `${product.stock} left`}</Badge>
                  <button type="button" onClick={() => onNavigate("products")} className={ghostButtonClass}>Restock</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex items-center justify-between">
          <p role="heading" aria-level={2} className="text-base font-semibold text-slate-900">Recent orders</p>
          <button type="button" onClick={() => onNavigate("orders")} className={ghostButtonClass}>View all</button>
        </div>
        {ordersLoading && <TableSkeleton rows={4} cols={3} />}
        {!ordersLoading && orders.length === 0 && <EmptyState icon={IconBag} title="No orders yet" hint="New orders will show up here." />}
        {!ordersLoading && orders.length > 0 && (
          <ul className="divide-y divide-slate-100 text-sm">
            {orders.slice(0, 5).map((order) => (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => onOpenOrder(order.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-3 text-left hover:bg-slate-50 ${focusRing}`}
                >
                  <span className="min-w-0 truncate text-slate-700">
                    <span className="font-mono text-xs text-slate-400">#{shortId(order.id)}</span>{" "}
                    {order.shipping_address?.full_name ?? "Unknown"} ·{" "}
                    <span title={new Date(order.created_at).toLocaleString()}>{formatRelative(order.created_at)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Badge tone={ORDER_STATUS_TONE[order.status] ?? "neutral"}>{order.status}</Badge>
                    <span className="font-medium tabular-nums text-slate-900">{formatMoney(order.total)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  onClick,
}: {
  icon: (props: IconProps) => ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 truncate text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </>
  );
  if (!onClick) return <div className={cardClass}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cardClass} text-left transition-shadow hover:shadow-md motion-reduce:transition-none ${focusRing}`}
    >
      {body}
    </button>
  );
}
