"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ToastItem = { id: number; message: string; tone: "success" | "error" };

const DISMISS_MS = 4000;

/** Render `toaster` once; call `notify(message, tone?)` from any handler. */
export function useToast() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach(clearTimeout);
  }, []);

  const notify = useCallback((message: string, tone: ToastItem["tone"] = "success") => {
    const id = nextId.current++;
    setItems((current) => [...current, { id, message, tone }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setItems((current) => current.filter((item) => item.id !== id));
    }, DISMISS_MS);
    timers.current.add(timer);
  }, []);

  const toaster = (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-xs flex-col gap-2"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
            item.tone === "error" ? "bg-red-600" : "bg-slate-900"
          }`}
        >
          {item.message}
        </div>
      ))}
    </div>
  );

  return { notify, toaster };
}
