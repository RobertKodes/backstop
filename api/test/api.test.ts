import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { buildApp, MemoryCache } from "../src/app.js";
import type { Repo, Row } from "../src/repo.js";

const MINT = "BSTPmint11111111111111111111111111111111111";
const OWNER = "Wa11et1111111111111111111111111111111111111";

class FakeRepo implements Repo {
  calls = 0;
  async markets() {
    return [{ mint: MINT }];
  }
  async marketStats(mint: string) {
    this.calls++;
    return { mint, liveOffers: 2 };
  }
  async offers(mint: string, status: string, limit: number): Promise<Row[]> {
    return [{ mint, status, limit }];
  }
  async offer(offer: string) {
    return offer === OWNER ? { offer: { offer }, bids: [], fills: [] } : null;
  }
  async chest(mint: string, owner: string) {
    return { chest: { mint, owner, balance: "5" }, events: [], grant: null, shield: [] };
  }
  async leaderboard(_m: string, kind: string) {
    return [{ kind }];
  }
  async treasury() {
    return { latest: null, history: [], redemptions: [] };
  }
  async candles() {
    return [];
  }
  async absorption() {
    return { shieldDeposits: "0" };
  }
  async tickets() {
    return [];
  }
  async children() {
    return [];
  }
  async child() {
    return null;
  }
  async agentPosts() {
    return [{ body: "hello" }];
  }
  async keeperRuns() {
    return [];
  }
}

describe("REST API", () => {
  it("serves markets, caches responses and validates params", async () => {
    const repo = new FakeRepo();
    const app = await buildApp({ repo, cache: new MemoryCache() });
    const a = await app.inject(`/v1/markets/${MINT}`);
    expect(a.statusCode).toBe(200);
    expect(a.headers["x-cache"]).toBe("miss");
    expect(a.json().liveOffers).toBe(2);
    const b = await app.inject(`/v1/markets/${MINT}`);
    expect(b.headers["x-cache"]).toBe("hit");
    expect(repo.calls).toBe(1);
    expect((await app.inject(`/v1/markets/not-a-key`)).statusCode).toBe(400);
    expect((await app.inject(`/v1/markets/${MINT}/leaderboards/bogus`)).statusCode).toBe(400);
    expect((await app.inject(`/v1/markets/${MINT}/leaderboards/tenure`)).json()).toEqual([{ kind: "tenure" }]);
    expect((await app.inject(`/v1/offers/${MINT}`)).statusCode).toBe(404);
    expect((await app.inject(`/v1/offers/${OWNER}`)).statusCode).toBe(200);
    expect((await app.inject(`/v1/markets/${MINT}/chests/${OWNER}`)).json().chest.balance).toBe("5");
    await app.close();
  });

  it("rate-limits per client", async () => {
    const app = await buildApp({ repo: new FakeRepo(), cache: new MemoryCache(), rateLimitPerMinute: 3 });
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await app.inject("/v1/markets")).statusCode);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
    await app.close();
  });

  it("publishes an OpenAPI document covering every route", async () => {
    const app = await buildApp({ repo: new FakeRepo(), cache: new MemoryCache() });
    await app.ready();
    const doc = app.swagger() as { paths: Record<string, unknown> };
    for (const p of ["/v1/markets", "/v1/markets/{mint}/offers", "/v1/offers/{offer}", "/v1/markets/{mint}/chests/{owner}", "/v1/markets/{mint}/leaderboards/{kind}", "/v1/markets/{mint}/treasury", "/v1/markets/{mint}/price", "/v1/markets/{mint}/tickets/{seller}", "/v1/children", "/v1/agent/posts"]) {
      expect(doc.paths, p).toHaveProperty(p);
    }
    await app.close();
  });
});

describe("WebSocket live feed", () => {
  it("forwards events only for subscribed mints", async () => {
    const bus = new EventEmitter();
    const app = await buildApp({ repo: new FakeRepo(), cache: new MemoryCache(), live: { subscribe: (cb) => bus.on("msg", cb) } });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const port = (app.server.address() as { port: number }).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/ws`);
    const got: string[] = [];
    await new Promise<void>((res) => ws.on("open", () => res()));
    ws.on("message", (m) => got.push(m.toString()));
    ws.send(JSON.stringify({ op: "subscribe", mint: MINT }));
    await new Promise((r) => setTimeout(r, 50));
    bus.emit("msg", JSON.stringify({ events: [{ name: "OfferCreated", data: { mint: "Other1111111111111111111111111111111111111" } }] }));
    bus.emit("msg", JSON.stringify({ events: [{ name: "BidPlaced", data: { mint: MINT } }] }));
    await new Promise((r) => setTimeout(r, 50));
    ws.close();
    await app.close();
    expect(got[0]).toContain("ack");
    expect(got.filter((g) => g.includes("BidPlaced"))).toHaveLength(1);
    expect(got.some((g) => g.includes("OfferCreated"))).toBe(false);
  });
});
