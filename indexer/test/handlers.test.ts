import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeTx } from "../src/ingest.js";
import { toSql } from "../src/db.js";
import type { Mutation } from "../src/mutations.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/lifecycle.json", import.meta.url), "utf8")) as {
  mint: string;
  txs: { signature: string; slot: number; logs: string[] }[];
};

const decodeAll = () =>
  fx.txs.map((t, i) => decodeTx({ signature: t.signature, slot: t.slot, blockTime: 1_800_000_000 + i, logs: t.logs, failed: false }));

describe("decoding real program logs", () => {
  const results = decodeAll();
  const events = results.flatMap((r) => r.events);
  const names = events.map((e) => e.name);
  const muts = results.flatMap((r) => r.mutations);

  it("finds every lifecycle event", () => {
    for (const n of [
      "HolderRegistered",
      "Swapped",
      "TransferTracked",
      "ChestEvent",
      "OfferCreated",
      "BidPlaced",
      "BiddingClosed",
      "OfferSettled",
      "TicketIssued",
      "RemainderSold",
      "BidClaimed",
      "TenureCredited",
      "TicketUsed",
      "FeesDistributed",
      "RewardsDeposited",
      "RewardsHarvested",
    ]) {
      if (n === "BiddingClosed") continue; // close_bidding was not recorded in the fixture
      expect(names, n).toContain(n);
    }
  });

  it("normalises keys and values", () => {
    const created = events.find((e) => e.name === "OfferCreated")!.data as Record<string, unknown>;
    expect(created.mint).toBe(fx.mint);
    expect(typeof created.amount).toBe("string");
    expect(created.message).toBe("first offer");
    expect(created).toHaveProperty("fillPrice");
    const settled = events.find((e) => e.name === "OfferSettled")!.data as Record<string, unknown>;
    expect(settled.seed).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces keyed, idempotent mutations", () => {
    const offerUpsert = muts.find((m) => m.kind === "upsert" && m.table === "offers") as Extract<Mutation, { kind: "upsert" }>;
    expect(offerUpsert.key).toEqual(["offer"]);
    expect(offerUpsert.row.status).toBe("open");
    const bids = muts.filter((m) => m.kind === "insert" && m.table === "bids");
    expect(bids).toHaveLength(2);
    const fills = muts.filter((m) => m.kind === "insert" && m.table === "fills") as Extract<Mutation, { kind: "insert" }>[];
    expect(fills).toHaveLength(2);
    for (const f of fills) expect(f.key).toEqual(["bid"]);
    const settlePatch = muts.find((m) => m.kind === "patch" && m.table === "offers" && m.set.status === "settled");
    expect(settlePatch).toBeDefined();
    const raw = muts.filter((m) => m.table === "raw_events");
    expect(raw).toHaveLength(events.length);
  });

  it("emits nothing for failed transactions", () => {
    const t = fx.txs[0]!;
    expect(decodeTx({ signature: t.signature, slot: t.slot, blockTime: null, logs: t.logs, failed: true }).mutations).toHaveLength(0);
  });
});

describe("SQL generation", () => {
  it("insert → on conflict do nothing", () => {
    const q = toSql({ kind: "insert", table: "fills", key: ["bid"], row: { bid: "b", tokens: "5" } });
    expect(q.text).toBe('insert into "fills" ("bid", "tokens") values ($1, $2) on conflict ("bid") do nothing');
    expect(q.values).toEqual(["b", "5"]);
  });

  it("upsert guards on updated_slot", () => {
    const q = toSql({ kind: "upsert", table: "chests", key: ["mint", "owner"], row: { mint: "m", owner: "o", balance: "1", updated_slot: 9 }, slot: 9 });
    expect(q.text).toContain('do update set "balance" = excluded."balance", "updated_slot" = excluded."updated_slot"');
    expect(q.text).toContain('where "chests".updated_slot <= excluded.updated_slot');
  });

  it("patch never creates rows and respects slot order", () => {
    const q = toSql({ kind: "patch", table: "offers", where: { offer: "x" }, set: { status: "settled" }, slot: 42 });
    expect(q.text).toBe('update "offers" set "status" = $1, updated_slot = $2 where "offer" = $3 and updated_slot <= $2');
    expect(q.values).toEqual(["settled", 42, "x"]);
  });

  it("rejects unsafe identifiers", () => {
    expect(() => toSql({ kind: "insert", table: "x; drop table y", key: ["a"], row: { a: 1 } })).toThrow();
  });
});
