"use client";

import { priceToFloat } from "@backstop/sdk";
import Link from "next/link";

import { type Absorption, type MarketStats, paths } from "@/lib/api";
import { SOL_DECIMALS, TOKEN_DECIMALS, formatCompact, formatPrice, formatUnits, toBig } from "@/lib/format";
import { type MarketInfo, useMarketParams, useRootMarket, useSolUsd } from "@/lib/market";
import { useLiveOffers } from "@/lib/use-live-offers";
import { useApi } from "@/lib/use-api";
import { useLiveStatus } from "@/lib/live";

import { NextOffer, OfferBoard, type TokenUnits } from "../offers";
import { PriceChart } from "../price-chart";
import { ErrorNote, SectionTitle, Skeleton, SkeletonRows, StaleNote } from "../ui";

export const TOKEN_SYMBOL = "BACKSTOP";

export function useStats(market: MarketInfo | null) {
  const status = useLiveStatus();
  return useApi<MarketStats>(market ? paths.market(market.mint) : null, {
    refreshMs: status === "live" ? 30_000 : 10_000,
  });
}

/** Floor (SOL per token) and, when a SOL/USD reference exists, in quote units. */
export function useFloor(stats: MarketStats | undefined, market: MarketInfo | null) {
  const solUsd = useSolUsd();
  const floorSol = stats?.floor ? priceToFloat(toBig(stats.floor.floor_price), SOL_DECIMALS, TOKEN_DECIMALS) : null;
  const quoteIsSol = market?.quoteSymbol === "SOL";
  const floorInQuote = floorSol === null ? null : quoteIsSol ? floorSol : solUsd ? floorSol * solUsd : null;
  return { floorSol, floorInQuote, solUsd };
}

function StatsStrip({
  stats,
  market,
  floorSol,
}: {
  stats: MarketStats | undefined;
  market: MarketInfo;
  floorSol: number | null;
}) {
  const price = stats?.price ? priceToFloat(toBig(stats.price.price), market.quoteDecimals, TOKEN_DECIMALS) : null;
  const absorbedTokens = toBig(stats?.absorbedToday.holdersTokens) + toBig(stats?.absorbedToday.shieldTokens);
  const absorbedQuote = toBig(stats?.absorbedToday.holdersQuote) + toBig(stats?.absorbedToday.shieldQuote);
  const cell = (label: string, value: React.ReactNode, sub?: React.ReactNode, testId?: string) => (
    <div className="stat py-4 pr-4" data-testid={testId}>
      <dt>{label}</dt>
      <dd>{stats ? value : <Skeleton className="h-7 w-24" />}</dd>
      {sub && stats ? <dd className="sub">{sub}</dd> : null}
    </div>
  );
  return (
    <dl className="grid grid-cols-2 border-y border-line sm:grid-cols-3 lg:grid-cols-5" aria-label="Market summary">
      {cell(
        "Absorbed today",
        <>
          {formatCompact(absorbedTokens, TOKEN_DECIMALS)} <span className="text-base text-muted">{TOKEN_SYMBOL}</span>
        </>,
        <>
          for {formatUnits(absorbedQuote, market.quoteDecimals, 0)} {market.quoteSymbol}; Shield took{" "}
          {formatCompact(stats?.absorbedToday.shieldTokens, TOKEN_DECIMALS)}
        </>,
        "absorbed-today",
      )}
      {cell(
        "Price",
        <>
          {formatPrice(price)} <span className="text-base text-muted">{market.quoteSymbol}</span>
        </>,
      )}
      {cell(
        "24h volume",
        <>
          {formatCompact(stats?.volume24h, market.quoteDecimals)}{" "}
          <span className="text-base text-muted">{market.quoteSymbol}</span>
        </>,
      )}
      {cell("Live offers", <span data-testid="live-offer-count">{stats?.liveOffers ?? 0}</span>)}
      {cell(
        "Treasury floor",
        <>
          {floorSol === null ? "–" : formatPrice(floorSol)} <span className="text-base text-muted">SOL</span>
        </>,
        <Link href="/treasury" className="link">
          Redeem at the floor
        </Link>,
      )}
    </dl>
  );
}

