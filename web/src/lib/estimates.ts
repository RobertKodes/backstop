// Client-side estimates for display. Every figure here is an estimate: the
// on-chain programs freeze the actual discount/fill price at offer creation
// and compute allocations, penalties and payouts authoritatively.

import { BPS, DEFAULTS, PRICE_SCALE, discountBps, fillPrice, quoteSell } from "@backstop/sdk";

import { parseUnits, toBig } from "./format";

export const DAY = 86_400;

/** Market parameters the UI needs (mirror of the on-chain `MarketParams`). */
export interface UiParams {
  tradeFeeBps: number;
  splitChestBps: number;
  splitShieldBps: number;
  baseDiscountBps: number;
  kUpBps: number;
  kDownBps: number;
  minDiscountBps: number;
  maxDiscountBps: number;
  offerWindowSecs: number;
  bidEpochSecs: number;
  minOfferSize: bigint;
  lotsPerOffer: number;
  ticketValiditySecs: number;
  chestLockSecs: number;
  chestPenaltyBps: number;
  redemptionFeeBps: number;
  shieldPerOfferCap: bigint;
  shieldMaxShareBps: number;
  shieldMinLockSecs: number;
  shieldMaxMultiplierBps: number;
  priceTwapWindowSecs: number;
  momentumLookbackSecs: number;
  directSellHourlyCap: bigint;
}

/** Protocol defaults (spec §3); used until on-chain parameters are loaded. */
export function defaultParams(supply: bigint = DEFAULTS.totalSupply, quoteDecimals = 6): UiParams {
  const quoteUnit = 10n ** BigInt(quoteDecimals);
  return {
    tradeFeeBps: DEFAULTS.tradeFeeBps,
    splitChestBps: DEFAULTS.splitChestBps,
    splitShieldBps: DEFAULTS.splitShieldBps,
    baseDiscountBps: DEFAULTS.baseDiscountBps,
    kUpBps: 2_500,
    kDownBps: 1_500,
    minDiscountBps: 200,
    maxDiscountBps: 1_200,
    offerWindowSecs: DEFAULTS.offerWindowSecs,
    bidEpochSecs: DEFAULTS.bidEpochSecs,
    minOfferSize: minOfferSize(supply),
    lotsPerOffer: 100,
    ticketValiditySecs: DEFAULTS.ticketValiditySecs,
    chestLockSecs: DEFAULTS.chestLockSecs,
    chestPenaltyBps: DEFAULTS.chestPenaltyBps,
    redemptionFeeBps: DEFAULTS.redemptionFeeBps,
    shieldPerOfferCap: 10_000n * quoteUnit,
    shieldMaxShareBps: DEFAULTS.shieldMaxShareBps,
    shieldMinLockSecs: DEFAULTS.shieldMinLockSecs,
    shieldMaxMultiplierBps: 120_000,
    priceTwapWindowSecs: 300,
    momentumLookbackSecs: 3_600,
    directSellHourlyCap: supply / 1_000n,
  };
}

/** Minimum offer size = 0.01 % of supply (`backstop_common::defaults::min_offer_size`). */
export function minOfferSize(supply: bigint): bigint {
  return (supply / 10_000n) * 1n;
}

const ceilBps = (amount: bigint, bps: number) => (amount * BigInt(bps) + BPS - 1n) / BPS;

// ----------------------------------------------------------------- selling

export type SellPath = "offer" | "amm";

/** Sells below the minimum offer size go straight to the AMM (still taxed). */
export function sellPath(amount: bigint, minOffer: bigint): SellPath {
  return amount >= minOffer ? "offer" : "amm";
}

export interface CandleLike {
  bucket: string;
  close: string;
}

/**
 * Estimate momentum (bps) the way `create_offer` does: TWAP over the last
 * `windowSecs` vs. the price `lookbackSecs` ago, from indexed candles.
 * Returns 0 when there is not enough history (the program does the same).
 */
export function estimateMomentumBps(
  candles: CandleLike[],
  nowSecs: number,
  windowSecs = 300,
  lookbackSecs = 3_600,
): number {
  const pts = candles
    .map((c) => ({ t: Math.floor(new Date(c.bucket).getTime() / 1000), p: Number(toBig(c.close)) }))
    .filter((x) => Number.isFinite(x.t) && x.p > 0)
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return 0;
  const recent = pts.filter((x) => x.t >= nowSecs - windowSecs);
  const pNow = recent.length ? recent.reduce((s, x) => s + x.p, 0) / recent.length : pts[pts.length - 1]!.p;
  const older = pts.filter((x) => x.t <= nowSecs - lookbackSecs);
  const then = older.length ? older[older.length - 1]!.p : 0;
  if (!then) return 0;
  const m = Math.trunc(((pNow - then) / then) * 10_000);
  return Math.max(-100_000, Math.min(100_000, m));
}

