"use client";

// Tiny shared fetch cache: components asking for the same path share one
// request and one result; data is kept (stale) when a refresh fails so the UI
// degrades gracefully while the API is down.

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { apiGet } from "./api";

interface Entry {
  data?: unknown;
  error?: Error;
  loading: boolean;
  updatedAt: number;
  inflight?: Promise<void>;
}

const store = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const EMPTY: Entry = { loading: true, updatedAt: 0 };

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function set(key: string, patch: Partial<Entry>) {
  store.set(key, { ...(store.get(key) ?? EMPTY), ...patch });
  emit(key);
}

export function revalidate(key: string): Promise<void> {
  const cur = store.get(key);
  if (cur?.inflight) return cur.inflight;
  const p = apiGet<unknown>(key)
    .then((data) => set(key, { data, error: undefined, loading: false, updatedAt: Date.now(), inflight: undefined }))
    .catch((error: Error) => set(key, { error, loading: false, inflight: undefined }));
  set(key, { inflight: p, loading: cur?.data === undefined });
  return p;
}

/** Revalidate every cached path that starts with `prefix`. */
export function revalidatePrefix(prefix: string) {
  for (const key of store.keys()) if (key.startsWith(prefix)) void revalidate(key);
}

/** Optimistically replace cached data (e.g. from a WebSocket event). */
export function mutateCache<T>(key: string, fn: (d: T | undefined) => T | undefined) {
  const cur = store.get(key);
  if (!cur || cur.data === undefined) return;
  set(key, { data: fn(cur.data as T), loading: false });
}

export interface ApiState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  /** True when showing data from before a failed refresh. */
  stale: boolean;
  refresh: () => Promise<void>;
}

export function useApi<T>(path: string | null, opts: { refreshMs?: number } = {}): ApiState<T> {
  const key = path ?? "";
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!key) return () => {};
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(cb);
      return () => set!.delete(cb);
    },
    [key],
  );
  const snap = useSyncExternalStore(
    subscribe,
    () => (key ? (store.get(key) ?? EMPTY) : EMPTY),
    () => EMPTY,
  );

  useEffect(() => {
    if (!key) return;
    const cur = store.get(key);
    if (!cur || (!cur.inflight && Date.now() - cur.updatedAt > 1_000)) void revalidate(key);
    if (!opts.refreshMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void revalidate(key);
    }, opts.refreshMs);
    return () => window.clearInterval(id);
  }, [key, opts.refreshMs]);

  const refresh = useCallback(() => (key ? revalidate(key) : Promise.resolve()), [key]);
  return {
    data: snap.data as T | undefined,
    error: snap.error,
    loading: !!key && snap.loading && snap.data === undefined,
    stale: snap.data !== undefined && !!snap.error,
    refresh,
  };
}
