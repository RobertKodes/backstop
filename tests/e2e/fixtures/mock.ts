// Browser-side mocks: REST API (page.route), live feed (page.routeWebSocket),
// Solana JSON-RPC and an injected Wallet Standard wallet.

import { test as base, expect, type Page, type WebSocketRoute } from "@playwright/test";

import * as D from "./data";

export type RouteName =
  | "markets"
  | "marketStats"
  | "liveOffers"
  | "recentOffers"
  | "offer"
  | "chest"
  | "leaderboard"
  | "treasury"
  | "price"
  | "absorption"
  | "tickets"
  | "children"
  | "child"
  | "agentPosts"
  | "keeperRuns";

export interface MockOptions {
  /** Every REST call answers 503. */
  apiDown?: boolean;
  /** Close the WebSocket immediately (polling fallback). */
  wsDown?: boolean;
  /** Replace the body (or status) of individual routes. */
  overrides?: Partial<Record<RouteName, unknown>>;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "*",
};

function routeFor(url: URL): { name: RouteName; body: () => unknown } | null {
  const p = url.pathname.split("/").filter(Boolean); // ["v1", ...]
  if (p[0] !== "v1") return null;
  const [, a, b, c, d] = p;
  if (a === "markets" && !b) return { name: "markets", body: D.markets };
  if (a === "markets" && b && !c) return { name: "marketStats", body: D.marketStats };
  if (a === "markets" && c === "offers")
    return url.searchParams.get("status") === "recent"
      ? { name: "recentOffers", body: () => [] }
      : { name: "liveOffers", body: D.liveOffers };
  if (a === "offers" && b) return { name: "offer", body: () => D.offerDetail(b) };
  if (a === "markets" && c === "chests" && d) return { name: "chest", body: () => D.chest(d) };
  if (a === "markets" && c === "leaderboards" && d) return { name: "leaderboard", body: () => D.leaderboard(d) };
  if (a === "markets" && c === "treasury") return { name: "treasury", body: D.treasury };
  if (a === "markets" && c === "price")
    return {
      name: "price",
      body: () => D.candles(Number(url.searchParams.get("bucket") ?? 300), Number(url.searchParams.get("hours") ?? 24)),
    };
  if (a === "markets" && c === "absorption") return { name: "absorption", body: D.absorption };
  if (a === "markets" && c === "tickets" && d) return { name: "tickets", body: () => D.tickets(d) };
  if (a === "children" && !b) return { name: "children", body: D.children };
  if (a === "children" && b) return { name: "child", body: () => D.children().find((x) => x.mint === b) ?? null };
  if (a === "agent" && b === "posts") return { name: "agentPosts", body: D.agentPosts };
  if (a === "keeper") return { name: "keeperRuns", body: () => [] };
  return null;
}

/** Controls the mocked /v1/ws socket from a test. */
export class LiveSocket {
  ws: WebSocketRoute | null = null;
  subscribed: string[] = [];

  /** Push one live message (same shape the API broadcasts). */
  push(events: { name: string; program?: string; data: Record<string, unknown> }[]) {
    if (!this.ws) throw new Error("live socket not connected");
    this.ws.send(
      JSON.stringify({
        signature: `sig${Math.random().toString(36).slice(2)}`,
        slot: 1,
        blockTime: Math.floor(Date.now() / 1000),
        events: events.map((e) => ({ program: e.program ?? "offers", name: e.name, data: e.data })),
      }),
    );
  }
}

function rpcReply(req: { id: unknown; method: string; params?: unknown[] }) {
  const ctx = { context: { slot: 1 } };
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: req.id, result });
  switch (req.method) {
    case "getBalance":
      return ok({ ...ctx, value: 5_000_000_000 });
    case "getTokenAccountBalance":
      return ok({ ...ctx, value: { amount: "5000000000000", decimals: 9, uiAmount: 5000, uiAmountString: "5000" } });
    case "getAccountInfo":
      return ok({ ...ctx, value: null });
    case "getMultipleAccounts":
      return ok({ ...ctx, value: ((req.params?.[0] as unknown[]) ?? []).map(() => null) });
    case "getLatestBlockhash":
      return ok({
        ...ctx,
        value: { blockhash: "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k", lastValidBlockHeight: 1000 },
      });
    case "getSlot":
      return ok(1);
    default:
      return { jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } };
  }
}

