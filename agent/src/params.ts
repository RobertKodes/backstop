// Catalogue of governable parameters (mirror of `backstop_core::state::ParamId`
// and `MarketParams`, same order). The agent may *propose* any of them; it can
// only *execute* those governance enabled in its on-chain AgentAuthority.

export type Unit = "bps" | "secs" | "tokens" | "quote" | "count";

export interface ParamDef {
  /** Anchor enum variant / MarketParams field (camelCase). */
  name: string;
  unit: Unit;
  description: string;
}

export const PARAMS: readonly ParamDef[] = [
  { name: "tradeFeeBps", unit: "bps", description: "AMM trade fee" },
  { name: "splitChestBps", unit: "bps", description: "Share of fees to holder chests" },
  { name: "splitShieldBps", unit: "bps", description: "Share of fees to Shield stakers" },
  { name: "parentShareBps", unit: "bps", description: "Share of fees routed to the parent market (children only)" },
  { name: "baseDiscountBps", unit: "bps", description: "Base discount offered to absorbers on each sell offer" },
  { name: "kUpBps", unit: "bps", description: "Discount increase per unit of sell momentum" },
  { name: "kDownBps", unit: "bps", description: "Discount decrease per unit of buy momentum" },
  { name: "minDiscountBps", unit: "bps", description: "Lower clamp of the counter-cyclical discount" },
  { name: "maxDiscountBps", unit: "bps", description: "Upper clamp of the counter-cyclical discount" },
  { name: "offerWindowSecs", unit: "secs", description: "How long an offer stays open to holders" },
  { name: "bidEpochSecs", unit: "secs", description: "Bid batching epoch inside an offer window" },
  {
    name: "minOfferSize",
    unit: "tokens",
    description: "Smallest sell that becomes an offer (smaller sells go to the AMM)",
  },
  { name: "lotsPerOffer", unit: "count", description: "Lots an offer is split into for randomised allocation" },
  { name: "ticketValiditySecs", unit: "secs", description: "Return Ticket validity" },
  { name: "chestLockSecs", unit: "secs", description: "Chest withdrawal time-lock" },
  { name: "chestPenaltyBps", unit: "bps", description: "Penalty for early chest withdrawal" },
  { name: "redemptionFeeBps", unit: "bps", description: "Treasury redemption fee" },
  {
    name: "yieldBufferBps",
    unit: "bps",
    description: "Share of chest USDC kept idle (not deployed to the variable-rate lending adapter)",
  },
  { name: "shieldPerOfferCap", unit: "quote", description: "Max quote the Shield commits to a single offer" },
  { name: "shieldMaxShareBps", unit: "bps", description: "Max share of an offer the Shield may take" },
  { name: "shieldMinLockSecs", unit: "secs", description: "Minimum Shield lock" },
  { name: "shieldMaxMultiplierBps", unit: "bps", description: "Max Shield lock multiplier" },
  {
    name: "shieldMaxPremiumBps",
    unit: "bps",
    description: "Shield skips offers whose short TWAP exceeds the hourly TWAP by more than this",
  },
  { name: "priceTwapWindowSecs", unit: "secs", description: "TWAP window used to price offers" },
  { name: "momentumLookbackSecs", unit: "secs", description: "Lookback for the sell/buy momentum signal" },
  { name: "directSellHourlyCap", unit: "tokens", description: "Global hourly cap on direct (sub-minimum) AMM sells" },
  { name: "maxSwapSlippageBps", unit: "bps", description: "Max slippage vs oracle on keeper fee swaps" },
  { name: "maxSwapChunk", unit: "quote", description: "Largest single keeper swap (bigger ones are chunked)" },
] as const;

export const PARAM_NAMES = PARAMS.map((p) => p.name) as [string, ...string[]];
export const paramIndex = (name: string): number => PARAMS.findIndex((p) => p.name === name);

export type ParamValues = Record<string, bigint>;

/**
 * Off-chain mirror of `MarketParams::validate` — lets the agent explain why a
 * proposal would be rejected before spending a transaction. The program is the
 * authority; this only avoids obviously failing sends.
 */
export function validateParams(p: ParamValues): string[] {
  const g = (k: string) => p[k] ?? 0n;
  const errs: string[] = [];
  const check = (ok: boolean, msg: string) => {
    if (!ok) errs.push(msg);
  };
  check(g("tradeFeeBps") <= 1_000n, "tradeFeeBps must be ≤ 1000");
  check(g("splitChestBps") + g("splitShieldBps") <= 10_000n, "splitChestBps + splitShieldBps must be ≤ 10000");
  check(g("parentShareBps") <= 10_000n, "parentShareBps must be ≤ 10000");
  check(g("minDiscountBps") <= g("baseDiscountBps"), "minDiscountBps must be ≤ baseDiscountBps");
  check(g("baseDiscountBps") <= g("maxDiscountBps"), "baseDiscountBps must be ≤ maxDiscountBps");
  check(g("maxDiscountBps") < 5_000n, "maxDiscountBps must be < 5000");
  check(g("offerWindowSecs") >= 60n && g("offerWindowSecs") <= 86_400n, "offerWindowSecs must be in [60, 86400]");
  check(
    g("bidEpochSecs") > 0n && g("bidEpochSecs") <= g("offerWindowSecs"),
    "bidEpochSecs must be in (0, offerWindowSecs]",
  );
  check(g("minOfferSize") > 0n, "minOfferSize must be > 0");
  check(g("lotsPerOffer") >= 1n && g("lotsPerOffer") <= 1_000n, "lotsPerOffer must be in [1, 1000]");
  check(g("ticketValiditySecs") <= 90n * 86_400n, "ticketValiditySecs must be ≤ 90 days");
  check(g("chestLockSecs") <= 365n * 86_400n, "chestLockSecs must be ≤ 365 days");
  check(g("chestPenaltyBps") <= 5_000n, "chestPenaltyBps must be ≤ 5000");
  check(g("redemptionFeeBps") <= 1_000n, "redemptionFeeBps must be ≤ 1000");
  check(g("yieldBufferBps") <= 10_000n, "yieldBufferBps must be ≤ 10000");
  check(g("shieldMaxShareBps") <= 10_000n, "shieldMaxShareBps must be ≤ 10000");
  check(g("shieldMinLockSecs") >= 86_400n, "shieldMinLockSecs must be ≥ 1 day");
  check(g("shieldMaxMultiplierBps") >= 10_000n, "shieldMaxMultiplierBps must be ≥ 10000");
  check(g("priceTwapWindowSecs") >= 60n, "priceTwapWindowSecs must be ≥ 60");
  check(g("momentumLookbackSecs") >= g("priceTwapWindowSecs"), "momentumLookbackSecs must be ≥ priceTwapWindowSecs");
  check(g("maxSwapSlippageBps") <= 500n, "maxSwapSlippageBps must be ≤ 500");
  check(g("maxSwapChunk") > 0n, "maxSwapChunk must be > 0");
  return errs;
}