export function estimateDiscountBps(momentumBps: number, p: UiParams): number {
  return discountBps(momentumBps, {
    baseBps: p.baseDiscountBps,
    kUpBps: p.kUpBps,
    kDownBps: p.kDownBps,
    minBps: p.minDiscountBps,
    maxBps: p.maxDiscountBps,
  });
}

export interface OfferEstimate {
  /** Fill price (quote base units per token base unit × 1e18). */
  fillPrice: bigint;
  /** Quote received if the whole offer is absorbed, before the trade fee. */
  gross: bigint;
  fee: bigint;
  net: bigint;
}

/** Fill price = TWAP × (1 − discount); the seller pays the trade fee on proceeds. */
export function estimateOffer(amount: bigint, twap: bigint, discount: number, tradeFeeBps: number): OfferEstimate {
  const price = fillPrice(twap, discount);
  const gross = (amount * price) / PRICE_SCALE;
  const fee = ceilBps(gross, tradeFeeBps);
  return { fillPrice: price, gross, fee, net: gross - fee };
}

/** Direct AMM sell quote (constant product, fee on output). */
export function estimateAmmSell(amount: bigint, baseReserve: bigint, quoteReserve: bigint, feeBps: number) {
  if (amount <= 0n || baseReserve <= 0n || quoteReserve <= 0n) return { fee: 0n, out: 0n };
  return quoteSell(amount, baseReserve, quoteReserve, feeBps);
}

// -------------------------------------------------------------- absorbing

/** Bids lock whole lots only: `floor(amount / lotCost)` lots (D-045). */
export function bidLots(amount: bigint, lotCost: bigint): { lots: bigint; locked: bigint } {
  if (lotCost <= 0n || amount <= 0n) return { lots: 0n, locked: 0n };
  const lots = amount / lotCost;
  return { lots, locked: lots * lotCost };
}

/** Fraction of an offer's lots covered by bids (can exceed 1 when oversubscribed). */
export function coverage(totalCapacity: bigint | string | number, lots: bigint | string | number): number {
  const l = Number(toBig(lots as string));
  if (!l) return 0;
  return Number(toBig(totalCapacity as string)) / l;
}

// ------------------------------------------------------------------ chest

export function withdrawPreview(amount: bigint, lockUntilSecs: number, nowSecs: number, penaltyBps: number) {
  const locked = nowSecs < lockUntilSecs;
  const penalty = locked ? ceilBps(amount, penaltyBps) : 0n;
  return { locked, penalty, net: amount - penalty };
}

export interface ChestEventLike {
  kind: number;
  assets: string;
  ts: string;
}

/**
 * Trailing variable yield estimate from the wallet's own harvests: harvested
 * rewards over the last `windowDays` relative to the current balance,
 * annualised. Returns null when there is nothing to base it on.
 */
export function estimateChestYield(
  events: ChestEventLike[],
  balance: bigint,
  nowSecs: number,
  windowDays = 30,
): number | null {
  if (balance <= 0n) return null;
  const since = nowSecs - windowDays * DAY;
  const harvested = events
    .filter((e) => e.kind === CHEST_EVENT.harvest && new Date(e.ts).getTime() / 1000 >= since)
    .reduce((s, e) => s + toBig(e.assets), 0n);
  if (harvested === 0n) return null;
  return (Number(harvested) / Number(balance)) * (365 / windowDays);
}

export const CHEST_EVENT = {
  deposit: 0,
  withdraw: 1,
  harvest: 2,
  bid: 3,
  refund: 4,
  shieldIn: 5,
  shieldOut: 6,
  shieldReward: 7,
} as const;

export const CHEST_EVENT_LABELS = [
  "Deposit",
  "Withdrawal",
  "Harvest",
  "Bid",
  "Refund",
  "Moved to Shield",
  "Returned from Shield",
  "Shield reward",
];

export interface GrantForm {
  enabled: boolean;
  maxPerOffer: string;
  maxPerDay: string;
  minDiscountPct: string;
  reserveFloor: string;
}

export interface GrantValue {
  enabled: boolean;
  maxPerOffer: bigint;
  maxPerDay: bigint;
  minDiscountBps: number;
  reserveFloor: bigint;
}

export type FormErrors<K extends string> = Partial<Record<K, string>>;

