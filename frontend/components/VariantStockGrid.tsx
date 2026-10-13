"use client";

import { variantKey } from "@/lib/variantGrid";

export function VariantStockGrid({
  sizes,
  colors,
  values,
  onChange,
  inputClass,
}: {
  sizes: string[];
  colors: string[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  inputClass: string;
}) {
  if (sizes.length === 0 || colors.length === 0) {
    return <p className="text-sm text-slate-500">Add sizes and colors to set stock for each combination.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr>
            <th className="py-1 pr-3 text-left font-medium text-slate-500">Size</th>
            {colors.map((color) => (
              <th key={color} className="px-1 py-1 text-left font-medium text-slate-500">{color}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sizes.map((size) => (
            <tr key={size}>
              <th scope="row" className="py-1 pr-3 text-left font-medium text-slate-700">{size}</th>
              {colors.map((color) => {
                const key = variantKey(size, color);
                return (
                  <td key={color} className="px-1 py-1">
                    <input
                      type="number"
                      min="0"
                      aria-label={`Stock for ${size} in ${color}`}
                      value={values[key] ?? "0"}
                      onChange={(event) => onChange(key, event.target.value)}
                      className={`${inputClass} w-20`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
