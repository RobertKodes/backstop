"use client";

// A single shared one-second ticker so every countdown on the page changes
// digits in the same frame.

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let now = Math.floor(Date.now() / 1000);
let timer: number | null = null;

function tick() {
  now = Math.floor(Date.now() / 1000);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (timer === null) {
    tick();
    timer = window.setInterval(tick, 1_000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

/** Current unix time in seconds, updating every second. 0 during SSR. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => 0,
  );
}
