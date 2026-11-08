// Snapshot queries and PgStore against the real indexer schema, populated from
// the lifecycle fixture (genuine program logs). Runs when DATABASE_URL is set.
import { readFileSync } from "node:fs";
import { ingestTx, makeDb, migrate } from "@backstop/indexer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Decision } from "../src/policy.js";
import { PgSnapshotSource } from "../src/snapshot.js";
import { PgStore } from "../src/store.js";

const url = process.env.DATABASE_URL;
const fx = JSON.parse(readFileSync(new URL("../../indexer/test/fixtures/lifecycle.json", import.meta.url), "utf8")) as {
  mint: string;
  txs: { signature: string; slot: number; logs: string[] }[];
};

describe.skipIf(!url)("agent snapshot + store (integration)", () => {
  const db = makeDb(url ?? "");
  const t0 = Math.floor(Date.now() / 1000) - 3_600;
  beforeAll(async () => {
    await db.query("drop schema public cascade; create schema public;");
    await migrate(db);
    for (const [i, t] of fx.txs.entries()) {
      await ingestTx(db, null, { signature: t.signature, slot: t.slot, blockTime: t0 + i * 60, logs: t.logs, failed: false });
    }
  });
  afterAll(async () => db.end());

  it("builds a 24h snapshot from indexed data", async () => {
    // events carry the on-chain clock of the fixture run; take the snapshot as of its end
    const { rows } = await db.query<{ t: Date }>("select max(ts) as t from prices");
    const asOf = new Date(rows[0]!.t.getTime() + 60_000);
    const s = await new PgSnapshotSource(db).build({ mint: fx.mint, quoteSymbol: "USDC", quoteDecimals: 6, tokenDecimals: 9 }, asOf);
    expect(s.offers.created).toBe(1);
    expect(s.offers.settled).toBe(1);
    expect(s.offers.absorptionRate).toBeGreaterThan(0);
    expect(s.offers.absorptionRate).toBeLessThanOrEqual(1);
    expect(s.amm.trades).toBeGreaterThan(0);
    expect(s.price.last).toBeGreaterThan(0);
    expect(s.fees.distributed).toBeGreaterThan(0);
    expect(s.chests.count).toBeGreaterThan(0);
    expect(s.holders.registered).toBeGreaterThan(0);
    // free text written on-chain never reaches the model
    expect(JSON.stringify(s)).not.toContain("first offer");
  });

  it("stores runs, posts with snapshots, and supersedes open proposals", async () => {
    const store = new PgStore(db);
    const decision: Decision = {
      kind: "governance",
      param: "tradeFeeBps",
      paramIndex: 0,
      current: "300",
      requested: "250",
      value: "250",
      clamped: false,
      bound: { enabled: false, min: "0", max: "0" },
      reason: "parameter is not agent-tunable",
      rationale: "volume",
    };
    for (let i = 0; i < 2; i++) {
      const run = await store.startRun(fx.mint, new Date());
      const post = await store.insertPost(run, {
        mint: fx.mint,
        kind: "narration",
        body: `post ${i}`,
        feed: "feed",
        model: "claude-opus-5-5",
        snapshot: { offers: { created: 1 } },
        assessment: "a",
        usedFallbackCopy: false,
        proposals: [decision],
        actions: [],
      });
      await store.insertProposals(fx.mint, run, post, [decision]);
      await store.markPosted(post, `x${i}`);
      await store.finishRun(run, {
        mint: fx.mint,
        startedAt: new Date(),
        finishedAt: new Date(),
        ok: true,
        dryRun: true,
        requestedModel: "claude-opus-5-5",
        servedModel: "claude-opus-5-5",
        requestId: "req",
        promptVersion: "v",
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 },
      }, post);
    }
    expect(await store.recentPosts(fx.mint, 5)).toEqual(["post 1", "post 0"]);
    const props = await db.query("select status from agent_proposals order by id");
    expect(props.rows.map((r) => r.status)).toEqual(["superseded", "open"]);
    const posts = await db.query("select snapshot, posted_to_x, x_post_id, run_id from agent_posts order by id");
    expect(posts.rows[1]).toMatchObject({ posted_to_x: true, x_post_id: "x1" });
    expect(posts.rows[1].snapshot.data).toEqual({ offers: { created: 1 } });
    const runs = await db.query("select ok, post_id, input_tokens from agent_runs order by id");
    expect(runs.rows).toHaveLength(2);
    expect(runs.rows[1]).toMatchObject({ ok: true, input_tokens: 10 });
  });
});
