"use client";

import { useState } from "react";
import { TableSkeleton } from "@/components/TableSkeleton";
import {
  AUDIT_TONE,
  Badge,
  EmptyState,
  ErrorBanner,
  IconClipboard,
  IconRefresh,
  cardClass,
  formatRelative,
  humanizeAudit,
  iconButtonClass,
  selectClass,
  type AuditLogEntry,
} from "./ui";

export function AuditTab({
  entries,
  loading,
  error,
  usernameById,
  onReload,
}: {
  entries: AuditLogEntry[];
  loading: boolean;
  error: string;
  usernameById: Map<string, string>;
  onReload: () => void;
}) {
  const [actionFilter, setActionFilter] = useState("all");
  const actions = Array.from(new Set(entries.map((entry) => entry.action)));
  const shown = actionFilter === "all" ? entries : entries.filter((entry) => entry.action === actionFilter);

  return (
    <section className={`${cardClass} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="heading" aria-level={2} className="text-base font-semibold text-slate-900">Audit log</p>
        <div className="flex items-center gap-3">
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className={selectClass} aria-label="Filter by action">
            <option value="all">All actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>{action.replace(/_/g, " ")}</option>
            ))}
          </select>
          <button type="button" onClick={onReload} className={iconButtonClass} title="Refresh audit log" aria-label="Refresh audit log">
            <IconRefresh className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading && <TableSkeleton rows={5} cols={5} />}
      {!loading && error && <ErrorBanner message={error} onRetry={onReload} />}
      {!loading && !error && shown.length === 0 && (
        <EmptyState icon={IconClipboard} title="No admin actions recorded yet" hint="Role and block changes will appear here." />
      )}
      {!loading && !error && shown.length > 0 && (
        <>
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
                {shown.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                    <td className="whitespace-nowrap py-2.5 pr-4 text-slate-500" title={new Date(entry.created_at).toLocaleString()}>
                      {formatRelative(entry.created_at)}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-900">{usernameById.get(entry.actor_id) ?? entry.actor_id}</td>
                    <td className="py-2.5 pr-4"><Badge tone={AUDIT_TONE[entry.action] ?? "neutral"}>{entry.action.replace(/_/g, " ")}</Badge></td>
                    <td className="py-2.5 pr-4 text-slate-900">{usernameById.get(entry.target_user_id) ?? entry.target_user_id}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{humanizeAudit(entry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">Showing the latest {entries.length} entries.</p>
        </>
      )}
    </section>
  );
}
