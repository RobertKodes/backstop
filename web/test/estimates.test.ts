import { describe, expect, it } from "vitest";

import {
  DAY,
  bidLots,
  coverage,
  defaultParams,
  estimateAmmSell,
  estimateChestYield,
  estimateDiscountBps,
  estimateMomentumBps,
  estimateOffer,
  estimateShieldApr,
  lockMultiplierBps,
  minOfferSize,
  redeemPreview,
  sellPath,
  validateGrant,
  validateShieldLock,
  vestingProgress,
  withSlippage,
  withdrawPreview,
} from "@/lib/estimates";

const SUPPLY = 1_000_000_000n * 10n ** 9n;
const PRICE = 50_000_000_000_000n; // 0.05 USDC per token

describe("sell estimates", () => {
  it("routes sells below 0.01% of supply to the AMM", () => {
    const min = minOfferSize(SUPPLY);
    expect(min).toBe(100_000n * 10n ** 9n);
    expect(sellPath(min, min)).toBe("offer");
    expect(sellPath(min - 1n, min)).toBe("amm");
  });

  it("fill price = TWAP × (1 − discount), seller pays the 3% fee", () => {
    const amount = 200_000n * 10n ** 9n; // 200k tokens
    const e = estimateOffer(amount, PRICE, 500, 300);
    expect(e.fillPrice).toBe(47_500_000_000_000n);
    expect(e.gross).toBe(9_500_000_000n); // 9,500 USDC
    expect(e.fee).toBe(285_000_000n); // 3%
    expect(e.net).toBe(9_215_000_000n);
  });

  it("discount follows the counter-cyclical curve within bounds", () => {
    const p = defaultParams();
    expect(estimateDiscountBps(0, p)).toBe(500);
    expect(estimateDiscountBps(10_000, p)).toBe(1_200); // pump: capped at the max
    expect(estimateDiscountBps(-10_000, p)).toBe(200); // dump: floored at the min
  });

  it("estimates momentum from candles", () => {
    const now = 1_700_000_000;
    const candles = [
      { bucket: new Date((now - 3_700) * 1000).toISOString(), close: "100" },
      { bucket: new Date((now - 120) * 1000).toISOString(), close: "110" },
    ];
    expect(estimateMomentumBps(candles, now)).toBe(1_000);
    expect(estimateMomentumBps([], now)).toBe(0);
  });

  it("quotes the AMM path and handles empty pools", () => {
    const r = estimateAmmSell(1_000n * 10n ** 9n, 300_000_000n * 10n ** 9n, 15_000_000n * 10n ** 6n, 300);
    expect(r.out).toBeGreaterThan(48_000_000n);
    expect(r.out).toBeLessThan(50_000_000n);
    expect(estimateAmmSell(1n, 0n, 0n, 300)).toEqual({ fee: 0n, out: 0n });
  });
});

describe("absorbing", () => {
  it("locks whole lots only", () => {
    expect(bidLots(500_000_000n, 234_500_000n)).toEqual({ lots: 2n, locked: 469_000_000n });
    expect(bidLots(100n, 234_500_000n)).toEqual({ lots: 0n, locked: 0n });
    expect(coverage("64", 100)).toBeCloseTo(0.64);
  });
});

