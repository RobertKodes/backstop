"use client";

import { pda, priceToFloat, quoteBuy } from "@backstop/sdk";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { type Candle, type TicketRow, paths } from "@/lib/api";
import { useNow } from "@/lib/clock";
import {
  estimateAmmSell,
  estimateDiscountBps,
  estimateMomentumBps,
  estimateOffer,
  sellPath,
  withSlippage,
} from "@/lib/estimates";
import {
  TOKEN_DECIMALS,
  byteLength,
  formatBps,
  formatCompact,
  formatDate,
  formatDuration,
  formatPrice,
  formatUnits,
  parseUnits,
  toBig,
  unitsToDecimalString,
} from "@/lib/format";
import { type MarketInfo, useMarketParams, useRootMarket, useWalletBalances } from "@/lib/market";
import { containsProfanity } from "@/lib/profanity";
import { useSendTx } from "@/lib/tx";
import { revalidate, useApi } from "@/lib/use-api";

import { ErrorNote, Field, PageHeader, SectionTitle, SkeletonRows } from "../ui";
import { TOKEN_SYMBOL, useStats } from "./live-view";

const SLIPPAGE_BPS = 100;
const MAX_MESSAGE_BYTES = 140;

export function SellView() {
  const { market, loading, error, refresh } = useRootMarket();
  return (
    <>
      <PageHeader
        title="Sell BACKSTOP"
        lede="Large sales are offered to holders first. Read how an offer works before you post one: it cannot be cancelled."
      />
      {market ? (
        <SellFlow market={market} />
      ) : loading ? (
        <SkeletonRows rows={5} label="Loading market" />
      ) : (
        <ErrorNote error={error} onRetry={refresh} what="the market" />
      )}
    </>
  );
}

