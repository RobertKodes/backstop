"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import { explorerTx } from "@/lib/config";

export type ToastKind = "pending" | "success" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  signature?: string;
}

interface ToastApi {
  push: (t: Omit<Toast, "id">) => number;
  update: (id: number, patch: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function useToasts(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToasts outside ToastProvider");
  return v;
}

const AUTO_DISMISS_MS: Partial<Record<ToastKind, number>> = { success: 10_000, info: 6_000 };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) window.clearTimeout(tm);
    timers.current.delete(id);
  }, []);

  const schedule = useCallback(
    (id: number, kind: ToastKind) => {
      const ms = AUTO_DISMISS_MS[kind];
      const old = timers.current.get(id);
      if (old) window.clearTimeout(old);
      if (ms)
        timers.current.set(
          id,
          window.setTimeout(() => dismiss(id), ms),
        );
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push: (t) => {
        const id = ++seq.current;
        setToasts((ts) => [...ts.slice(-4), { ...t, id }]);
        schedule(id, t.kind);
        return id;
      },
      update: (id, patch) => {
        setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
        if (patch.kind) schedule(id, patch.kind);
      },
      dismiss,
    }),
    [dismiss, schedule],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toast-region">
        <div role="status" aria-live="polite" className="contents">
          {toasts
            .filter((t) => t.kind !== "error")
            .map((t) => (
              <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
            ))}
        </div>
        <div role="alert" aria-live="assertive" className="contents">
          {toasts
            .filter((t) => t.kind === "error")
            .map((t) => (
              <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
            ))}
        </div>
      </div>
    </Ctx.Provider>
  );
}

const KIND_LABEL: Record<ToastKind, string> = {
  pending: "In progress",
  success: "Confirmed",
  error: "Failed",
  info: "Notice",
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div className="toast" data-kind={toast.kind} data-testid="toast">
      <div className="flex items-start gap-3">
        <span className="toast-mark" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            <span className="sr-only">{KIND_LABEL[toast.kind]}: </span>
            {toast.title}
          </p>
          {toast.message ? <p className="mt-0.5 text-sm text-muted break-words">{toast.message}</p> : null}
          {toast.signature ? (
            <a
              className="link mt-1 inline-block text-sm"
              href={explorerTx(toast.signature)}
              target="_blank"
              rel="noreferrer"
            >
              View on Solana Explorer<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </div>
        <button type="button" className="icon-btn -mr-1 -mt-1" onClick={onDismiss} aria-label="Dismiss notification">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
