"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type MarketStats, type OfferDetail, type OfferRow, paths } from "./api";
import { type LiveEvent, evStr, useLiveEvents, useLiveStatus } from "./live";
import { mutateCache, revalidate, revalidatePrefix, useApi } from "./use-api";

const isoFromUnix = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
};

/** Build an offer row from an `OfferCreated` event (camelCase, unix seconds). */
export function offerFromEvent(d: Record<string, unknown>): OfferRow {
  return {
    offer: evStr(d, "offer"),
    mint: evStr(d, "mint"),
    id: evStr(d, "id"),
    seller: evStr(d, "seller"),
    amount: evStr(d, "amount"),
    lots: Number(d.lots ?? 0),
    lot_size: evStr(d, "lotSize"),
    lot_cost: evStr(d, "lotCost"),
    twap: evStr(d, "twap"),
    fill_price: evStr(d, "fillPrice"),
    discount_bps: Number(d.discountBps ?? 0),
    momentum_bps: evStr(d, "momentumBps"),
    message: typeof d.message === "string" ? d.message : null,
    created_at: isoFromUnix(d.createdAt),
    expires_at: isoFromUnix(d.expiresAt),
    status: "open",
    total_capacity: "0",
    bid_count: 0,
  };
}

/** Apply one live event to an offer row (returns null when the row should leave the live list). */
export function applyOfferEvent(row: OfferRow, ev: LiveEvent): OfferRow | null {
  const d = ev.data;
  switch (ev.name) {
    case "BidPlaced":
      return {
        ...row,
        total_capacity: evStr(d, "totalCapacity") || row.total_capacity,
        bid_count: (row.bid_count ?? 0) + 1,
      };
    case "BiddingClosed":
      return { ...row, status: "closing", closed_early: Boolean(d.early) };
    case "OfferSettled":
      return {
        ...row,
        status: "settled",
        shield_lots: Number(d.shieldLots ?? 0),
        bidder_lots: Number(d.bidderLots ?? 0),
        proceeds: evStr(d, "proceeds"),
        fee: evStr(d, "fee"),
        seller_net: evStr(d, "sellerNet"),
        remainder_tokens: evStr(d, "remainderTokens"),
        ticket_amount: evStr(d, "ticketAmount"),
      };
    case "OfferClosed":
      return { ...row, status: "closed" };
    default:
      return row;
  }
}

const OFFER_EVENTS = new Set([
  "OfferCreated",
  "BidPlaced",
  "BiddingClosed",
  "OfferSettled",
  "OfferClosed",
  "RemainderSold",
]);
const STATS_EVENTS = new Set(["Swapped", "BidClaimed", "ShieldAbsorbed", "OfferSettled", "TreasurySnapshot"]);

/**
 * Live offers for a market: REST snapshot, patched in place by WebSocket
 * events, re-polled every 20 s while the socket is up and every 5 s while it
 * is down (polling fallback).
 */
export function useLiveOffers(mint: string | null) {
  const status = useLiveStatus();
  const path = mint ? paths.offers(mint, "live") : null;
  const offers = useApi<OfferRow[]>(path, { refreshMs: status === "live" ? 20_000 : 5_000 });
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const statsTimer = useRef<number | null>(null);

  const scheduleStats = useCallback(() => {
    if (!mint || statsTimer.current !== null) return;
    statsTimer.current = window.setTimeout(() => {
      statsTimer.current = null;
      void revalidate(paths.market(mint));
      void revalidate(paths.absorption(mint));
      revalidatePrefix(`/v1/markets/${mint}/price`);
    }, 1_500);
  }, [mint]);

  useEffect(
    () => () => {
      if (statsTimer.current !== null) window.clearTimeout(statsTimer.current);
    },
    [],
  );

  useLiveEvents(mint, (ev) => {
    if (!path || !mint) return;
    if (OFFER_EVENTS.has(ev.name)) {
      const offerKey = evStr(ev.data, "offer");
      if (ev.name === "OfferCreated") {
        const row = offerFromEvent(ev.data);
        mutateCache<OfferRow[]>(path, (list) => {
          const cur = list ?? [];
          if (cur.some((o) => o.offer === row.offer)) return cur;
          return [...cur, row].sort((a, b) => a.expires_at.localeCompare(b.expires_at));
        });
        setFresh((s) => new Set(s).add(row.offer));
        window.setTimeout(
          () =>
            setFresh((s) => {
              const n = new Set(s);
              n.delete(row.offer);
              return n;
            }),
          2_000,
        );
        mutateCache<MarketStats>(paths.market(mint), (s) => (s ? { ...s, liveOffers: s.liveOffers + 1 } : s));
      } else {
        mutateCache<OfferRow[]>(path, (list) =>
          (list ?? [])
            .map((o) => (o.offer === offerKey ? applyOfferEvent(o, ev) : o))
            .filter((o): o is OfferRow => !!o && (o.status === "open" || o.status === "closing")),
        );
        // Keep an open offer page in sync too.
        mutateCache<OfferDetail>(paths.offer(offerKey), (d) => {
          if (!d) return d;
          const next = applyOfferEvent(d.offer, ev);
          return next ? { ...d, offer: next } : d;
        });
        if (ev.name === "BidPlaced") void revalidate(paths.offer(offerKey));
      }
    }
    if (STATS_EVENTS.has(ev.name)) scheduleStats();
  });

  const list = useMemo(
    () =>
      (offers.data ?? [])
        .filter((o) => o.status === "open" || o.status === "closing")
        .sort((a, b) => a.expires_at.localeCompare(b.expires_at)),
    [offers.data],
  );

  return { ...offers, offers: list, fresh, liveStatus: status };
}