export async function installMocks(page: Page, opts: MockOptions, live: LiveSocket) {
  await page.route(/\/__sol-price$/, (r) =>
    r.fulfill({ json: { So11111111111111111111111111111111111111112: { usdPrice: D.SOL_USD } }, headers: CORS }),
  );

  await page.route(/^https?:\/\/[^/]+\/v1\//, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    if (opts.apiDown) return route.fulfill({ status: 503, json: { message: "unavailable" }, headers: CORS });
    const r = routeFor(url);
    if (!r) return route.fulfill({ status: 404, json: { message: "not found" }, headers: CORS });
    const override = opts.overrides?.[r.name];
    if (override && typeof override === "object" && "__status" in (override as object)) {
      return route.fulfill({
        status: (override as { __status: number }).__status,
        json: { message: "error" },
        headers: CORS,
      });
    }
    const body = override !== undefined ? override : r.body();
    if (body === null) return route.fulfill({ status: 404, json: { message: "not found" }, headers: CORS });
    return route.fulfill({ json: body, headers: CORS });
  });

  await page.route(/^http:\/\/127\.0\.0\.1:8899/, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = req.postDataJSON() as Parameters<typeof rpcReply>[0] | Parameters<typeof rpcReply>[0][];
    const json = Array.isArray(body) ? body.map(rpcReply) : rpcReply(body);
    return route.fulfill({ json, headers: CORS });
  });

  await page.routeWebSocket(/\/v1\/ws$/, (ws) => {
    if (opts.wsDown) {
      void ws.close({ code: 1011, reason: "down" });
      return;
    }
    live.ws = ws;
    ws.onMessage((m) => {
      try {
        const msg = JSON.parse(String(m)) as { op?: string; mint?: string };
        if (msg.op === "subscribe" && msg.mint) live.subscribed.push(msg.mint);
        ws.send(JSON.stringify({ op: "ack", mints: live.subscribed }));
      } catch {
        /* ignore */
      }
    });
  });
}

/** Init script registering a Wallet Standard wallet ("E2E Wallet") and auto-selecting it. */
export function walletInitScript(bytes: number[], address: string) {
  return `(() => {
    const publicKey = new Uint8Array(${JSON.stringify(bytes)});
    const chains = ["solana:mainnet", "solana:devnet", "solana:testnet", "solana:localnet"];
    const account = { address: ${JSON.stringify(address)}, publicKey, chains, features: ["solana:signTransaction"] };
    let accounts = [];
    const listeners = new Set();
    const emit = () => listeners.forEach((l) => l({ accounts }));
    const wallet = {
      version: "1.0.0",
      name: "E2E Wallet",
      icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjZTBiNDRjIi8+PC9zdmc+",
      chains,
      get accounts() { return accounts; },
      features: {
        "standard:connect": { version: "1.0.0", connect: async () => { accounts = [account]; emit(); return { accounts }; } },
        "standard:disconnect": { version: "1.0.0", disconnect: async () => { accounts = []; emit(); } },
        "standard:events": { version: "1.0.0", on: (event, listener) => { if (event === "change") listeners.add(listener); return () => listeners.delete(listener); } },
        "solana:signTransaction": {
          version: "1.0.0",
          supportedTransactionVersions: ["legacy", 0],
          signTransaction: async () => { throw new Error("User rejected the request."); },
        },
      },
    };
    const callback = ({ register }) => register(wallet);
    try { window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: callback })); } catch (e) {}
    try { window.addEventListener("wallet-standard:app-ready", ({ detail }) => callback(detail)); } catch (e) {}
    try { localStorage.setItem("walletName", JSON.stringify("E2E Wallet")); } catch (e) {}
  })();`;
}

export const test = base.extend<{ mock: MockOptions; connected: boolean; live: LiveSocket }>({
  mock: [{}, { option: true }],
  connected: [false, { option: true }],
  live: [
    async ({ page, mock, connected }, use) => {
      const live = new LiveSocket();
      // Uncaught errors (including React hydration mismatches) fail the test.
      const pageErrors: string[] = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));
      await installMocks(page, mock, live);
      if (connected) await page.addInitScript(walletInitScript(D.WALLET_BYTES, D.A.wallet));
      await use(live);
      expect(pageErrors, "uncaught page errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
export { D };
