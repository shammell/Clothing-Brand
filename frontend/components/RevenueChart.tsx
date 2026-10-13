type MiniOrder = { total: number; status: string; created_at: string };

const DAYS = 14;

function buildDailyRevenue(orders: MiniOrder[]) {
  const buckets = new Map<string, number>();
  const labels: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = DAYS - 1; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const key = day.toDateString();
    buckets.set(key, 0);
    labels.push(key);
  }
  orders.forEach((order) => {
    if (order.status === "cancelled") return;
    const key = new Date(order.created_at).toDateString();
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + order.total);
  });
  return labels.map((key) => ({ key, value: buckets.get(key) ?? 0 }));
}

export function RevenueChart({ orders }: { orders: MiniOrder[] }) {
  const series = buildDailyRevenue(orders);
  const max = Math.max(1, ...series.map((point) => point.value));
  const width = 280;
  const height = 72;
  const stepX = width / (series.length - 1);

  const points = series.map((point, index) => ({
    x: index * stepX,
    y: height - (point.value / max) * (height - 8) - 4,
    value: point.value,
  }));

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  const total = series.reduce((sum, point) => sum + point.value, 0);
  const firstHalf = series.slice(0, 7).reduce((sum, point) => sum + point.value, 0);
  const secondHalf = series.slice(7).reduce((sum, point) => sum + point.value, 0);
  const trendingUp = secondHalf >= firstHalf;
  const last = points[points.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`Daily revenue over the last ${DAYS} days, totaling $${total.toFixed(2)}, trending ${trendingUp ? "up" : "down"}`}>
        <defs>
          <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#revenue-fill)" />
        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {last && <circle cx={last.x} cy={last.y} r="3" fill="#4f46e5" />}
      </svg>
      <p className="mt-2 text-xs text-slate-500">
        Last {DAYS} days: <span className="font-medium text-slate-700">${total.toFixed(2)}</span>{" "}
        <span className={trendingUp ? "text-emerald-600" : "text-red-600"}>{trendingUp ? "▲ trending up" : "▼ trending down"}</span>
      </p>
    </div>
  );
}

export function OrderStatusBreakdown({ orders }: { orders: MiniOrder[] }) {
  const counts = new Map<string, number>();
  orders.forEach((order) => counts.set(order.status, (counts.get(order.status) ?? 0) + 1));
  const total = orders.length || 1;
  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No orders yet.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {entries.map(([status, count]) => (
        <li key={status} className="text-sm">
          <div className="mb-1 flex items-center justify-between text-slate-600">
            <span className="capitalize">{status}</span>
            <span className="text-slate-900">{count}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${(count / total) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
