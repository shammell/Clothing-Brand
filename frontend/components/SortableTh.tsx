import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;
const iconDefaults = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function IconChevronUp(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

function IconChevronDown(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function IconChevronsUpDown(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <path d="M7 9l5-5 5 5" />
      <path d="M7 15l5 5 5-5" />
    </svg>
  );
}

export function SortableTh({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th className="py-2 pr-4 font-medium" aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={onClick} className="flex items-center gap-1 text-slate-500 hover:text-slate-900">
        {label}
        {active ? (
          direction === "asc" ? <IconChevronUp className="h-3.5 w-3.5" /> : <IconChevronDown className="h-3.5 w-3.5" />
        ) : (
          <IconChevronsUpDown className="h-3.5 w-3.5 text-slate-300" />
        )}
      </button>
    </th>
  );
}
