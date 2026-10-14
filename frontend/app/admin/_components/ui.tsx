import type { ReactNode, SVGProps } from "react";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export type OrderItem = {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  size: string;
  color: string;
};

export type ShippingAddress = {
  full_name: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone?: string | null;
};

export type Order = {
  id: string;
  items: OrderItem[];
  total: number;
  status: string;
  created_at: string;
  shipping_address?: ShippingAddress | null;
};

export type UserSummary = {
  id: string;
  username: string;
  email: string;
  role: "customer" | "lister" | "admin";
  is_blocked: boolean;
  created_at: string;
};

export type AdminProduct = { id: string; name: string; stock: number };

export type AuditLogEntry = {
  id: string;
  actor_id: string;
  action: string;
  target_user_id: string;
  details: Record<string, unknown>;
  created_at: string;
};

export const ORDER_STATUSES = ["placed", "processing", "shipped", "delivered", "cancelled"] as const;
export const OPEN_ORDER_STATUSES = new Set(["placed", "processing"]);
export const ROLES = ["customer", "lister", "admin"] as const;

export const TABS = ["overview", "products", "orders", "users", "audit"] as const;
export type Tab = (typeof TABS)[number];
export const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  products: "Products",
  orders: "Orders",
  users: "Users",
  audit: "Audit log",
};
export const TAB_SUBTITLES: Record<Tab, string> = {
  overview: "Sales, open work and stock at a glance",
  products: "Add, edit and remove catalogue items",
  orders: "Review orders and move them through fulfilment",
  users: "Manage roles and access",
  audit: "Who changed what, most recent first",
};

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500";
export const cardClass = "bg-white rounded-xl border border-slate-200 shadow-sm p-6";
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1";
export const primaryButtonClass = `inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none ${focusRing}`;
export const dangerButtonClass = `inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 transition-colors motion-reduce:transition-none ${focusRing}`;
export const ghostButtonClass = `inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors motion-reduce:transition-none disabled:opacity-60 ${focusRing}`;
export const iconButtonClass = `inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors motion-reduce:transition-none disabled:opacity-50 ${focusRing}`;
export const selectClass =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 disabled:opacity-60";

const moneyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export function formatMoney(value: number): string {
  return moneyFormat.format(value);
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];
const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function formatRelative(iso: string, now: number = Date.now()): string {
  const diffSeconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 45) return "just now";
  for (const [unit, size] of RELATIVE_UNITS) {
    if (abs >= size) return relativeFormat.format(Math.round(diffSeconds / size), unit);
  }
  return relativeFormat.format(Math.round(diffSeconds / 60), "minute");
}

export function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}

/** Revenue and averages ignore cancelled orders (they are restocked, not sold). */
export function computeStats(orders: Order[], users: UserSummary[]) {
  const counted = orders.filter((order) => order.status !== "cancelled");
  const revenue = counted.reduce((sum, order) => sum + order.total, 0);
  const openOrders = orders.filter((order) => OPEN_ORDER_STATUSES.has(order.status)).length;
  const blockedUsers = users.filter((user) => user.is_blocked).length;
  const averageOrder = counted.length ? revenue / counted.length : 0;
  return { revenue, openOrders, blockedUsers, averageOrder, countedOrders: counted.length };
}

export function humanizeAudit(entry: Pick<AuditLogEntry, "action" | "details">): string {
  const { action, details } = entry;
  const from = details.old_role ?? details.from ?? details.previous_role;
  const to = details.new_role ?? details.to ?? details.role;
  if (action === "role_change" && to) return from ? `${String(from)} → ${String(to)}` : `now ${String(to)}`;
  if (action === "block_change") {
    const blocked = details.is_blocked ?? details.blocked;
    if (typeof blocked === "boolean") return blocked ? "blocked" : "unblocked";
  }
  const entries = Object.entries(details);
  if (entries.length === 0) return "—";
  return entries.map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value)}`).join(", ");
}

export type BadgeTone = "neutral" | "green" | "red" | "amber" | "blue" | "purple";

const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-blue-100 text-blue-700",
  purple: "bg-purple-100 text-purple-700",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium first-letter:uppercase ${BADGE_TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

export const ORDER_STATUS_TONE: Record<string, BadgeTone> = {
  placed: "blue",
  processing: "amber",
  shipped: "purple",
  delivered: "green",
  cancelled: "red",
};

export const ROLE_TONE: Record<UserSummary["role"], BadgeTone> = {
  admin: "purple",
  lister: "blue",
  customer: "neutral",
};

export const AUDIT_TONE: Record<string, BadgeTone> = {
  role_change: "purple",
  block_change: "red",
};

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-xs";
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700 ${dim}`}
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: (props: IconProps) => ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="text-sm text-slate-500">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${ghostButtonClass} text-red-700 hover:bg-red-100`}>
          Retry
        </button>
      )}
    </div>
  );
}

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  counts,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  counts?: Partial<Record<T, number>>;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={`min-h-9 rounded-full px-3 text-xs font-medium capitalize transition-colors motion-reduce:transition-none ${focusRing} ${
              active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {option}
            {counts && counts[option] !== undefined && <span className="ml-1 tabular-nums opacity-80">{counts[option]}</span>}
          </button>
        );
      })}
    </div>
  );
}

export type IconProps = SVGProps<SVGSVGElement>;
const iconDefaults = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function IconGrid(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

export function IconBox(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
      <path d="M3.5 7.5 12 12l8.5-4.5" />
      <path d="M12 12v9" />
    </svg>
  );
}

export function IconBag(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <path d="M6 7h12l1 13H5z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14c2.5.3 4.5 2.5 4.5 6" />
    </svg>
  );
}

export function IconClipboard(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3h6v3H9z" />
      <path d="M8 10h8M8 14h8M8 18h5" />
    </svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M16 16l4-4-4-4" />
      <path d="M20 12H9" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <path d="M3 11a9 9 0 0 1 15.3-5.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 13a9 9 0 0 1-15.3 5.3L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function IconUnlock(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7-2.6" />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2" />
      <path d="M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.5 0 2.8-.4 4-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

export const NAV_ICONS: Record<Tab, (props: IconProps) => ReactNode> = {
  overview: IconGrid,
  products: IconBox,
  orders: IconBag,
  users: IconUsers,
  audit: IconClipboard,
};
