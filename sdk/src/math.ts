// Client-side mirrors of `backstop-math` used for display and estimates.
// On-chain results are authoritative; these functions are exact ports where
// noted and are covered by parity tests.

import { BPS, PRICE_SCALE } from "./constants.js";

/** Little-endian u128/i128 from a 16-byte Pod field (`{ bytes: number[] }`). */
export function podU128(p: { bytes: number[] | Uint8Array }): bigint {
  let v = 0n;
  for (let i = 15; i >= 0; i--) v = (v << 8n) | BigInt(p.bytes[i] ?? 0);
  return v;
}

export function podI128(p: { bytes: number[] | Uint8Array }): bigint {
  const u = podU128(p);
  return u >= 1n << 127n ? u - (1n << 128n) : u;
}

/** Tenure at `now` = acc + balance × (now − last_ts). (exact) */
export function tenureAt(balance: bigint, acc: bigint, lastTs: number, now: number): bigint {
  return acc + balance * BigInt(Math.max(0, now - lastTs));
}

/** Multiplier in bps: 10_000 + extra × min(avg_age / cap, 1). (exact) */
export function multiplierBps(balance: bigint, tenure: bigint, capSecs: number, extraBps: number): number {
  if (balance === 0n) return 10_000;
  const age = tenure / balance;
  const capped = age > BigInt(capSecs) ? BigInt(capSecs) : age;
  return 10_000 + Number((BigInt(extraBps) * capped) / BigInt(capSecs));
}

/** Counter-cyclical discount (exact port of `discount::discount_bps`). */
export function discountBps(
  momentumBps: number,
  p = { baseBps: 500, kUpBps: 2_500, kDownBps: 1_500, minBps: 200, maxBps: 1_200 },
): number {
  const m = Math.max(-100_000, Math.min(100_000, Math.trunc(momentumBps)));
  const up = m > 0 ? Math.trunc((m * p.kUpBps) / 10_000) : 0;
  const down = m < 0 ? Math.trunc((-m * p.kDownBps) / 10_000) : 0;
  return Math.max(p.minBps, Math.min(p.maxBps, p.baseBps + up - down));
}

/** `twap × (1 − discount)` (exact). */
export function fillPrice(twap: bigint, discountBps: number): bigint {
  return (twap * (BPS - BigInt(discountBps))) / BPS;
}

/** Quote units per whole token for a scaled price, as a float for display. */
export function priceToFloat(price: bigint, quoteDecimals: number, baseDecimals = 9): number {
  return (Number(price) / Number(PRICE_SCALE)) * 10 ** (baseDecimals - quoteDecimals);
}

function ceilDivSigned(a: bigint, b: bigint): bigint {
  const q = a / b;
  const r = a % b;
  return r > 0n ? q + 1n : q;
}

/** Lots allocated to a bid (exact port of `allocation::allocate`). */
export function allocateLots(prefix: bigint, cap: bigint, total: bigint, available: bigint, offset: bigint): bigint {
  if (cap === 0n) return 0n;
  if (total <= available) return cap;
  const hi = ceilDivSigned((prefix + cap) * available - offset, total);
  const lo = ceilDivSigned(prefix * available - offset, total);
  return hi - lo;
}

/** Constant-product buy quote (exact port of `amm::buy`). */
export function quoteBuy(quoteIn: bigint, baseReserve: bigint, quoteReserve: bigint, feeBps: number) {
  const fee = (quoteIn * BigInt(feeBps) + BPS - 1n) / BPS;
  const net = quoteIn - fee;
  const out = (baseReserve * net) / (quoteReserve + net);
  return { fee, out };
}

/** Constant-product sell quote (exact port of `amm::sell`). */
export function quoteSell(baseIn: bigint, baseReserve: bigint, quoteReserve: bigint, feeBps: number) {
  const gross = (quoteReserve * baseIn) / (baseReserve + baseIn);
  const fee = (gross * BigInt(feeBps) + BPS - 1n) / BPS;
  return { fee, out: gross - fee };
}

/** Floor price in lamports per whole token. */
export function floorPerToken(treasuryLamports: bigint, circulating: bigint, decimals = 9): number {
  if (circulating === 0n) return 0;
  return (Number(treasuryLamports) / Number(circulating)) * 10 ** decimals;
}
