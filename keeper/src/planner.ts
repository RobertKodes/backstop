// Pure decision logic for keeper jobs (unit-tested; no I/O).

export const OFFER_STATUS = { OPEN: 0, CLOSING: 1, SETTLED: 2 } as const;
export const SLOT_HASH_RETENTION = 500;

export interface OfferView {
  status: number;
  createdAt: number;
  expiresAt: number;
  coveredAt: number;
  bidEpochSecs: number;
  randSlot: number;
  remainderSold: boolean;
  bidCount: number;
  claimedCount: number;
}

export type OfferAction = "close" | "settle" | "rearm" | "sellRemainder" | "claim" | "closeOffer" | "wait";

/** Next keeper action for an offer (mirrors the on-chain state machine). */
export function nextOfferAction(o: OfferView, now: number, slot: number): OfferAction {
  if (o.status === OFFER_STATUS.OPEN) {
    let early = false;
    if (o.coveredAt > 0) {
      const e = Math.max(1, o.bidEpochSecs);
      const epochEnd = o.createdAt + (Math.floor((o.coveredAt - o.createdAt) / e) + 1) * e;
      early = now >= epochEnd;
    }
    return now >= o.expiresAt || early ? "close" : "wait";
  }
  if (o.status === OFFER_STATUS.CLOSING) {
    if (slot > o.randSlot + SLOT_HASH_RETENTION) return "rearm";
    return slot > o.randSlot ? "settle" : "wait";
  }
  if (!o.remainderSold) return "sellRemainder";
  if (o.claimedCount < o.bidCount) return "claim";
  return "closeOffer";
}

export interface GrantView {
  enabled: boolean;
  maxPerOffer: bigint;
  maxPerDay: bigint;
  minDiscountBps: number;
  reserveFloor: bigint;
  keeper: string | null;
}

export interface ChestView {
  balance: bigint;
  dayStart: number;
  daySpent: bigint;
}

/**
 * Amount to Auto-Absorb for one user on one offer (0 = skip), respecting the
 * same limits the program enforces, rounded down to whole lots and capped at
 * the full offer (bidding beyond total lots only locks funds needlessly).
 */
export function autoBidAmount(
  g: GrantView,
  c: ChestView,
  offer: { discountBps: number; lots: bigint; lotCost: bigint },
  now: number,
  keeper: string,
): bigint {
  if (!g.enabled) return 0n;
  if (g.keeper && g.keeper !== keeper && g.keeper !== "11111111111111111111111111111111") return 0n;
  if (offer.discountBps < g.minDiscountBps) return 0n;
  const spent = now - c.dayStart >= 86_400 ? 0n : c.daySpent;
  const dayLeft = g.maxPerDay > spent ? g.maxPerDay - spent : 0n;
  const aboveFloor = c.balance > g.reserveFloor ? c.balance - g.reserveFloor : 0n;
  let amt = g.maxPerOffer;
  for (const lim of [dayLeft, aboveFloor, offer.lots * offer.lotCost]) if (lim < amt) amt = lim;
  return (amt / offer.lotCost) * offer.lotCost;
}

/** Split a conversion into chunks ≤ `maxChunk` (TWAP execution). */
export function chunkPlan(total: bigint, maxChunk: bigint): bigint[] {
  if (total <= 0n || maxChunk <= 0n) return [];
  const out: bigint[] = [];
  let left = total;
  while (left > 0n) {
    const c = left > maxChunk ? maxChunk : left;
    out.push(c);
    left -= c;
  }
  return out;
}

/** Holders whose last reward checkpoint is about to leave the 512-epoch ring. */
export function holdersToCheckpoint(holders: { wallet: string; rewardEpoch: number }[], currentEpoch: number, threshold = 300): string[] {
  return holders.filter((h) => currentEpoch - h.rewardEpoch > threshold).map((h) => h.wallet);
}

/** Deterministic Fisher–Yates with a seed (fair ordering of Auto-Absorb users). */
export function shuffle<T>(items: T[], seed: number): T[] {
  const a = [...items];
  let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const j = (s >>> 0) % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
