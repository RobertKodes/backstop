import type { Snapshot } from "../src/snapshot.js";

export const MINT = "So11111111111111111111111111111111111111112";

export function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    mint: MINT,
    generatedAt: "2026-11-08T12:00:00.000Z",
    windowHours: 24,
    quote: "USDC",
    price: { last: 0.0123, open24h: 0.012, high24h: 0.013, low24h: 0.0115, changePct24h: 2.5 },
    amm: { trades: 140, buyVolume: 52_000, sellVolume: 31_000, remainderVolume: 4_000, ticketVolume: 300, fees: 2_490 },
    offers: {
      created: 22,
      settled: 21,
      tokensOffered: 4_100_000,
      avgDiscountBps: 610,
      maxDiscountBps: 900,
      absorptionRate: 0.71,
      shieldLotShare: 0.18,
      remainderTokensToAmm: 1_100_000,
      openNow: 1,
    },
    chests: { count: 812, totalBalance: 380_000, deposits24h: 21_000, withdrawals24h: 5_000, penalties24h: 120, absorbed24h: 33_000 },
    shield: { totalDeposits: 120_000, absorbedQuote24h: 9_000, absorbedTokens24h: 700_000 },
    fees: { distributed: 2_400, toChests: 1_680, toShield: 240, toTreasury: 480, toParent: 0 },
    treasury: { sol: 1_250, floorPrice: 0.0000021, circulating: 590_000_000, redemptions24h: 2, redeemedTokens24h: 50_000 },
    yieldAdapter: { deployed: 300_000, idle: 80_000, idleShare: 0.21 },
    holders: { registered: 2_400, new24h: 41 },
    children: { live: 3, launched24h: 1, symbols: ["FROG"] },
    recentParamChanges: [],
    ...over,
  };
}

export const silentLog = { info() {}, warn() {}, error() {} };