function SellFlow({ market }: { market: MarketInfo }) {
  const router = useRouter();
  const { publicKey } = useWallet();
  const { send, connected, openWalletModal } = useSendTx();
  const balances = useWalletBalances(market);
  const { params, onChain } = useMarketParams(market);
  const stats = useStats(market);
  const candles = useApi<Candle[]>(paths.price(market.mint, 60, 2), { refreshMs: 30_000 });
  const now = useNow();

  const [amountStr, setAmountStr] = useState("");
  const [message, setMessage] = useState("");
  const [ack, setAck] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const amount = parseUnits(amountStr, TOKEN_DECIMALS);
  const path = amount !== null && amount > 0n ? sellPath(amount, params.minOfferSize) : null;

  // TWAP estimate: mean of the last 5 minutes of closes, else the last trade.
  const recent = (candles.data ?? []).filter(
    (c) => new Date(c.bucket).getTime() / 1000 >= now - params.priceTwapWindowSecs,
  );
  const lastPrice = stats.data?.price ? toBig(stats.data.price.price) : 0n;
  const twap = recent.length ? recent.reduce((s, c) => s + toBig(c.close), 0n) / BigInt(recent.length) : lastPrice;
  const momentum = estimateMomentumBps(
    candles.data ?? [],
    now,
    params.priceTwapWindowSecs,
    params.momentumLookbackSecs,
  );
  const discount = estimateDiscountBps(momentum, params);
  const baseReserve = toBig(stats.data?.price?.base_reserve);
  const quoteReserve = toBig(stats.data?.price?.quote_reserve);

  const amt = amount ?? 0n;
  const offerEst = twap > 0n && amt > 0n ? estimateOffer(amt, twap, discount, params.tradeFeeBps) : null;
  const ammEst = amt > 0n ? estimateAmmSell(amt, baseReserve, quoteReserve, params.tradeFeeBps) : null;
  const msgBytes = byteLength(message);

  const errors: { amount?: string; message?: string; ack?: string } = {};
  if (amount === null || amount === 0n) errors.amount = "Enter how many tokens to sell.";
  else if (balances.token !== null && amount > balances.token)
    errors.amount = `That is more ${TOKEN_SYMBOL} than your wallet holds.`;
  if (path === "offer" && msgBytes > MAX_MESSAGE_BYTES)
    errors.message = `Messages are limited to ${MAX_MESSAGE_BYTES} bytes.`;
  if (path === "offer" && !ack) errors.ack = "Confirm that you understand the offer cannot be cancelled.";
  if (path === "amm" && ammEst && ammEst.out <= 0n)
    errors.amount = "The AMM has no liquidity quote for this amount right now.";

  const fmtQ = (v: bigint) => `${formatUnits(v, market.quoteDecimals, 2)} ${market.quoteSymbol}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!connected) return openWalletModal();
    if (Object.keys(errors).length || amount === null || !path) return;
    setBusy(true);
    let offerId: bigint | null = null;
    const sig = await send({
      label: path === "offer" ? "Posting offer" : "Selling on the AMM",
      success: path === "offer" ? "Offer posted" : "Sold on the AMM",
      market,
      build: async ({ client, owner }): Promise<TransactionInstruction[]> => {
        if (path === "offer") {
          const r = await client.createOfferIxs(owner, amount, message.trim());
          offerId = r.offerId;
          return r.ixs;
        }
        const minOut = withSlippage(ammEst?.out ?? 0n, SLIPPAGE_BPS);
        return client.sellIxs(owner, amount, minOut);
      },
    });
    setBusy(false);
    if (!sig) return;
    balances.refresh();
    setAmountStr("");
    setMessage("");
    setAck(false);
    setSubmitted(false);
    if (offerId !== null) router.push(`/offers/${pda.offer(new PublicKey(market.mint), offerId).toBase58()}`);
  };

  const show = (k: keyof typeof errors) =>
    submitted ? errors[k] : k === "amount" && amountStr ? errors[k] : k === "message" ? errors[k] : undefined;
  const priceNow = stats.data?.price ? priceToFloat(lastPrice, market.quoteDecimals, TOKEN_DECIMALS) : null;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-12">
      <div className="grid content-start gap-8">
        <section aria-labelledby="mechanic" className="grid gap-4" data-testid="sell-explainer">
          <h2 id="mechanic" className="section-title">
            What happens when you sell
          </h2>
          <ol className="grid gap-4">
            <li className="panel-flat">
              <p className="font-semibold">1. Your tokens go into a ten-minute public offer</p>
              <p className="mt-1 text-muted">
                Sales of at least {formatCompact(params.minOfferSize, TOKEN_DECIMALS)} {TOKEN_SYMBOL} (0.01% of supply)
                become an offer to holders. The tokens move into escrow and the discount is frozen from the on-chain
                price at that moment.
              </p>
            </li>
            <li className="panel-flat">
              <p className="font-semibold">2. Holders and the Shield absorb it at the fill price</p>
              <p className="mt-1 text-muted">
                Fill price = TWAP × (1 − discount). You pay the {formatBps(params.tradeFeeBps, 0)} trade fee on what is
                filled. If bids exceed the offer, lots are shared by randomised pro-rata.
              </p>
            </li>
            <li className="panel-flat">
              <p className="font-semibold">3. Anything unfilled is sold on the AMM</p>
              <p className="mt-1 text-muted">
                Lots nobody bid on are sold on the AMM after settlement at the market price, also with the trade fee.
              </p>
            </li>
            <li className="panel-flat">
              <p className="font-semibold">4. You receive a Return Ticket</p>
              <p className="mt-1 text-muted" data-testid="ticket-explainer">
                For {formatDuration(params.ticketValiditySecs)} after settlement you can buy back up to the amount
                holders absorbed with a 0% fee.
              </p>
            </li>
          </ol>
          <div className="terms" role="note" data-testid="no-cancel-warning">
            <p>
              <strong>Offers cannot be cancelled.</strong> Once posted, your tokens stay in escrow for the full
              ten-minute window and are sold to bidders or on the AMM. There is no way to take them back.
            </p>
          </div>
        </section>
        {publicKey ? <TicketList market={market} owner={publicKey.toBase58()} /> : null}
      </div>

      <form className="panel grid content-start gap-5 self-start" onSubmit={submit} noValidate data-testid="sell-form">
        <h2 className="section-title">Your sale</h2>
        <Field
          label={`Amount (${TOKEN_SYMBOL})`}
          error={show("amount")}
          hint={
            <>
              {publicKey ? (
                <>Wallet balance: {balances.token === null ? "–" : formatUnits(balances.token, TOKEN_DECIMALS, 2)}. </>
              ) : null}
              Minimum offer size: {formatUnits(params.minOfferSize, TOKEN_DECIMALS, 0)}.
            </>
          }
        >
          {({ id, describedBy, invalid }) => (
            <div className="flex gap-2">
              <div className="input-affix flex-1">
                <input
                  id={id}
                  className="input"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  data-testid="sell-amount"
                />
                <span className="affix">{TOKEN_SYMBOL}</span>
              </div>
              {balances.token ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setAmountStr(unitsToDecimalString(balances.token!, TOKEN_DECIMALS))}
                >
                  Max
                </button>
              ) : null}
            </div>
          )}
        </Field>

        {path === null ? (
          <p className="note text-sm">
            Enter an amount to see which path your sale takes and an estimate of the proceeds.
          </p>
        ) : path === "amm" ? (
          <div className="grid gap-3" data-testid="path-amm">
            <p className="badge w-fit" data-tone="brass">
              Direct AMM sale
            </p>
            <p className="text-sm">
              This is below the minimum offer size, so it sells straight to the AMM. The{" "}
              {formatBps(params.tradeFeeBps, 0)} trade fee still applies, and direct sales are capped at the minimum
              offer size per wallet per rolling 24 hours.
            </p>
            <dl className="grid gap-2 border-t border-line pt-3 text-sm">
              <Row label="Estimated proceeds" value={ammEst ? fmtQ(ammEst.out) : "–"} strong />
              <Row label="Trade fee" value={ammEst ? fmtQ(ammEst.fee) : "–"} />
              <Row
                label="Minimum received (1% slippage)"
                value={ammEst ? fmtQ(withSlippage(ammEst.out, SLIPPAGE_BPS)) : "–"}
              />
            </dl>
          </div>
        ) : (
          <div className="grid gap-4" data-testid="path-offer">
            <p className="badge w-fit" data-tone="brass">
              Ten-minute offer to holders
            </p>
            <dl className="grid gap-2 text-sm" data-testid="sell-estimate">
              <Row label="Discount (frozen when posted)" value={`about ${formatBps(discount)}`} />
              <Row label="Price now" value={priceNow ? `${formatPrice(priceNow)} ${market.quoteSymbol}` : "–"} />
              <Row
                label="Estimated fill price"
                value={
                  offerEst
                    ? `${formatPrice(priceToFloat(offerEst.fillPrice, market.quoteDecimals, TOKEN_DECIMALS))} ${market.quoteSymbol}`
                    : "–"
                }
              />
              <Row label="If fully absorbed, before fee" value={offerEst ? fmtQ(offerEst.gross) : "–"} />
              <Row
                label={`Trade fee (${formatBps(params.tradeFeeBps, 0)})`}
                value={offerEst ? `− ${fmtQ(offerEst.fee)}` : "–"}
              />
              <Row label="You receive if fully absorbed" value={offerEst ? fmtQ(offerEst.net) : "–"} strong />
              <Row label="If nobody bids (all sold on the AMM)" value={ammEst ? fmtQ(ammEst.out) : "–"} />
            </dl>
            <p className="text-sm text-muted">
              Estimates use the last {Math.round(params.priceTwapWindowSecs / 60)} minutes of trades
              {onChain ? "" : " and default protocol parameters"}. The program fixes the real discount and fill price
              when the offer is posted.
            </p>
            <div className="note text-sm" data-testid="return-ticket">
              <strong>Return Ticket:</strong> if holders absorb your tokens, you can buy back up to that amount within{" "}
              {formatDuration(params.ticketValiditySecs)} with a 0% fee.
            </div>
            <Field
              label="Message to bidders (optional)"
              error={show("message")}
              hint={
                <>
                  {msgBytes}/{MAX_MESSAGE_BYTES} bytes. Stored on-chain permanently and shown on the offer page.
                  {containsProfanity(message) ? " Profanity is masked when displayed." : ""}
                </>
              }
            >
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  className="input"
                  maxLength={MAX_MESSAGE_BYTES}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  placeholder="e.g. Paying for a house, still a holder"
                />
              )}
            </Field>
            <div className="terms grid gap-2">
              <label className="check">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  data-testid="ack-no-cancel"
                  aria-describedby="ack-err"
                />
                <span>
                  I understand this offer <strong>cannot be cancelled</strong> and that unfilled tokens are sold on the
                  AMM.
                </span>
              </label>
              {submitted && errors.ack ? (
                <p id="ack-err" className="field-error">
                  {errors.ack}
                </p>
              ) : null}
            </div>
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy} data-testid="sell-submit">
          {!connected
            ? "Connect wallet to sell"
            : busy
              ? "Sending…"
              : path === "amm"
                ? "Sell on the AMM"
                : "Post offer"}
        </button>
      </form>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? "figure text-lg" : "font-semibold"}>{value}</dd>
    </div>
  );
}

function TicketList({ market, owner }: { market: MarketInfo; owner: string }) {
  const tickets = useApi<TicketRow[]>(paths.tickets(market.mint, owner), { refreshMs: 60_000 });
  if (!tickets.data?.length) return null;
  return (
    <section aria-labelledby="tickets" className="grid gap-3">
      <SectionTitle id="tickets">Your Return Tickets</SectionTitle>
      <ul className="grid gap-3">
        {tickets.data.map((t) => (
          <TicketItem key={`${t.offer_id}`} t={t} market={market} owner={owner} />
        ))}
      </ul>
    </section>
  );
}

function TicketItem({ t, market, owner }: { t: TicketRow; market: MarketInfo; owner: string }) {
  const { send } = useSendTx();
  const stats = useStats(market);
  const [quoteStr, setQuoteStr] = useState("");
  const quoteIn = parseUnits(quoteStr, market.quoteDecimals);
  const baseReserve = toBig(stats.data?.price?.base_reserve);
  const quoteReserve = toBig(stats.data?.price?.quote_reserve);
  const est = quoteIn && baseReserve > 0n ? quoteBuy(quoteIn, baseReserve, quoteReserve, 0).out : 0n;
  const remaining = toBig(t.remaining);
  const over = est > remaining;
  return (
    <li className="panel grid gap-3">
      <p>
        <strong>
          {formatCompact(remaining, TOKEN_DECIMALS)} {TOKEN_SYMBOL}
        </strong>{" "}
        left to buy back at 0% fee, from offer No. {t.offer_id}. Expires {formatDate(t.expires_at)}.
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!quoteIn || over) return;
          const sig = await send({
            label: "Buying back with ticket",
            success: "Bought back with Return Ticket",
            market,
            build: ({ client, owner: who }) =>
              client.ticketBuyIxs(who, BigInt(t.offer_id), quoteIn, withSlippage(est, SLIPPAGE_BPS)),
          });
          if (sig) void revalidate(paths.tickets(market.mint, owner));
        }}
      >
        <Field
          label={`Spend (${market.quoteSymbol})`}
          error={over ? "That buys more than the ticket allows." : undefined}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              className="input w-40"
              inputMode="decimal"
              value={quoteStr}
              onChange={(e) => setQuoteStr(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
          )}
        </Field>
        <button type="submit" className="btn">
          Buy back about {formatCompact(est, TOKEN_DECIMALS)}
        </button>
      </form>
      <p className="text-sm text-muted">Estimated at the current pool price with a 1% slippage tolerance.</p>
    </li>
  );
}
