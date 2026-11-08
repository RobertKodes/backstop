import { describe, expect, it } from "vitest";

import { PARAMS, paramIndex, type ParamValues } from "../src/params.js";
import { type AuthorityView, boundsTable, decide } from "../src/policy.js";

const NOW = 1_800_000_000;

function current(): ParamValues {
  const v: ParamValues = {};
  for (const p of PARAMS) v[p.name] = 1n;
  Object.assign(v, {
    tradeFeeBps: 300n,
    splitChestBps: 7_000n,
    splitShieldBps: 1_000n,
    parentShareBps: 0n,
    baseDiscountBps: 500n,
    minDiscountBps: 200n,
    maxDiscountBps: 2_000n,
    offerWindowSecs: 600n,
    bidEpochSecs: 60n,
    lotsPerOffer: 100n,
    ticketValiditySecs: 86_400n,
    chestLockSecs: 7n * 86_400n,
    chestPenaltyBps: 500n,
    redemptionFeeBps: 100n,
    yieldBufferBps: 2_000n,
    shieldPerOfferCap: 10_000_000_000n,
    shieldMaxShareBps: 3_000n,
    shieldMinLockSecs: 86_400n,
    shieldMaxMultiplierBps: 20_000n,
    priceTwapWindowSecs: 300n,
    momentumLookbackSecs: 3_600n,
    maxSwapSlippageBps: 50n,
  });
  return v;
}

function authority(overrides: Record<string, { min: bigint; max: bigint; lastUpdate?: number }>): AuthorityView {
  return {
    agent: "agent",
    cooldownSecs: 3_600,
    bounds: PARAMS.map((p) => {
      const o = overrides[p.name];
      return o
        ? { enabled: true, min: o.min, max: o.max, lastUpdate: o.lastUpdate ?? 0 }
        : { enabled: false, min: 0n, max: 0n, lastUpdate: 0 };
    }),
  };
}

const opts = { now: NOW, maxActions: 2, maxStepBps: 2_500 };
const auth = authority({
  yieldBufferBps: { min: 1_500n, max: 3_000n },
  baseDiscountBps: { min: 300n, max: 800n },
  shieldPerOfferCap: { min: 5_000_000_000n, max: 20_000_000_000n },
});

describe("policy gate", () => {
  it("executes in-bounds proposals for agent-tunable parameters", () => {
    const [d] = decide([{ param: "yieldBufferBps", value: "2200", rationale: "r" }], current(), auth, opts);
    expect(d).toMatchObject({
      kind: "execute",
      value: "2200",
      clamped: false,
      paramIndex: paramIndex("yieldBufferBps"),
    });
  });

  it("routes non-tunable and out-of-bounds proposals to governance", () => {
    const ds = decide(
      [
        { param: "tradeFeeBps", value: "250", rationale: "r" },
        { param: "yieldBufferBps", value: "3500", rationale: "r" },
      ],
      current(),
      auth,
      opts,
    );
    expect(ds.map((d) => d.kind)).toEqual(["governance", "governance"]);
    expect(ds[0]!.reason).toMatch(/not agent-tunable/);
    expect(ds[1]!.reason).toMatch(/outside agent bounds/);
  });

  it("step-limits large moves to a fraction of the bound window", () => {
    // window 1500 → 25 % = 375; 2000 → 3000 is clamped to 2375
    const [d] = decide([{ param: "yieldBufferBps", value: "3000", rationale: "r" }], current(), auth, opts);
    expect(d).toMatchObject({ kind: "execute", value: "2375", clamped: true, requested: "3000" });
  });

  it("defers parameters that are cooling down", () => {
    const a = authority({ yieldBufferBps: { min: 1_500n, max: 3_000n, lastUpdate: NOW - 600 } });
    const [d] = decide([{ param: "yieldBufferBps", value: "2100", rationale: "r" }], current(), a, opts);
    expect(d!.kind).toBe("deferred");
    const [later] = decide([{ param: "yieldBufferBps", value: "2100", rationale: "r" }], current(), a, {
      ...opts,
      now: NOW + 3_000,
    });
    expect(later!.kind).toBe("execute");
  });

  it("rejects values that break cross-parameter invariants", () => {
    const a = authority({ baseDiscountBps: { min: 100n, max: 800n } });
    // base below minDiscountBps (200) violates min ≤ base ≤ max
    const [d] = decide([{ param: "baseDiscountBps", value: "150", rationale: "r" }], current(), a, {
      ...opts,
      maxStepBps: 10_000,
    });
    expect(d!.kind).toBe("rejected");
    expect(d!.reason).toMatch(/minDiscountBps must be ≤ baseDiscountBps/);
  });

  it("caps executions per cycle and rejects malformed, duplicate and no-op proposals", () => {
    const ds = decide(
      [
        { param: "yieldBufferBps", value: "2100", rationale: "r" },
        { param: "baseDiscountBps", value: "550", rationale: "r" },
        { param: "shieldPerOfferCap", value: "11000000000", rationale: "r" },
        { param: "yieldBufferBps", value: "2200", rationale: "dup" },
        { param: "lotsPerOffer", value: "-3", rationale: "bad" },
        { param: "chestPenaltyBps", value: "500", rationale: "same" },
        { param: "notAParam", value: "1", rationale: "x" },
      ],
      current(),
      auth,
      opts,
    );
    expect(ds.map((d) => d.kind)).toEqual([
      "execute",
      "execute",
      "deferred",
      "rejected",
      "rejected",
      "rejected",
      "rejected",
    ]);
    expect(ds[2]!.reason).toMatch(/action cap/);
  });

  it("disables everything when there is no authority", () => {
    const none: AuthorityView = { agent: "", cooldownSecs: 3_600, bounds: [] };
    const [d] = decide([{ param: "yieldBufferBps", value: "2100", rationale: "r" }], current(), none, opts);
    expect(d!.kind).toBe("governance");
  });

  it("renders a bounds table for every parameter", () => {
    const t = boundsTable(current(), auth, NOW);
    expect(t.split("\n")).toHaveLength(PARAMS.length);
    expect(t).toMatch(/yieldBufferBps = 2000 bps .*agent-tunable \[1500, 3000\]/);
    expect(t).toMatch(/tradeFeeBps = 300 bps .*governance only/);
  });
});
