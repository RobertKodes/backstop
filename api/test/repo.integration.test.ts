// Exercises every PgRepo query against the real schema, populated from the
// lifecycle fixture (real program logs). Runs when DATABASE_URL is set.
import { readFileSync } from "node:fs";
import { ingestTx, makeDb, migrate } from "@backstop/indexer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, MemoryCache } from "../src/app.js";
import { PgRepo } from "../src/repo.js";

const url = process.env.DATABASE_URL;
const fx = JSON.parse(readFileSync(new URL("../../indexer/test/fixtures/lifecycle.json", import.meta.url), "utf8")) as {
  mint: string;
  txs: { signature: string; slot: number; logs: string[] }[];
};

describe.skipIf(!url)("PgRepo against the indexer schema (integration)", () => {
  const db = makeDb(url ?? "");
  beforeAll(async () => {
    await db.query("drop schema public cascade; create schema public;");
    await migrate(db);
    const now = Math.floor(Date.now() / 1000) - 3_600;
    for (const [i, t] of fx.txs.entries()) {
      await ingestTx(db, null, { signature: t.signature, slot: t.slot, blockTime: now + i * 60, logs: t.logs, failed: false });
    }
  });
  afterAll(async () => db.end());

  it("answers every endpoint from indexed data", async () => {
    const app = await buildApp({ repo: new PgRepo(db), cache: new MemoryCache() });
    const get = async (p: string) => {
      const r = await app.inject(p);
      expect(r.statusCode, `${p}: ${r.body}`).toBe(200);
      return r.json();
    };
    const stats = await get(`/v1/markets/${fx.mint}`);
    expect(stats.price).not.toBeNull();
    expect(BigInt(stats.absorbedToday.holdersTokens)).toBeGreaterThan(0n);
    const recent = await get(`/v1/markets/${fx.mint}/offers?status=recent`);
    expect(recent).toHaveLength(1);
    const detail = await get(`/v1/offers/${recent[0].offer}`);
    expect(detail.bids).toHaveLength(2);
    expect(detail.fills).toHaveLength(2);
    const bidder = detail.bids[0].bidder;
    const chest = await get(`/v1/markets/${fx.mint}/chests/${bidder}`);
    expect(chest.events.length).toBeGreaterThan(0);
    expect((await get(`/v1/markets/${fx.mint}/leaderboards/absorbers`))[0].wallet).toBe(bidder);
    await get(`/v1/markets/${fx.mint}/leaderboards/tenure`);
    await get(`/v1/markets/${fx.mint}/leaderboards/shield`);
    await get(`/v1/markets/${fx.mint}/treasury`);
    expect((await get(`/v1/markets/${fx.mint}/price?bucket=300&hours=24`)).length).toBeGreaterThan(0);
    await get(`/v1/markets/${fx.mint}/absorption`);
    await get(`/v1/markets/${fx.mint}/tickets/${recent[0].seller}`);
    await get(`/v1/children`);
    await get(`/v1/agent/posts`);
    await get(`/v1/agent/proposals?status=open`);
    await get(`/v1/keeper/runs`);
    await app.close();
  });
});
