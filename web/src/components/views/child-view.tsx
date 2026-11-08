"use client";

import { LaunchpadClient, WSOL, priceToFloat } from "@backstop/sdk";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useMemo } from "react";

import { type ChildRow, paths } from "@/lib/api";
import { TOKEN_DECIMALS, formatCompact, formatPrice, toBig } from "@/lib/format";
import { type MarketInfo, isValidAddress } from "@/lib/market";
import { useSendTx } from "@/lib/tx";
import { useLiveOffers } from "@/lib/use-live-offers";
import { useApi } from "@/lib/use-api";

import { OfferBoard } from "../offers";
import { PriceChart } from "../price-chart";
import { RiskPanel } from "../risk-panel";
import { Address, EmptyState, ErrorNote, SectionTitle, SkeletonRows } from "../ui";
import { useFloor, useStats } from "./live-view";

export function ChildView({ mint }: { mint: string }) {
  const valid = isValidAddress(mint);
  const child = useApi<ChildRow>(valid ? paths.child(mint) : null, { refreshMs: 60_000 });
  if (!valid) return <EmptyState title="That is not a valid token address" />;
  if (child.loading) return <SkeletonRows rows={5} label="Loading child token" />;
  if (!child.data) {
    const notFound = (child.error as { status?: number } | undefined)?.status === 404;
    return notFound ? (
      <EmptyState title="Child token not found">
        <Link className="link" href="/launchpad">
          Back to the launchpad
        </Link>
      </EmptyState>
    ) : (
      <ErrorNote error={child.error} onRetry={child.refresh} what="this child token" />
    );
  }
  return <ChildDashboard child={child.data} />;
}

function ChildDashboard({ child }: { child: ChildRow }) {
  // Children trade against SOL (wSOL, 9 decimals).
  const market: MarketInfo = useMemo(
    () => ({
      mint: child.mint,
      quoteMint: WSOL.toBase58(),
      quoteDecimals: 9,
      quoteSymbol: "SOL",
      supply: toBig(child.supply),
    }),
    [child.mint, child.supply],
  );
  const stats = useStats(market);
  const live = useLiveOffers(child.mint);
  const { floorSol } = useFloor(stats.data, market);
  const price = stats.data?.price ? priceToFloat(toBig(stats.data.price.price), 9, TOKEN_DECIMALS) : null;

  return (
    <div className="grid gap-10">
      <div className="grid gap-3">
        <p>
          <Link className="link text-sm" href="/launchpad">
            Launchpad
          </Link>
        </p>
        <h1 className="page-title">
          {child.name} <span className="text-muted">{child.symbol}</span>
        </h1>
        <p className="text-muted">
          Mint <Address value={child.mint} /> created by <Address value={child.creator} />
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 md:grid-cols-4">
        <div className="stat">
          <dt>Price</dt>
          <dd>{formatPrice(price)} SOL</dd>
        </div>
        <div className="stat">
          <dt>24h volume</dt>
          <dd>{formatCompact(stats.data?.volume24h, 9)} SOL</dd>
        </div>
        <div className="stat">
          <dt>Live offers</dt>
          <dd>{stats.data?.liveOffers ?? 0}</dd>
        </div>
        <div className="stat">
          <dt>Treasury floor</dt>
          <dd>{floorSol === null ? "–" : `${formatPrice(floorSol)} SOL`}</dd>
        </div>
      </dl>
      <ErrorNote error={stats.data ? undefined : stats.error} onRetry={stats.refresh} what="market figures" />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
        <div className="grid content-start gap-10">
          <section aria-labelledby="child-chart">
            <SectionTitle id="child-chart">Price</SectionTitle>
            <PriceChart mint={child.mint} quoteDecimals={9} quoteSymbol="SOL" floorInQuote={floorSol} />
          </section>
          <section aria-labelledby="child-offers">
            <SectionTitle id="child-offers">Offers taking bids</SectionTitle>
            {live.loading ? (
              <SkeletonRows rows={2} label="Loading offers" />
            ) : (
              <OfferBoard
                offers={live.offers}
                units={{ tokenSymbol: child.symbol, quoteSymbol: "SOL", quoteDecimals: 9 }}
                fresh={live.fresh}
              />
            )}
          </section>
        </div>
        <div className="grid content-start gap-6">
          <section aria-labelledby="risk" className="panel">
            <h2 id="risk" className="section-title mb-4">
              Risk facts
            </h2>
            <RiskPanel child={child} />
          </section>
          <CreatorClaim child={child} />
        </div>
      </div>
    </div>
  );
}

/** Shown only to the creator: claim the linearly vested allocation. */
function CreatorClaim({ child }: { child: ChildRow }) {
  const { publicKey } = useWallet();
  const { sendIxs } = useSendTx();
  if (!publicKey || publicKey.toBase58() !== child.creator || child.creator_bps === 0 || !isValidAddress(child.parent))
    return null;
  return (
    <section aria-labelledby="creator" className="panel grid gap-3" data-testid="creator-claim">
      <h2 id="creator" className="section-title">
        Your creator allocation
      </h2>
      <p className="text-muted">It vests linearly over 90 days. Claiming sends the vested part to your wallet.</p>
      <button
        type="button"
        className="btn btn-primary w-full"
        onClick={() =>
          void sendIxs({
            label: "Claiming vested tokens",
            success: "Vested tokens claimed",
            build: ({ owner, connection }) =>
              new LaunchpadClient(connection, new PublicKey(child.parent)).claimVestedIxs(
                owner,
                new PublicKey(child.mint),
              ),
          })
        }
      >
        Claim vested tokens
      </button>
    </section>
  );
}
