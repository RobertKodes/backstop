"use client";

import { BID_KIND, priceToFloat } from "@backstop/sdk";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { type ChestResponse, type OfferDetail, paths } from "@/lib/api";
import { bidLots, coverage } from "@/lib/estimates";
import {
  TOKEN_DECIMALS,
  formatBps,
  formatCompact,
  formatDateTime,
  formatPercent,
  formatPrice,
  formatUnits,
  parseUnits,
  toBig,
} from "@/lib/format";
import { evStr, useLiveEvents, useLiveStatus } from "@/lib/live";
import { type MarketInfo, isValidAddress, useMarketInfo, useWalletBalances } from "@/lib/market";
import { cleanSellerMessage } from "@/lib/profanity";
import { useSendTx } from "@/lib/tx";
import { revalidate, useApi } from "@/lib/use-api";

import { offerStatusLabel } from "../offers";
import {
  Address,
  Countdown,
  EmptyState,
  ErrorNote,
  Field,
  Meter,
  SectionTitle,
  SkeletonRows,
  StaleNote,
  useRemaining,
} from "../ui";
import { TOKEN_SYMBOL } from "./live-view";

const KIND_LABEL: Record<number, string> = { 0: "Wallet", 1: "Chest", 2: "Auto-Absorb" };

type Source = "chest" | "wallet" | "both";

export function OfferView({ offerKey }: { offerKey: string }) {
  const valid = isValidAddress(offerKey);
  const status = useLiveStatus();
  const detail = useApi<OfferDetail>(valid ? paths.offer(offerKey) : null, {
    refreshMs: status === "live" ? 15_000 : 5_000,
  });
  const market = useMarketInfo(detail.data?.offer.mint ?? null);

  useLiveEvents(detail.data?.offer.mint, (ev) => {
    if (evStr(ev.data, "offer") === offerKey) void revalidate(paths.offer(offerKey));
  });

  if (!valid) {
    return (
      <EmptyState title="That is not a valid offer address">
        <Link className="link" href="/">
          Back to live offers
        </Link>
      </EmptyState>
    );
  }
  if (detail.loading) return <SkeletonRows rows={6} label="Loading offer" />;
  if (!detail.data || !market) {
    const notFound = (detail.error as { status?: number } | undefined)?.status === 404;
    return notFound ? (
      <EmptyState title="Offer not found">
        It may not be indexed yet.{" "}
        <Link className="link" href="/">
          Back to live offers
        </Link>
      </EmptyState>
    ) : (
      <ErrorNote error={detail.error} onRetry={detail.refresh} what="this offer" />
    );
  }
  return <OfferDetailView detail={detail.data} market={market} stale={detail.stale} />;
}