/** Validate the Auto-Absorb (grant) form. */
export function validateGrant(
  f: GrantForm,
  opts: { quoteDecimals: number; maxDiscountBps: number },
): { errors: FormErrors<keyof GrantForm>; value: GrantValue | null } {
  const errors: FormErrors<keyof GrantForm> = {};
  const maxPerOffer = parseUnits(f.maxPerOffer, opts.quoteDecimals);
  const maxPerDay = parseUnits(f.maxPerDay, opts.quoteDecimals);
  const reserveFloor = parseUnits(f.reserveFloor || "0", opts.quoteDecimals);
  const pct = f.minDiscountPct.trim();
  const pctOk = /^\d+(\.\d{1,2})?$/.test(pct);
  const minDiscountBps = pctOk ? Math.round(Number(pct) * 100) : NaN;

  if (maxPerOffer === null) errors.maxPerOffer = "Enter an amount, e.g. 250.";
  else if (f.enabled && maxPerOffer <= 0n) errors.maxPerOffer = "Max per offer must be more than 0.";
  if (maxPerDay === null) errors.maxPerDay = "Enter an amount, e.g. 1000.";
  else if (f.enabled && maxPerDay <= 0n) errors.maxPerDay = "Max per day must be more than 0.";
  else if (maxPerOffer !== null && maxPerDay < maxPerOffer)
    errors.maxPerDay = "Max per day must be at least the max per offer.";
  if (!pctOk) errors.minDiscountPct = "Enter a percentage with up to 2 decimals, e.g. 4.5.";
  else if (minDiscountBps > opts.maxDiscountBps)
    errors.minDiscountPct = `Offers never exceed a ${opts.maxDiscountBps / 100}% discount; use a lower minimum.`;
  if (reserveFloor === null) errors.reserveFloor = "Enter an amount, or 0 for no reserve.";

  if (Object.keys(errors).length) return { errors, value: null };
  return {
    errors,
    value: {
      enabled: f.enabled,
      maxPerOffer: maxPerOffer!,
      maxPerDay: maxPerDay!,
      minDiscountBps,
      reserveFloor: reserveFloor!,
    },
  };
}

// ------------------------------------------------------------------ shield

/** Lock multiplier in bps: lock / min lock, capped (exact port of `lock_multiplier_bps`). */
export function lockMultiplierBps(lockSecs: number, minLockSecs: number, maxBps: number): number | null {
  if (minLockSecs <= 0 || lockSecs < minLockSecs) return null;
  return Math.min(Math.floor((lockSecs * 10_000) / minLockSecs), maxBps);
}

export interface ShieldForm {
  amount: string;
  lockDays: string;
}

export const SHIELD_MAX_LOCK_DAYS = 3_650;

export function validateShieldLock(
  f: ShieldForm,
  opts: { quoteDecimals: number; minLockSecs: number; available: bigint | null },
): { errors: FormErrors<keyof ShieldForm>; value: { amount: bigint; lockSecs: number } | null } {
  const errors: FormErrors<keyof ShieldForm> = {};
  const amount = parseUnits(f.amount, opts.quoteDecimals);
  const minDays = Math.ceil(opts.minLockSecs / DAY);
  const days = /^\d+$/.test(f.lockDays.trim()) ? Number(f.lockDays.trim()) : NaN;
  if (amount === null || amount <= 0n) errors.amount = "Enter an amount greater than 0.";
  else if (opts.available !== null && amount > opts.available) errors.amount = "That is more than your chest balance.";
  if (!Number.isInteger(days)) errors.lockDays = "Enter a whole number of days.";
  else if (days < minDays) errors.lockDays = `Locks must be at least ${minDays} days.`;
  else if (days > SHIELD_MAX_LOCK_DAYS) errors.lockDays = `Locks can be at most ${SHIELD_MAX_LOCK_DAYS} days.`;
  if (Object.keys(errors).length) return { errors, value: null };
  return { errors, value: { amount: amount!, lockSecs: days * DAY } };
}

/**
 * Estimated base Shield fee APR (variable): annualised trailing-24h fees
 * routed to the Shield over total Shield deposits. Excludes token gains from
 * absorbing offers. Null when there are no deposits or no volume.
 */
export function estimateShieldApr(
  volume24h: bigint,
  tradeFeeBps: number,
  splitShieldBps: number,
  shieldDeposits: bigint,
): number | null {
  if (shieldDeposits <= 0n || volume24h <= 0n) return null;
  const fees = (volume24h * BigInt(tradeFeeBps)) / BPS;
  const toShield = (fees * BigInt(splitShieldBps)) / BPS;
  return (Number(toShield) * 365) / Number(shieldDeposits);
}

// ---------------------------------------------------------------- treasury

/** Redemption preview (exact port of `fees::redemption`). */
export function redeemPreview(amount: bigint, treasuryLamports: bigint, circulating: bigint, feeBps: number) {
  if (circulating <= 0n || amount <= 0n || amount > circulating) return null;
  const gross = (amount * treasuryLamports) / circulating;
  const fee = ceilBps(gross, feeBps);
  return { gross, fee, net: gross - fee };
}

/** Apply slippage tolerance to a minimum-out value. */
export function withSlippage(v: bigint, bps: number): bigint {
  return (v * (BPS - BigInt(bps))) / BPS;
}

// --------------------------------------------------------------- launchpad

/** Fraction of a child creator's allocation vested at `nowSecs` (linear). */
export function vestingProgress(vestingEndSecs: number, nowSecs: number, vestingSecs = 90 * DAY): number {
  if (!vestingEndSecs) return 0;
  const start = vestingEndSecs - vestingSecs;
  if (nowSecs <= start) return 0;
  if (nowSecs >= vestingEndSecs) return 1;
  return (nowSecs - start) / vestingSecs;
}
