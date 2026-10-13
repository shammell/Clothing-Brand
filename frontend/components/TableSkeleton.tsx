export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse motion-reduce:animate-none" role="status" aria-label="Loading">
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-4 py-2.5">
            {Array.from({ length: cols }).map((__, colIndex) => (
              <div
                key={colIndex}
                className="h-4 rounded bg-slate-200"
                style={{ width: colIndex === cols - 1 ? "20%" : `${100 / cols}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="animate-pulse motion-reduce:animate-none space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-4 rounded bg-slate-200" style={{ width: `${80 - index * 15}%` }} />
      ))}
    </div>
  );
}