function OfferDetailView({ detail, market, stale }: { detail: OfferDetail; market: MarketInfo; stale: boolean }) {
  const o = detail.offer;
  const remaining = useRemaining(o.expires_at);
  const open = o.status === "open" && remaining > 0;
  const fill = priceToFloat(toBig(o.fill_price), market.quoteDecimals, TOKEN_DECIMALS);
  const twap = priceToFloat(toBig(o.twap), market.quoteDecimals, TOKEN_DECIMALS);
  const c = coverage(o.total_capacity, o.lots);
  const msg = cleanSellerMessage(o.message);
  const symbol = market.quoteSymbol === "SOL" ? "tokens" : TOKEN_SYMBOL;

  return (
    <div className="grid gap-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="grid gap-3">
          <p>
            <Link className="link text-sm" href="/">
              Live offers
            </Link>
          </p>
          <h1 className="page-title">Offer No. {o.id}</h1>
          <p className="flex flex-wrap items-center gap-2">
            <span className="badge" data-tone={open ? "brass" : "red"} data-testid="offer-status">
              {offerStatusLabel(o, remaining)}
            </span>
            <span className="text-muted">
              Seller <Address value={o.seller} />
            </span>
          </p>
        </div>
        <div className="lg:text-right">
          <p className="label text-base">{open ? "Bidding closes in" : "Bidding closed"}</p>
          <Countdown expiresAt={o.expires_at} className="block text-[5rem] sm:text-[7rem]" />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 md:grid-cols-4">
        <div className="stat">
          <dt>Size</dt>
          <dd title={`${formatUnits(o.amount, TOKEN_DECIMALS, 9)}`}>
            {formatCompact(o.amount, TOKEN_DECIMALS)} <span className="text-base text-muted">{symbol}</span>
          </dd>
        </div>
        <div className="stat" data-testid="frozen-discount">
          <dt>Frozen discount</dt>
          <dd>{formatBps(o.discount_bps)}</dd>
        </div>
        <div className="stat">
          <dt>Fill price</dt>
          <dd>
            {formatPrice(fill)} <span className="text-base text-muted">{market.quoteSymbol}</span>
          </dd>
        </div>
        <div className="stat">
          <dt>Price at creation (TWAP)</dt>
          <dd>
            {formatPrice(twap)} <span className="text-base text-muted">{market.quoteSymbol}</span>
          </dd>
        </div>
        <div className="stat">
          <dt>Lots</dt>
          <dd>{o.lots}</dd>
          <dd className="sub">
            {formatCompact(o.lot_size, TOKEN_DECIMALS)} each, {formatUnits(o.lot_cost, market.quoteDecimals, 2)}{" "}
            {market.quoteSymbol} per lot
          </dd>
        </div>
        <div className="stat col-span-2 md:col-span-3">
          <dt>Bid coverage</dt>
          <dd className="grid gap-2">
            <span>
              {formatPercent(c, 0)} <span className="text-base text-muted">of lots, {detail.bids.length} bids</span>
            </span>
            <Meter
              value={Math.min(1, c)}
              tone={c >= 1 ? "green" : "brass"}
              label="Bid coverage"
              valueText={`${formatPercent(c, 0)} covered`}
            />
          </dd>
        </div>
      </dl>

      {msg ? (
        <figure className="m-0 grid gap-1" data-testid="seller-message">
          <blockquote className="display text-[1.75rem] leading-tight">&ldquo;{msg}&rdquo;</blockquote>
          <figcaption className="text-sm text-muted">
            Message from the seller, shown as written (profanity masked).
          </figcaption>
        </figure>
      ) : null}
      <StaleNote stale={stale} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
        <div className="grid content-start gap-8">
          <section aria-labelledby="terms" className="grid gap-3">
            <h2 id="terms" className="section-title">
              Conditions of this offer
            </h2>
            <div className="terms" data-testid="no-cancel">
              <p>
                <strong>Offers cannot be cancelled.</strong> The seller&apos;s tokens stay in escrow until settlement,
                and bids stay locked until then too. Any part of a bid that is not filled is refunded when the bid is
                claimed.
              </p>
            </div>
            <div className="note grid gap-2" data-testid="allocation-explainer">
              <p>
                <strong>How lots are allocated.</strong> The Shield takes its priority slice first (at most half the
                lots, within its per-offer cap). If bids then cover more lots than remain, each bidder receives its
                pro-rata share rounded up or down by at most one lot, using randomness from a slot hash committed when
                bidding closes. Nobody can pick the outcome.
              </p>
              <p>
                If bids cover the whole offer, bidding closes at the end of the current one-minute round. Lots nobody
                bid on are sold on the AMM after settlement.
              </p>
            </div>
          </section>

          <BidsTable detail={detail} market={market} />
          {o.status === "settled" || o.status === "closed" ? <Outcome detail={detail} market={market} /> : null}
        </div>

        <aside aria-labelledby="absorb" className="self-start">
          {open ? (
            <AbsorbForm detail={detail} market={market} />
          ) : (
            <div className="panel">
              <h2 id="absorb" className="section-title">
                Bidding has closed
              </h2>
              <p className="mt-2 text-muted">
                {o.status === "settled"
                  ? "This offer has settled. Winning bidders can claim their tokens; refunds return to the original source."
                  : "Lots are being allocated. Results appear here once the offer settles."}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function AbsorbForm({ detail, market }: { detail: OfferDetail; market: MarketInfo }) {
  const o = detail.offer;
  const { publicKey } = useWallet();
  const owner = publicKey?.toBase58() ?? null;
  const { send, connected, openWalletModal } = useSendTx();
  const balances = useWalletBalances(market);
  const chest = useApi<ChestResponse>(owner ? paths.chest(market.mint, owner) : null, { refreshMs: 30_000 });
  const [source, setSource] = useState<Source>("chest");
  const [chestAmt, setChestAmt] = useState("");
  const [walletAmt, setWalletAmt] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const radioName = useId();

  const lotCost = toBig(o.lot_cost);
  const lotSize = toBig(o.lot_size);
  const chestBal = chest.data?.chest ? toBig(chest.data.chest.balance) : null;
  const mine = useMemo(() => detail.bids.filter((b) => b.bidder === owner), [detail.bids, owner]);
  const hasChestBid = mine.some((b) => b.kind === BID_KIND.chest);
  const hasWalletBid = mine.some((b) => b.kind === BID_KIND.wallet);
  const isSeller = owner === o.seller;

  const useChest = source !== "wallet";
  const useWallet_ = source !== "chest";
  const chestParsed = useChest ? parseUnits(chestAmt, market.quoteDecimals) : 0n;
  const walletParsed = useWallet_ ? parseUnits(walletAmt, market.quoteDecimals) : 0n;
  const chestLots = bidLots(chestParsed ?? 0n, lotCost);
  const walletLots = bidLots(walletParsed ?? 0n, lotCost);
  const totalLots = chestLots.lots + walletLots.lots;
  const totalLocked = chestLots.locked + walletLots.locked;

  const errors: { chest?: string; wallet?: string; form?: string } = {};
  if (useChest) {
    if (chestParsed === null || chestParsed === 0n) errors.chest = "Enter how much to bid from your chest.";
    else if (chestLots.lots < 1n)
      errors.chest = `Bids lock whole lots; one lot costs ${formatUnits(lotCost, market.quoteDecimals, 2)} ${market.quoteSymbol}.`;
    else if (chestBal !== null && chestLots.locked > chestBal) errors.chest = "That is more than your chest balance.";
    else if (hasChestBid) errors.chest = "You already have a chest bid on this offer.";
  }
  if (useWallet_) {
    if (walletParsed === null || walletParsed === 0n)
      errors.wallet = `Enter how much ${market.quoteSymbol} to bid from your wallet.`;
    else if (walletLots.lots < 1n)
      errors.wallet = `Bids lock whole lots; one lot costs ${formatUnits(lotCost, market.quoteDecimals, 2)} ${market.quoteSymbol}.`;
    else if (balances.quote !== null && walletLots.locked > balances.quote)
      errors.wallet = `That is more ${market.quoteSymbol} than your wallet holds.`;
    else if (hasWalletBid) errors.wallet = "You already have a wallet bid on this offer.";
  }
  if (isSeller) errors.form = "Sellers cannot bid on their own offer.";
  const valid = !errors.chest && !errors.wallet && !errors.form;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!connected) {
      openWalletModal();
      return;
    }
    if (!valid) return;
    setBusy(true);
    const id = BigInt(o.id);
    const sig = await send({
      label: "Placing bid",
      success: `Bid placed on offer No. ${o.id}`,
      market,
      build: async ({ client, owner: who }) => {
        const ixs = [];
        if (useChest) ixs.push(await client.chestBidIx(who, id, chestLots.locked, false));
        if (useWallet_) ixs.push(await client.walletBidIx(who, id, walletLots.locked));
        return ixs;
      },
    });
    setBusy(false);
    if (sig) {
      setChestAmt("");
      setWalletAmt("");
      setSubmitted(false);
      void revalidate(paths.offer(o.offer));
      if (owner) void revalidate(paths.chest(market.mint, owner));
      balances.refresh();
    }
  };

  const show = (k: keyof typeof errors) =>
    submitted || (k === "chest" ? chestAmt : walletAmt) !== "" ? errors[k] : undefined;

  return (
    <form className="panel grid gap-5" onSubmit={submit} noValidate data-testid="absorb-form">
      <div>
        <h2 id="absorb" className="section-title">
          Absorb this offer
        </h2>
        <p className="mt-1 text-sm text-muted">Bid at the frozen fill price. You pay no trade fee on fills.</p>
      </div>
      <fieldset className="grid gap-2">
        <legend className="field-label mb-2">Pay from</legend>
        <div className="segmented" data-testid="absorb-source">
          {(
            [
              ["chest", "Chest"],
              ["wallet", `Fresh ${market.quoteSymbol}`],
              ["both", "Both"],
            ] as const
          ).map(([v, label]) => (
            <label key={v}>
              <input type="radio" name={radioName} value={v} checked={source === v} onChange={() => setSource(v)} />
              {label}
            </label>
          ))}
        </div>
        <p className="field-hint">
          {source === "both"
            ? "Places one chest bid and one wallet bid in a single transaction."
            : source === "chest"
              ? "Uses USDC already in your chest. Refunds of unfilled lots go back to the chest."
              : `Uses ${market.quoteSymbol} from your wallet. Refunds go back to your wallet.`}
        </p>
      </fieldset>

      {useChest ? (
        <Field
          label="From chest"
          error={show("chest")}
          hint={
            owner
              ? `Chest balance: ${chestBal === null ? "–" : formatUnits(chestBal, market.quoteDecimals, 2)} ${market.quoteSymbol}`
              : undefined
          }
        >
          {({ id, describedBy, invalid }) => (
            <div className="input-affix">
              <input
                id={id}
                className="input"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={chestAmt}
                onChange={(e) => setChestAmt(e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
              />
              <span className="affix">{market.quoteSymbol}</span>
            </div>
          )}
        </Field>
      ) : null}
      {useWallet_ ? (
        <Field
          label="From wallet"
          error={show("wallet")}
          hint={
            owner
              ? `Wallet balance: ${balances.quote === null ? "–" : formatUnits(balances.quote, market.quoteDecimals, 2)} ${market.quoteSymbol}`
              : undefined
          }
        >
          {({ id, describedBy, invalid }) => (
            <div className="input-affix">
              <input
                id={id}
                className="input"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={walletAmt}
                onChange={(e) => setWalletAmt(e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
              />
              <span className="affix">{market.quoteSymbol}</span>
            </div>
          )}
        </Field>
      ) : null}

      <dl className="grid gap-2 border-t border-line pt-4 text-sm" aria-live="polite">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Lots bid</dt>
          <dd className="font-semibold">{totalLots.toString()}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Locked until settlement</dt>
          <dd className="font-semibold">
            {formatUnits(totalLocked, market.quoteDecimals, 2)} {market.quoteSymbol}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Tokens if fully allocated</dt>
          <dd className="font-semibold">
            {formatCompact(totalLots * lotSize, TOKEN_DECIMALS)} {TOKEN_SYMBOL}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted">
        Amounts round down to whole lots; the rest stays where it is. If the offer is oversubscribed you may receive
        fewer lots, and the difference is refunded.
      </p>
      {errors.form && owner ? (
        <p className="field-error" role="alert">
          {errors.form}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy} data-testid="absorb-submit">
        {!connected
          ? "Connect wallet to absorb"
          : busy
            ? "Placing bid…"
            : `Absorb ${totalLots > 0n ? `${totalLots} lots` : "offer"}`}
      </button>
    </form>
  );
}

function BidsTable({ detail, market }: { detail: OfferDetail; market: MarketInfo }) {
  const fills = new Map(detail.fills.map((f) => [f.bid, f]));
  return (
    <section aria-labelledby="bids">
      <SectionTitle id="bids" aside={`${detail.bids.length} bids`}>
        Current bids
      </SectionTitle>
      {detail.bids.length === 0 ? (
        <p className="note">No bids yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table" data-testid="bids-table">
            <thead>
              <tr>
                <th scope="col">Bidder</th>
                <th scope="col">Source</th>
                <th scope="col" className="num">
                  Lots
                </th>
                <th scope="col" className="num">
                  Locked ({market.quoteSymbol})
                </th>
                <th scope="col" className="num">
                  Filled
                </th>
                <th scope="col">Placed</th>
              </tr>
            </thead>
            <tbody>
              {detail.bids.map((b) => {
                const f = fills.get(b.bid);
                return (
                  <tr key={b.bid}>
                    <td>
                      <Address value={b.bidder} />
                    </td>
                    <td>{KIND_LABEL[b.kind] ?? "Bid"}</td>
                    <td className="num">{b.capacity}</td>
                    <td className="num">{formatUnits(b.amount, market.quoteDecimals, 2)}</td>
                    <td className="num">{f ? `${f.lots} lots` : "–"}</td>
                    <td>{formatDateTime(b.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Outcome({ detail, market }: { detail: OfferDetail; market: MarketInfo }) {
  const o = detail.offer;
  return (
    <section aria-labelledby="outcome">
      <SectionTitle id="outcome">Settlement</SectionTitle>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
        <div className="stat">
          <dt>Lots to the Shield</dt>
          <dd>{o.shield_lots ?? 0}</dd>
        </div>
        <div className="stat">
          <dt>Lots to bidders</dt>
          <dd>{o.bidder_lots ?? 0}</dd>
        </div>
        <div className="stat">
          <dt>Sold on the AMM</dt>
          <dd>
            {formatCompact(o.remainder_tokens, TOKEN_DECIMALS)}{" "}
            <span className="text-base text-muted">{TOKEN_SYMBOL}</span>
          </dd>
        </div>
        <div className="stat">
          <dt>Seller received</dt>
          <dd>
            {formatUnits(o.seller_net, market.quoteDecimals, 2)}{" "}
            <span className="text-base text-muted">{market.quoteSymbol}</span>
          </dd>
        </div>
        <div className="stat">
          <dt>Trade fee</dt>
          <dd>
            {formatUnits(o.fee, market.quoteDecimals, 2)}{" "}
            <span className="text-base text-muted">{market.quoteSymbol}</span>
          </dd>
        </div>
        <div className="stat">
          <dt>Return Ticket issued</dt>
          <dd>
            {formatCompact(o.ticket_amount, TOKEN_DECIMALS)}{" "}
            <span className="text-base text-muted">{TOKEN_SYMBOL}</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
