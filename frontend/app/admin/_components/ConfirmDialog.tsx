"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dangerButtonClass, ghostButtonClass, primaryButtonClass } from "./ui";

export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

/**
 * Promise-style replacement for window.confirm. Render `dialog` once near the
 * root, then `await confirm({...})` from any handler.
 */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    []
  );

  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return { confirm, dialog: <ConfirmDialog pending={pending} onSettle={settle} /> };
}

function ConfirmDialog({ pending, onSettle }: { pending: Pending | null; onSettle: (ok: boolean) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pending && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    }
    if (!pending && dialog.open) dialog.close();
  }, [pending]);

  const danger = pending?.tone === "danger";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="confirm-title"
      // Esc fires "cancel" then "close"; either way resolve false.
      onCancel={(event) => {
        event.preventDefault();
        onSettle(false);
      }}
      onClick={(event) => event.target === event.currentTarget && onSettle(false)}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40"
    >
      {pending && (
        <div className="space-y-4 p-6">
          <p id="confirm-title" role="heading" aria-level={2} className="text-base font-semibold">
            {pending.title}
          </p>
          {pending.body && <p className="text-sm text-slate-600">{pending.body}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button ref={cancelRef} type="button" onClick={() => onSettle(false)} className={ghostButtonClass}>
              Cancel
            </button>
            <button type="button" onClick={() => onSettle(true)} className={danger ? dangerButtonClass : primaryButtonClass}>
              {pending.confirmLabel ?? "Confirm"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
