import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import { type Advice, type Advisor, AdvisorError, type AgentOutput } from "../src/advisor.js";
import type { Chain, ChainState } from "../src/chain.js";
import { copyViolations } from "../src/copy.js";
import { type CycleDeps, runCycle } from "../src/cycle.js";
import { PARAMS, type ParamValues } from "../src/params.js";
import type { Snapshot, SnapshotSource } from "../src/snapshot.js";
import { MemoryStore } from "../src/store.js";
import type { Poster } from "../src/x.js";
import { MINT, silentLog, snapshot } from "./fixtures.js";

const AGENT = "Agent1111111111111111111111111111111111111";

function params(): ParamValues {
  const v: ParamValues = {};
  for (const p of PARAMS) v[p.name] = 1n;
  Object.assign(v, {
    tradeFeeBps: 300n,
    splitChestBps: 7_000n,
    splitShieldBps: 1_000n,
    baseDiscountBps: 500n,
    minDiscountBps: 200n,
    maxDiscountBps: 2_000n,
    offerWindowSecs: 600n,
    bidEpochSecs: 60n,
    lotsPerOffer: 100n,
    yieldBufferBps: 2_000n,
    shieldMinLockSecs: 86_400n,
    shieldMaxMultiplierBps: 20_000n,
    priceTwapWindowSecs: 300n,
    momentumLookbackSecs: 3_600n,
  });
  return v;
}

class FakeChain implements Chain {
  sent: { param: number; value: bigint }[] = [];
  agent = AGENT;
  failNext = false;
  async read(): Promise<ChainState> {
    return {
      params: params(),
      authority: {
        agent: this.agent,
        cooldownSecs: 3_600,
        bounds: PARAMS.map((p) =>
          p.name === "yieldBufferBps" ? { enabled: true, min: 1_500n, max: 3_000n, lastUpdate: 0 } : { enabled: false, min: 0n, max: 0n, lastUpdate: 0 },
        ),
      },
    };
  }
  async setParam(_mint: PublicKey, param: number, value: bigint) {
    if (this.failNext) throw new Error("simulation failed");
    this.sent.push({ param, value });
    return `sig${this.sent.length}`;
  }
}

class FakeAdvisor implements Advisor {
  calls = 0;
  constructor(private readonly out: AgentOutput | Error) {}
  async advise(): Promise<Advice> {
    this.calls++;
    if (this.out instanceof Error) throw this.out;
    return { output: this.out, model: "claude-opus-5-5", requestId: "req_1", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 } };
  }
}

class FakePoster implements Poster {
  posts: string[] = [];
  constructor(readonly enabled: boolean) {}
  async post(text: string) {
    this.posts.push(text);
    return { id: "x123" };
  }
}

const source = (s: Snapshot): SnapshotSource => ({ build: async () => s });

const OUTPUT: AgentOutput = {
  assessment: "Healthy absorption; idle buffer slightly thin for offer flow.",
  proposals: [
    { param: "yieldBufferBps", value: "2200", rationale: "absorbed 33k vs 80k idle" },
    { param: "tradeFeeBps", value: "250", rationale: "volume could use a lower fee" },
  ],
  post: "22 sell offers in 24h; holders and the Shield absorbed 71%. Proposing a slightly larger idle chest buffer.",
  feed: "Holders absorbed most sells. Proposing yieldBufferBps 2200 and, for governance, a lower trade fee.",
};

function deps(over: Partial<CycleDeps> & { out?: AgentOutput | Error; snap?: Snapshot; xEnabled?: boolean; dryRun?: boolean } = {}) {
  const chain = new FakeChain();
  const store = new MemoryStore();
  const poster = new FakePoster(over.xEnabled ?? false);
  const advisor = new FakeAdvisor(over.out ?? OUTPUT);
  const governance: string[][] = [];
  const d: CycleDeps = {
    chain,
    source: source(over.snap ?? snapshot()),
    advisor,
    store,
    poster,
    log: silentLog,
    notifyGovernance: async (_m, ds) => {
      governance.push(ds.map((x) => x.param));
    },
    cfg: { model: "claude-opus-5-5", agent: AGENT, dryRun: over.dryRun ?? false, maxActions: 2, maxStepBps: 2_500, xSuffix: "" },
    now: () => new Date("2026-11-08T12:00:00Z"),
    ...over,
  };
  return { d, chain, store, poster, advisor, governance };
}

