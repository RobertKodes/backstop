"use client";

// One shared WebSocket to the API's /v1/ws feed. Components subscribe per
// mint; the socket reconnects with exponential backoff and reports its status
// so views can fall back to faster polling while it is down.

import { useEffect, useRef, useSyncExternalStore } from "react";

import { config } from "./config";

/** "idle" = no component is subscribed, so no socket is open. */
export type LiveStatus = "idle" | "connecting" | "live" | "offline";

export interface LiveEvent {
  program: string;
  name: string;
  data: Record<string, unknown>;
}

export interface LiveMessage {
  signature: string;
  slot: number;
  blockTime: number | null;
  events: LiveEvent[];
}

type Handler = (ev: LiveEvent, msg: LiveMessage) => void;

class LiveClient {
  private ws: WebSocket | null = null;
  private status: LiveStatus = "idle";
  private readonly mints = new Map<string, number>();
  private readonly handlers = new Set<{ mint: string; fn: Handler }>();
  private readonly statusListeners = new Set<() => void>();
  private retry = 0;
  private reconnectTimer: number | null = null;
  private idleTimer: number | null = null;

  getStatus = () => this.status;

  onStatus = (cb: () => void) => {
    this.statusListeners.add(cb);
    return () => {
      this.statusListeners.delete(cb);
    };
  };

  private setStatus(s: LiveStatus) {
    if (this.status === s) return;
    this.status = s;
    this.statusListeners.forEach((l) => l());
  }

  subscribe(mint: string, fn: Handler): () => void {
    const entry = { mint, fn };
    this.handlers.add(entry);
    this.mints.set(mint, (this.mints.get(mint) ?? 0) + 1);
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (!this.ws) this.connect();
    else if (this.ws.readyState === WebSocket.OPEN) this.send({ op: "subscribe", mint });
    return () => {
      this.handlers.delete(entry);
      const n = (this.mints.get(mint) ?? 1) - 1;
      if (n <= 0) {
        this.mints.delete(mint);
        if (this.ws?.readyState === WebSocket.OPEN) this.send({ op: "unsubscribe", mint });
      } else this.mints.set(mint, n);
      if (this.handlers.size === 0) {
        // Keep the socket briefly so route changes do not reconnect.
        this.idleTimer = window.setTimeout(() => this.close(), 15_000);
      }
    };
  }

  private send(msg: unknown) {
    try {
      this.ws?.send(JSON.stringify(msg));
    } catch {
      /* socket closing; resubscribed on reconnect */
    }
  }

  private connect() {
    if (typeof window === "undefined" || typeof WebSocket === "undefined") return;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.setStatus("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(config.wsUrl);
    } catch {
      this.setStatus("offline");
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus("live");
      for (const mint of this.mints.keys()) this.send({ op: "subscribe", mint });
    };
    ws.onmessage = (ev) => {
      let msg: Partial<LiveMessage> & { op?: string };
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : "") as Partial<LiveMessage>;
      } catch {
        return;
      }
      if (!Array.isArray(msg.events)) return;
      const full = msg as LiveMessage;
      for (const e of full.events) {
        const evMint = typeof e.data?.mint === "string" ? e.data.mint : null;
        for (const h of this.handlers) if (!evMint || evMint === h.mint) h.fn(e, full);
      }
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setStatus("offline");
      if (this.handlers.size > 0) this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    const delay = Math.min(30_000, 1_000 * 2 ** this.retry);
    this.retry += 1;
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  private close() {
    const ws = this.ws;
    this.ws = null;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.setStatus("idle");
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
  }
}

const client = typeof window !== "undefined" ? new LiveClient() : null;

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(
    (cb) => client?.onStatus(cb) ?? (() => {}),
    () => client?.getStatus() ?? "idle",
    () => "idle",
  );
}

/** Subscribe to live protocol events for `mint`. The handler may change freely. */
export function useLiveEvents(mint: string | null | undefined, handler: Handler) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!mint || !client) return;
    return client.subscribe(mint, (e, m) => ref.current(e, m));
  }, [mint]);
}

/** Read a string-ish field from loosely typed event data. */
export function evStr(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : String(v);
}
