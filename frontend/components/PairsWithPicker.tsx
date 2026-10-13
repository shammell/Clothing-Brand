"use client";

import { useState } from "react";

export const MAX_COMPANIONS = 4;

type Option = { id: string; name: string };

export function PairsWithPicker({
  options,
  selected,
  excludeId,
  onChange,
  inputClass,
}: {
  options: Option[];
  selected: string[];
  excludeId: string | null;
  onChange: (ids: string[]) => void;
  inputClass: string;
}) {
  const [query, setQuery] = useState("");
  const available = options.filter(
    (option) => option.id !== excludeId && option.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const nameOf = (id: string) => options.find((option) => option.id === id)?.name ?? "Removed product";
  const full = selected.length >= MAX_COMPANIONS;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {selected.length === 0 && <span className="text-sm text-slate-500">No pairings yet.</span>}
        {selected.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
            {nameOf(id)}
            <button type="button" aria-label={`Remove ${nameOf(id)} from pairings`} onClick={() => onChange(selected.filter((other) => other !== id))}>
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="search"
        placeholder="Search products to pair..."
        aria-label="Search products to pair"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className={inputClass}
      />
      <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200">
        {available.map((option) => {
          const checked = selected.includes(option.id);
          return (
            <li key={option.id}>
              <label className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && full}
                  onChange={() => onChange(checked ? selected.filter((id) => id !== option.id) : [...selected, option.id])}
                />
                {option.name}
              </label>
            </li>
          );
        })}
        {available.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matching products.</li>}
      </ul>
      {full && <p className="mt-1 text-xs text-slate-500">Up to {MAX_COMPANIONS} pairings.</p>}
    </div>
  );
}
