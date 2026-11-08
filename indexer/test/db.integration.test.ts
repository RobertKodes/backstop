// Runs against a real Postgres when DATABASE_URL is set (CI service / docker compose).
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeDb, migrate } from "../src/db.js";
import { ingestTx } from "../src/ingest.js";

const url = process.env.DATABASE_URL;
const fx = JSON.parse(readFileSync(new URL("./fixtures/lifecycle.json", import.meta.url), "utf8")) as {
  mint: string;
  txs: { signature: string; slot: number; logs: string[] }[];
};

describe.skipIf(!url)("Postgres ingestion (integration)", () => {
  const db = makeDb(url ?? "");
  const counts = async () => {
    const r = await db.query<{ t: string; n: string }>(
      `select 'raw' t, count(*) n from raw_events union all select 'offers', count(*) from offers
       union all select 'bids', count(*) from bids union all select 'fills', count(*) from fills
       union all select 'chest_events', count(*) from chest_events union all select 'prices', count(*) from prices`,
    );
    return Object.fromEntries(r.rows.map((x) => [x.t, Number(x.n)]));
  };

  beforeAll(async () => {
    await db.query("drop schema public cascade; create schema public;");
    await migrate(db);
  });
  afterAll(async () => db.end());

  it("ingests the lifecycle and is idempotent on replay", async () => {
    const run = async () => {
      for (const [i, t] of fx.txs.entries()) {
        await ingestTx(db, null, { signature: t.signature, slot: t.slot, blockTime: 1_800_000_000 + i, logs: t.logs, failed: false });
      }
    };
    await run();
    const first = await counts();
    expect(first.offers).toBe(1);
    expect(first.bids).toBe(2);
    expect(first.fills).toBe(2);
    await run(); // replay
    expect(await counts()).toEqual(first);
    const o = await db.query("select status, bidder_lots, seller_net from offers");
    expect(o.rows[0].status).toBe("settled");
    const chest = await db.query("select balance from chests");
    expect(Number(chest.rows[0].balance)).toBeGreaterThan(0);
  });
});
