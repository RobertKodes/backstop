"use client";

import { priceToFloat } from "@backstop/sdk";
import Link from "next/link";

import type { OfferRow } from "@/lib/api";
import { coverage } from "@/lib/estimates";
import { TOKEN_DECIMALS, formatBps, formatCompact, formatPercent, formatPrice, formatUnits, toBig } from "@/lib/format";
import { cleanSellerMessage } from "@/lib/profanity";

import { Address, Countdown, EmptyState, Meter, useRemaining } from "./ui";

export interface TokenUnits {
  tokenSymbol: string;
  quoteSymbol: string;
  quoteDecimals: number;
}

export function offerStatusLabel(o: Pick<OfferRow, "status">, remaining: number): string {
  if (o.status === "settled") return "Settled";
  if (o.status === "closed") return "Closed";
  if (o.status === "closing" || remaining <= 0) return "Allocating";
  return "Taking bids";
}

function CoverageLine({ o }: { o: OfferRow }) {
  const c = coverage(o.total_capacity, o.lots);
  return (
    <div className="grid gap-1">
      <Meter
        value={Math.min(1, c)}
        tone={c >= 1 ? "green" : "brass"}
        label={`Offer No. ${o.id} bid coverage`}
        valueText={`${formatPercent(c, 0)} of lots covered by bids`}
      />
      <span className="text-sm text-muted">
        {c >= 1 ? `Oversubscribed ${formatPercent(c, 0)}` : `${formatPercent(c, 0)} covered`}
        {o.bid_count ? `, ${o.bid_count} bid${o.bid_count === 1 ? "" : "s"}` : ""}
      </span>
    </div>
  );
}

function BoardRow({ o, units, fresh }: { o: OfferRow; units: TokenUnits; fresh: boolean }) {
  const remaining = useRemaining(o.expires_at);
  const closing = o.status !== "open" || remaining <= 0;
  return (
    <li
      className="board-row relative"
      data-fresh={fresh ? "true" : undefined}
      data-testid="offer-row"
      data-offer={o.offer}
    >
      <div className="flex items-center gap-2 md:block">
        <Link
          href={`/offers/${o.offer}`}
          className="font-semibold after:absolute after:inset-0 after:content-[''] hover:underline"
          aria-label={`No. ${o.id}: offer of ${formatUnits(o.amount, TOKEN_DECIMALS, 0)} ${units.tokenSymbol} at ${formatBps(o.discount_bps)} off`}
        >
          No. {o.id}
        </Link>
        {closing ? (
          <span className="badge md:mt-1" data-tone="red">
            Allocating
          </span>
        ) : null}
      </div>
      <div className="col-start-1 row-start-2 grid gap-0.5 md:col-start-auto md:row-start-auto">
        <span className="figure text-xl" title={`${formatUnits(o.amount, TOKEN_DECIMALS, 4)} ${units.tokenSymbol}`}>
          {formatCompact(o.amount, TOKEN_DECIMALS)}{" "}
          <span className="text-base font-semibold text-muted">{units.tokenSymbol}</span>
        </span>
        <span className="text-sm text-muted">
          Seller <Address value={o.seller} link={false} />
        </span>
      </div>
      <div className="col-start-2 row-start-2 text-right md:col-start-auto md:row-start-auto md:text-left">
        <span className="figure text-xl">{formatBps(o.discount_bps, 1)}</span>
        <span className="block text-sm text-muted">discount</span>
      </div>
      <div className="col-span-2 row-start-3 md:col-span-1 md:row-start-auto">
        <CoverageLine o={o} />
      </div>
      <div className="col-start-2 row-start-1 justify-self-end text-right md:col-start-auto md:row-start-auto">
        <Countdown
          expiresAt={o.expires_at}
          className="text-[2rem] md:text-[2.25rem]"
          doneLabel="Bidding closed, allocating"
        />
      </div>
    </li>
  );
}

export function OfferBoard({ offers, units, fresh }: { offers: OfferRow[]; units: TokenUnits; fresh?: Set<string> }) {
  if (!offers.length) {
    return (
      <EmptyState title="No offers on the board right now">
        When a holder sells at least 0.01% of supply, their tokens appear here for ten minutes so chests and the Shield
        can absorb them at a discount.
      </EmptyState>
    );
  }
  return (
    <ul className="border-t border-line" aria-label="Live offers, soonest to close first" data-testid="offer-board">
      {offers.map((o) => (
        <BoardRow key={o.offer} o={o} units={units} fresh={fresh?.has(o.offer) ?? false} />
      ))}
    </ul>
  );
}

/** The next offer to close, shown as the page's public clock. */
export function NextOffer({ offer, units }: { offer: OfferRow; units: TokenUnits }) {
  const remaining = useRemaining(offer.expires_at);
  const fill = priceToFloat(toBig(offer.fill_price), units.quoteDecimals, TOKEN_DECIMALS);
  const msg = cleanSellerMessage(offer.message);
  return (
    <section
      aria-labelledby="next-offer"
      className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-end md:gap-10"
      data-testid="next-offer"
    >
      <div>
        <h2 id="next-offer" className="label mb-2 text-base">
          Offer No. {offer.id} {remaining > 0 && offer.status === "open" ? "closes in" : "is allocating"}
        </h2>
        <Countdown expiresAt={offer.expires_at} className="block text-[5.5rem] sm:text-[7.5rem] md:text-[9rem]" />
      </div>
      <div className="grid gap-4 md:pb-3">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <div className="stat">
            <dt>Size</dt>
            <dd title={`${formatUnits(offer.amount, TOKEN_DECIMALS, 4)} ${units.tokenSymbol}`}>
              {formatCompact(offer.amount, TOKEN_DECIMALS)}{" "}
              <span className="text-base text-muted">{units.tokenSymbol}</span>
            </dd>
          </div>
          <div className="stat">
            <dt>Frozen discount</dt>
            <dd>{formatBps(offer.discount_bps)}</dd>
          </div>
          <div className="stat">
            <dt>Fill price</dt>
            <dd>
              {formatPrice(fill)} <span className="text-base text-muted">{units.quoteSymbol}</span>
            </dd>
          </div>
          <div className="stat">
            <dt>Covered</dt>
            <dd>{formatPercent(coverage(offer.total_capacity, offer.lots), 0)}</dd>
          </div>
        </dl>
        {msg ? (
          <blockquote className="border-l-4 border-line-strong pl-3 text-muted">
            <span className="sr-only">Seller&apos;s message: </span>&ldquo;{msg}&rdquo;
          </blockquote>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Link href={`/offers/${offer.offer}`} className="btn btn-primary btn-lg">
            Absorb offer No. {offer.id}
          </Link>
        </div>
      </div>
    </section>
  );
}