const market = { mint: MINT, mintKey: new PublicKey(MINT), quoteSymbol: "USDC", quoteDecimals: 6, tokenDecimals: 9 };

describe("agent cycle", () => {
  it("executes bounded updates, files governance proposals and stores the post with its snapshot", async () => {
    const { d, chain, store, governance } = deps();
    const r = await runCycle(d, market);
    expect(r.ok).toBe(true);
    expect(chain.sent).toEqual([{ param: PARAMS.findIndex((p) => p.name === "yieldBufferBps"), value: 2_200n }]);
    expect(r.actions).toEqual([{ param: "yieldBufferBps", value: "2200", status: "sent", signature: "sig1" }]);
    expect(governance).toEqual([["tradeFeeBps"]]);
    expect(store.proposals.map((p) => [p.param, p.requested, p.kind])).toEqual([["tradeFeeBps", "250", "governance"]]);
    const post = store.posts[0]!;
    expect(post.body).toBe(OUTPUT.post);
    expect(post.snapshot).toEqual(snapshot());
    expect(post.feed).toContain("Applied on-chain: yieldBufferBps 2000 → 2200.");
    expect(post.feed).toContain("Filed for governance review: tradeFeeBps → 250");
    expect(store.runs[0]).toMatchObject({ ok: true, servedModel: "claude-opus-5-5", requestId: "req_1", dryRun: false });
  });

  it("never sends transactions in dry-run mode", async () => {
    const { d, chain } = deps({ dryRun: true });
    const r = await runCycle(d, market);
    expect(chain.sent).toEqual([]);
    expect(r.actions[0]!.status).toBe("dry_run");
  });

  it("does nothing on-chain when the configured key is not the on-chain agent", async () => {
    const { d, chain } = deps();
    chain.agent = "SomeoneElse11111111111111111111111111111111";
    const r = await runCycle(d, market);
    expect(chain.sent).toEqual([]);
    expect(r.decisions.find((x) => x.param === "yieldBufferBps")!.kind).toBe("governance");
  });

  it("proposes nothing when activity is thin", async () => {
    const thin = snapshot({ amm: { ...snapshot().amm, trades: 1 }, offers: { ...snapshot().offers, created: 0 } });
    const { d, chain, store } = deps({ snap: thin });
    const r = await runCycle(d, market);
    expect(chain.sent).toEqual([]);
    expect(r.decisions.every((x) => x.kind === "rejected")).toBe(true);
    expect(store.proposals).toEqual([]);
  });

  it("replaces non-compliant narration with the template and posts to X when enabled", async () => {
    const bad = { ...OUTPUT, post: "Chest rewards are guaranteed — 12% APY!" };
    const { d, store, poster } = deps({ out: bad, xEnabled: true });
    const r = await runCycle(d, market);
    expect(r.xPostId).toBe("x123");
    expect(poster.posts).toHaveLength(1);
    expect(copyViolations(poster.posts[0]!)).toEqual([]);
    expect(poster.posts[0]!.length).toBeLessThanOrEqual(280);
    expect(store.posts[0]!.usedFallbackCopy).toBe(true);
    expect(store.posts[0]!.xPostId).toBe("x123");
  });

  it("records failed runs without posting when the model refuses", async () => {
    const { d, store, poster, chain } = deps({ out: new AdvisorError("refusal", "declined", { model: "claude-opus-5-5" }), xEnabled: true });
    const r = await runCycle(d, market);
    expect(r).toMatchObject({ ok: false, errorCode: "refusal" });
    expect(store.posts).toEqual([]);
    expect(poster.posts).toEqual([]);
    expect(chain.sent).toEqual([]);
    expect(store.runs[0]).toMatchObject({ ok: false, errorCode: "refusal" });
  });

  it("keeps the post and records a failed action when the transaction fails", async () => {
    const { d, chain, store } = deps();
    chain.failNext = true;
    const r = await runCycle(d, market);
    expect(r.ok).toBe(true);
    expect(r.actions[0]).toMatchObject({ param: "yieldBufferBps", status: "failed" });
    expect(store.posts[0]!.feed).toContain("Not applied: yieldBufferBps (transaction failed).");
  });
});