export function AbsorptionMeter({ market, price }: { market: MarketInfo; price: number | null }) {
  const abs = useApi<Absorption>(paths.absorption(market.mint), { refreshMs: 30_000 });
  const { params } = useMarketParams(market);
  const shield = toBig(abs.data?.shieldDeposits);
  const shieldSlice = shield < params.shieldPerOfferCap ? shield : params.shieldPerOfferCap;
  const auto = toBig(abs.data?.autoAbsorbPerOffer);
  const total = shieldSlice + auto;
  const shieldShare = total > 0n ? Number((shieldSlice * 10_000n) / total) / 10_000 : 0;
  const tokensCovered = price && price > 0 ? Number(formatUnitsRaw(total, market.quoteDecimals)) / price : null;

  return (
    <section aria-labelledby="absorption" className="panel grid gap-5 self-start" data-testid="absorption-meter">
      <div>
        <h2 id="absorption" className="section-title">
          Absorption meter
        </h2>
        <p className="mt-1 text-sm text-muted">Estimated buying power waiting for the next offer.</p>
      </div>
      {abs.loading ? (
        <SkeletonRows rows={2} label="Loading absorption capacity" />
      ) : abs.error && !abs.data ? (
        <ErrorNote error={abs.error} onRetry={abs.refresh} what="absorption capacity" />
      ) : (
        <>
          <div>
            <p className="figure text-[2.5rem]">
              {formatUnits(total, market.quoteDecimals, 0)}{" "}
              <span className="text-lg text-muted">{market.quoteSymbol}</span>
            </p>
            <p className="text-sm text-muted">
              per offer
              {tokensCovered
                ? `, about ${formatCompact(BigInt(Math.floor(tokensCovered)), 0)} ${TOKEN_SYMBOL} at the current price`
                : ""}
            </p>
          </div>
          <div
            className="flex h-4 overflow-hidden rounded-sm bg-surface-2"
            role="img"
            aria-label={`Shield slice ${formatUnits(shieldSlice, market.quoteDecimals, 0)} ${market.quoteSymbol}, Auto-Absorb ${formatUnits(auto, market.quoteDecimals, 0)} ${market.quoteSymbol}`}
          >
            <span className="h-full bg-brass-fill" style={{ width: `${shieldShare * 100}%` }} />
            <span
              className="h-full border-l-2 border-surface bg-green"
              style={{ width: `${(1 - shieldShare) * 100}%`, display: total > 0n ? undefined : "none" }}
            />
          </div>
          <dl className="grid gap-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <dt className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm bg-brass-fill" />
                Shield deposits
              </dt>
              <dd className="text-right">
                <strong>{formatUnits(shield, market.quoteDecimals, 0)}</strong> {market.quoteSymbol}
                <span className="block text-muted">
                  up to {formatUnits(params.shieldPerOfferCap, market.quoteDecimals, 0)} and half of each offer
                </span>
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm bg-green" />
                Auto-Absorb capacity
              </dt>
              <dd className="text-right">
                <strong>{formatUnits(auto, market.quoteDecimals, 0)}</strong> {market.quoteSymbol}
                <span className="block text-muted">from {abs.data?.activeGrants ?? 0} chests</span>
              </dd>
            </div>
          </dl>
          <StaleNote stale={abs.stale} />
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link className="link" href="/shield">
              Lock in the Shield
            </Link>
            <Link className="link" href="/chest">
              Set up Auto-Absorb
            </Link>
          </p>
        </>
      )}
    </section>
  );
}

function formatUnitsRaw(v: bigint, decimals: number) {
  return formatUnits(v, decimals, decimals).replace(/,/g, "");
}

export function LiveView() {
  const { market, loading, error, refresh } = useRootMarket();
  if (!market) {
    return loading ? (
      <SkeletonRows rows={6} label="Loading market" />
    ) : (
      <ErrorNote error={error ?? new Error("Market not configured.")} onRetry={refresh} what="the market" />
    );
  }
  return <LiveMarket market={market} />;
}

