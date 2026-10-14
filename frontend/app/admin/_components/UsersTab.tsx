"use client";

import { useMemo, useState } from "react";
import { TableSkeleton } from "@/components/TableSkeleton";
import { SortableTh } from "@/components/SortableTh";
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorBanner,
  FilterPills,
  IconLock,
  IconRefresh,
  IconSearch,
  IconUnlock,
  IconUsers,
  ROLES,
  ROLE_TONE,
  cardClass,
  focusRing,
  formatRelative,
  ghostButtonClass,
  iconButtonClass,
  inputClass,
  selectClass,
  type UserSummary,
} from "./ui";

const ROLE_FILTERS = ["all", ...ROLES] as const;
type SortKey = "username" | "email" | "role" | "created_at";

export function UsersTab({
  users,
  loading,
  error,
  actionError,
  updatingUserId,
  currentUsername,
  onReload,
  onRoleChange,
  onBlockChange,
}: {
  users: UserSummary[];
  loading: boolean;
  error: string;
  actionError: string;
  updatingUserId: string | null;
  currentUsername: string;
  onReload: () => void;
  onRoleChange: (user: UserSummary, nextRole: string) => void;
  onBlockChange: (user: UserSummary, nextBlocked: boolean) => void;
}) {
  const [roleFilter, setRoleFilter] = useState<(typeof ROLE_FILTERS)[number]>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "username", direction: "asc" });

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }
    );

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: users.length, customer: 0, lister: 0, admin: 0 };
    users.forEach((user) => (result[user.role] += 1));
    return result as Record<(typeof ROLE_FILTERS)[number], number>;
  }, [users]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matched = users.filter((user) => {
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      if (!query) return true;
      return `${user.username} ${user.email}`.toLowerCase().includes(query);
    });
    const { key, direction } = sort;
    return [...matched].sort((a, b) => {
      const result =
        key === "created_at" ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime() : a[key].localeCompare(b[key]);
      return direction === "asc" ? result : -result;
    });
  }, [users, roleFilter, search, sort]);

  return (
    <section className={`${cardClass} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="heading" aria-level={2} className="text-base font-semibold text-slate-900">Users ({filtered.length})</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Search by username or email"
              aria-label="Search users"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${inputClass} w-56 pl-8`}
            />
          </div>
          <button type="button" onClick={onReload} className={iconButtonClass} title="Refresh users" aria-label="Refresh users">
            <IconRefresh className="h-4 w-4" />
          </button>
        </div>
      </div>

      <FilterPills label="Filter by role" options={ROLE_FILTERS} value={roleFilter} onChange={setRoleFilter} counts={counts} />

      {loading && <TableSkeleton rows={5} cols={5} />}
      {!loading && error && <ErrorBanner message={error} onRetry={onReload} />}
      {!loading && !error && actionError && <ErrorBanner message={actionError} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          icon={IconUsers}
          title={users.length === 0 ? "No users yet" : "No users match your filters"}
          action={
            users.length > 0 ? (
              <button type="button" onClick={() => { setRoleFilter("all"); setSearch(""); }} className={ghostButtonClass}>
                Clear filters
              </button>
            ) : undefined
          }
        />
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <SortableTh label="User" active={sort.key === "username"} direction={sort.direction} onClick={() => toggleSort("username")} />
                <SortableTh label="Email" active={sort.key === "email"} direction={sort.direction} onClick={() => toggleSort("email")} />
                <SortableTh label="Role" active={sort.key === "role"} direction={sort.direction} onClick={() => toggleSort("role")} />
                <th className="py-2 pr-4 font-medium">Status</th>
                <SortableTh label="Joined" active={sort.key === "created_at"} direction={sort.direction} onClick={() => toggleSort("created_at")} />
                <th className="py-2 pr-4 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => {
                const busy = updatingUserId === user.id;
                return (
                  <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={user.username} size="sm" />
                        <span className="font-medium text-slate-900">{user.username}</span>
                        {user.username === currentUsername && (
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">You</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">{user.email}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <Badge tone={ROLE_TONE[user.role]}>{user.role}</Badge>
                        <select
                          value={user.role}
                          disabled={busy}
                          aria-label={`Role for ${user.username}`}
                          onChange={(event) => onRoleChange(user, event.target.value)}
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
                    <td className="whitespace-nowrap py-2.5 pr-4 text-slate-500" title={new Date(user.created_at).toLocaleString()}>
                      {formatRelative(user.created_at)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <button
                        type="button"
                        onClick={() => onBlockChange(user, !user.is_blocked)}
                        disabled={busy}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors motion-reduce:transition-none disabled:opacity-50 ${focusRing} ${
                          user.is_blocked ? "text-emerald-700 hover:bg-emerald-50" : "text-red-600 hover:bg-red-50"
                        }`}
                        aria-label={`${user.is_blocked ? "Unblock" : "Block"} ${user.username}`}
                      >
                        {user.is_blocked ? <IconUnlock className="h-4 w-4" /> : <IconLock className="h-4 w-4" />}
                        <span className="hidden md:inline">{user.is_blocked ? "Unblock" : "Block"}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
