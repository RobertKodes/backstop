import { describe, expect, it } from "vitest";
import { autoBidAmount, chunkPlan, holdersToCheckpoint, nextOfferAction, OFFER_STATUS, shuffle } from "../src/planner.js";

const base = {
  status: OFFER_STATUS.OPEN,
  createdAt: 1_000,
  expiresAt: 1_600,
  coveredAt: 0,
  bidEpochSecs: 60,
  randSlot: 0,
  remainderSold: false,
  bidCount: 0,
  claimedCount: 0,
};

describe("offer state machine", () => {
  it("waits during the window and closes at expiry", () => {
    expect(nextOfferAction(base, 1_200, 10)).toBe("wait");
    expect(nextOfferAction(base, 1_600, 10)).toBe("close");
  });
  it("closes early only after the covering bid epoch ends", () => {
    const o = { ...base, coveredAt: 1_130 }; // epoch [1120,1180)
    expect(nextOfferAction(o, 1_150, 10)).toBe("wait");
    expect(nextOfferAction(o, 1_180, 10)).toBe("close");
  });
  it("settles after the committed slot and re-arms when its hash expired", () => {
    const o = { ...base, status: OFFER_STATUS.CLOSING, randSlot: 100 };
    expect(nextOfferAction(o, 2_000, 100)).toBe("wait");
    expect(nextOfferAction(o, 2_000, 101)).toBe("settle");
    expect(nextOfferAction(o, 2_000, 601)).toBe("rearm");
  });
  it("sells remainder, claims, then closes", () => {
    const o = { ...base, status: OFFER_STATUS.SETTLED, bidCount: 2, claimedCount: 0 };
    expect(nextOfferAction(o, 0, 0)).toBe("sellRemainder");
    expect(nextOfferAction({ ...o, remainderSold: true }, 0, 0)).toBe("claim");
    expect(nextOfferAction({ ...o, remainderSold: true, claimedCount: 2 }, 0, 0)).toBe("closeOffer");
  });
});

describe("auto-absorb sizing", () => {
  const g = { enabled: true, maxPerOffer: 100n, maxPerDay: 150n, minDiscountBps: 400, reserveFloor: 50n, keeper: null };
  const offer = { discountBps: 500, lots: 100n, lotCost: 7n };
  it("respects every limit and rounds to whole lots", () => {
    expect(autoBidAmount(g, { balance: 1_000n, dayStart: 0, daySpent: 0n }, offer, 10, "k")).toBe(98n);
    expect(autoBidAmount(g, { balance: 1_000n, dayStart: 0, daySpent: 100n }, offer, 10, "k")).toBe(49n);
    expect(autoBidAmount(g, { balance: 80n, dayStart: 0, daySpent: 0n }, offer, 10, "k")).toBe(28n);
    expect(autoBidAmount(g, { balance: 1_000n, dayStart: 0, daySpent: 150n }, offer, 86_400, "k")).toBe(98n);
  });
  it("skips disabled grants, low discounts and foreign keepers", () => {
    const c = { balance: 1_000n, dayStart: 0, daySpent: 0n };
    expect(autoBidAmount({ ...g, enabled: false }, c, offer, 0, "k")).toBe(0n);
    expect(autoBidAmount(g, c, { ...offer, discountBps: 300 }, 0, "k")).toBe(0n);
    expect(autoBidAmount({ ...g, keeper: "other" }, c, offer, 0, "k")).toBe(0n);
  });
});

describe("helpers", () => {
  it("chunks conversions", () => {
    expect(chunkPlan(250n, 100n)).toEqual([100n, 100n, 50n]);
    expect(chunkPlan(0n, 100n)).toEqual([]);
  });
  it("selects idle holders", () => {
    expect(holdersToCheckpoint([{ wallet: "a", rewardEpoch: 10 }, { wallet: "b", rewardEpoch: 400 }], 500)).toEqual(["a"]);
  });
  it("shuffles deterministically and preserves elements", () => {
    const xs = [1, 2, 3, 4, 5, 6];
    const a = shuffle(xs, 42);
    expect(a.sort()).toEqual(xs);
    expect(shuffle(xs, 7)).toEqual(shuffle(xs, 7));
  });
});

describe("route rewriting", () => {
  it("points a Jupiter route at the parent-share vault instead of the owner ATA", async () => {
    const { rewriteRouteSource } = await import("../src/jobs.js");
    const { Keypair } = await import("@solana/web3.js");
    const ata = Keypair.generate().publicKey;
    const vault = Keypair.generate().publicKey;
    const other = Keypair.generate().publicKey;
    const out = rewriteRouteSource(
      [
        { pubkey: other, isSigner: false, isWritable: false },
        { pubkey: ata, isSigner: false, isWritable: true },
      ],
      ata,
      vault,
    );
    expect(out.map((a) => a.pubkey.toBase58())).toEqual([other.toBase58(), vault.toBase58()]);
    expect(out[1]!.isWritable).toBe(true);
  });
});