function LiveMarket({ market }: { market: MarketInfo }) {
  const units: TokenUnits = {
    tokenSymbol: TOKEN_SYMBOL,
    quoteSymbol: market.quoteSymbol,
    quoteDecimals: market.quoteDecimals,
  };
  const stats = useStats(market);
  const live = useLiveOffers(market.mint);
  const { floorSol, floorInQuote } = useFloor(stats.data, market);
  const price = stats.data?.price
    ? priceToFloat(toBig(stats.data.price.price), market.quoteDecimals, TOKEN_DECIMALS)
    : null;
  const next = live.offers.find((o) => o.status === "open") ?? live.offers[0];

  return (
    <div className="grid gap-10 md:gap-14">
      <h1 className="sr-only">BACKSTOP live offers</h1>
      {live.loading ? (
        <Skeleton className="h-48" label="Loading the next offer" />
      ) : next ? (
        <NextOffer offer={next} units={units} />
      ) : (
        <section className="grid gap-3" aria-labelledby="quiet">
          <h2 id="quiet" className="page-title">
            The board is quiet.
          </h2>
          <p className="lede">
            No offers are taking bids. Every sale of 0.01% of supply or more is offered to holders first, for ten
            minutes, at a frozen discount.
          </p>
        </section>
      )}

      <div className="grid gap-2">
        <StatsStrip stats={stats.data} market={market} floorSol={floorSol} />
        <ErrorNote error={stats.data ? undefined : stats.error} onRetry={stats.refresh} what="market figures" />
        <StaleNote stale={stats.stale} />
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
        <section aria-labelledby="board">
          <SectionTitle
            id="board"
            aside={
              live.liveStatus === "live"
                ? "Updating live"
                : live.liveStatus === "offline"
                  ? "Live updates unavailable; refreshing every 5 seconds"
                  : "Connecting to live updates"
            }
          >
            Offers taking bids
          </SectionTitle>
          {live.loading ? (
            <SkeletonRows rows={4} label="Loading live offers" />
          ) : live.error && !live.data ? (
            <ErrorNote error={live.error} onRetry={live.refresh} what="live offers" />
          ) : (
            <OfferBoard offers={live.offers} units={units} fresh={live.fresh} />
          )}
          <StaleNote stale={live.stale} />
        </section>
        <AbsorptionMeter market={market} price={price} />
      </div>

      <section aria-labelledby="chart">
        <SectionTitle id="chart">Price and the treasury floor</SectionTitle>
        <PriceChart
          mint={market.mint}
          quoteDecimals={market.quoteDecimals}
          quoteSymbol={market.quoteSymbol}
          floorInQuote={floorInQuote}
          floorNote={
            floorSol === null
              ? "The treasury floor appears once the first treasury snapshot is indexed."
              : floorInQuote
                ? `Floor = treasury SOL ÷ circulating supply (${formatPrice(floorSol)} SOL per token), converted at the current SOL price.`
                : `Treasury floor: ${formatPrice(floorSol)} SOL per token. A SOL price reference is unavailable, so it is not drawn on this chart.`
          }
        />
      </section>

      <section aria-labelledby="how" className="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
        <h2 id="how" className="section-title">
          How an offer runs
        </h2>
        <ol className="grid gap-5 md:grid-cols-3">
          <li className="panel-flat">
            <p className="figure text-3xl text-brass">1</p>
            <p className="mt-2 font-semibold">The seller posts an offer</p>
            <p className="mt-1 text-muted">
              Tokens go into escrow and the discount is frozen from the on-chain price. Offers cannot be cancelled.
            </p>
          </li>
          <li className="panel-flat">
            <p className="figure text-3xl text-brass">2</p>
            <p className="mt-2 font-semibold">Ten minutes of bids</p>
            <p className="mt-1 text-muted">
              Holders bid from chests or wallets; the Shield can take up to half. Fully covered offers close at the end
              of the current minute.
            </p>
          </li>
          <li className="panel-flat">
            <p className="figure text-3xl text-brass">3</p>
            <p className="mt-2 font-semibold">Random pro-rata allocation</p>
            <p className="mt-1 text-muted">
              Oversubscribed lots are shared by randomised pro-rata; any unfilled remainder is sold on the AMM.
            </p>
          </li>
        </ol>
      </section>
    </div>
  );
}