describe("chest", () => {
  it("charges the 25% penalty only while locked", () => {
    expect(withdrawPreview(100_000_000n, 2_000, 1_000, 2_500)).toEqual({
      locked: true,
      penalty: 25_000_000n,
      net: 75_000_000n,
    });
    expect(withdrawPreview(100_000_000n, 1_000, 2_000, 2_500)).toEqual({
      locked: false,
      penalty: 0n,
      net: 100_000_000n,
    });
    expect(withdrawPreview(3n, 2_000, 1_000, 2_500).penalty).toBe(1n); // rounds up, like the program
  });

  it("estimates variable yield from recent harvests", () => {
    const now = 1_700_000_000;
    const ev = [{ kind: 2, assets: "10000000", ts: new Date((now - 5 * DAY) * 1000).toISOString() }];
    expect(estimateChestYield(ev, 1_000_000_000n, now)).toBeCloseTo(0.1217, 3);
    expect(estimateChestYield([], 1_000_000_000n, now)).toBeNull();
  });

  it("validates Auto-Absorb settings", () => {
    const opts = { quoteDecimals: 6, maxDiscountBps: 1_200 };
    const ok = validateGrant(
      { enabled: true, maxPerOffer: "250", maxPerDay: "1000", minDiscountPct: "4.5", reserveFloor: "0" },
      opts,
    );
    expect(ok.value).toEqual({
      enabled: true,
      maxPerOffer: 250_000_000n,
      maxPerDay: 1_000_000_000n,
      minDiscountBps: 450,
      reserveFloor: 0n,
    });
    const bad = validateGrant(
      { enabled: true, maxPerOffer: "250", maxPerDay: "100", minDiscountPct: "15", reserveFloor: "x" },
      opts,
    );
    expect(bad.value).toBeNull();
    expect(bad.errors.maxPerDay).toMatch(/at least the max per offer/);
    expect(bad.errors.minDiscountPct).toMatch(/12%/);
    expect(bad.errors.reserveFloor).toBeDefined();
  });
});

describe("shield", () => {
  it("multiplier = lock / 30 days, capped at 12x", () => {
    expect(lockMultiplierBps(30 * DAY, 30 * DAY, 120_000)).toBe(10_000);
    expect(lockMultiplierBps(45 * DAY, 30 * DAY, 120_000)).toBe(15_000);
    expect(lockMultiplierBps(720 * DAY, 30 * DAY, 120_000)).toBe(120_000);
    expect(lockMultiplierBps(29 * DAY, 30 * DAY, 120_000)).toBeNull();
  });

  it("validates the lock form", () => {
    const opts = { quoteDecimals: 6, minLockSecs: 30 * DAY, available: 1_500_000_000n };
    expect(validateShieldLock({ amount: "100", lockDays: "60" }, opts).value).toEqual({
      amount: 100_000_000n,
      lockSecs: 60 * DAY,
    });
    expect(validateShieldLock({ amount: "100", lockDays: "10" }, opts).errors.lockDays).toMatch(/at least 30 days/);
    expect(validateShieldLock({ amount: "2000", lockDays: "60" }, opts).errors.amount).toMatch(/chest balance/);
    const both = validateShieldLock({ amount: "0", lockDays: "1.5" }, opts).errors;
    expect(both.amount).toBeDefined();
    expect(both.lockDays).toBeDefined();
  });

  it("estimates a variable fee APR", () => {
    // 820k volume × 3% × 10% × 365 / 450k
    expect(estimateShieldApr(820_000_000_000n, 300, 1_000, 450_000_000_000n)).toBeCloseTo(1.995, 2);
    expect(estimateShieldApr(0n, 300, 1_000, 1n)).toBeNull();
  });
});

describe("treasury and launchpad", () => {
  it("previews redemption (pro-rata minus 1%)", () => {
    const r = redeemPreview(1_000n * 10n ** 9n, 120_000n * 10n ** 9n, 600_000_000n * 10n ** 9n, 100);
    expect(r).toEqual({ gross: 200_000_000n, fee: 2_000_000n, net: 198_000_000n });
    expect(redeemPreview(10n, 1n, 5n, 100)).toBeNull();
    expect(withSlippage(198_000_000n, 50)).toBe(197_010_000n);
  });

  it("tracks linear vesting", () => {
    const end = 1_000 * DAY;
    expect(vestingProgress(end, end - 90 * DAY)).toBe(0);
    expect(vestingProgress(end, end - 45 * DAY)).toBeCloseTo(0.5);
    expect(vestingProgress(end, end + 1)).toBe(1);
    expect(vestingProgress(0, end)).toBe(0);
  });
});
