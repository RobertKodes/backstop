"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";

import { type Absorption, type ChestResponse, type ShieldPositionRow, paths } from "@/lib/api";
import { useNow } from "@/lib/clock";
import {
  DAY,
  type ShieldForm,
  type UiParams,
  estimateShieldApr,
  lockMultiplierBps,
  validateShieldLock,
} from "@/lib/estimates";
import {
  TOKEN_DECIMALS,
  formatBps,
  formatCompact,
  formatDate,
  formatDuration,
  formatPercent,
  formatUnits,
  toBig,
  toUnixSecs,
} from "@/lib/format";
import { type MarketInfo, useMarketParams, useRootMarket } from "@/lib/market";
import { useSendTx } from "@/lib/tx";
import { revalidate, useApi } from "@/lib/use-api";

import { ConnectPrompt, EmptyState, ErrorNote, Field, PageHeader, SectionTitle, Skeleton, SkeletonRows } from "../ui";
import { TOKEN_SYMBOL, useStats } from "./live-view";

const mult = (bps: number) => `${(bps / 10_000).toFixed(2).replace(/\.?0+$/, "")}×`;

export function ShieldView() {
  const { market, loading, error, refresh } = useRootMarket();
  const { publicKey } = useWallet();
  const { params } = useMarketParams(market);
  return (
    <>
      <PageHeader
        title="The Shield"
        lede="A pooled backstop that takes the first slice of every offer. Lock chest USDC for at least 30 days; longer locks earn a larger share of Shield fees."
      />
      {!market ? (
        loading ? (
          <SkeletonRows rows={4} label="Loading market" />
        ) : (
          <ErrorNote error={error} onRetry={refresh} what="the market" />
        )
      ) : (
        <div className="grid gap-10">
          <ShieldFacts market={market} params={params} />
          {publicKey ? (
            <ShieldPositions market={market} params={params} owner={publicKey.toBase58()} />
          ) : (
            <ConnectPrompt action="lock USDC in the Shield" />
          )}
        </div>
      )}
    </>
  );
}

function ShieldFacts({ market, params }: { market: MarketInfo; params: UiParams }) {
  const abs = useApi<Absorption>(paths.absorption(market.mint), { refreshMs: 30_000 });
  const stats = useStats(market);
  const deposits = toBig(abs.data?.shieldDeposits);
  const apr = estimateShieldApr(toBig(stats.data?.volume24h), params.tradeFeeBps, params.splitShieldBps, deposits);
  const loaded = abs.data && stats.data;
  return (
    <section aria-labelledby="facts" className="grid gap-5">
      <h2 id="facts" className="sr-only">
        Shield facts
      </h2>
      <dl
        className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 md:grid-cols-4"
        data-testid="shield-facts"
      >
        <div className="stat">
          <dt>Total Shield deposits</dt>
          <dd>
            {abs.data ? (
              `${formatCompact(deposits, market.quoteDecimals)} ${market.quoteSymbol}`
            ) : (
              <Skeleton className="h-7 w-24" />
            )}
          </dd>
        </div>
        <div className="stat">
          <dt>Per-offer cap</dt>
          <dd>
            {formatUnits(params.shieldPerOfferCap, market.quoteDecimals, 0)} {market.quoteSymbol}
          </dd>
        </div>
        <div className="stat">
          <dt>Priority slice</dt>
          <dd>Up to {formatBps(params.shieldMaxShareBps, 0)}</dd>
          <dd className="sub">of each offer, taken before bidders</dd>
        </div>
        <div className="stat" data-testid="shield-apr">
          <dt>Fee APR (variable, estimated)</dt>
          <dd>{loaded ? apr === null ? "–" : formatPercent(apr, 1) : <Skeleton className="h-7 w-20" />}</dd>
          <dd className="sub">at 1×, from the last 24 h of fees</dd>
        </div>
      </dl>
      <ErrorNote error={abs.data ? undefined : abs.error} onRetry={abs.refresh} what="Shield figures" />
      <div className="note prose-measure text-sm">
        The fee APR is an estimate from recent trading fees and changes constantly. It excludes the tokens the Shield
        gains by absorbing offers at a discount, and the USDC it spends doing so: when the Shield absorbs, deposits are
        converted into {TOKEN_SYMBOL} at the fill price.
      </div>
    </section>
  );
}

function ShieldPositions({ market, params, owner }: { market: MarketInfo; params: UiParams; owner: string }) {
  const chest = useApi<ChestResponse>(paths.chest(market.mint, owner), { refreshMs: 30_000 });
  const refresh = () => void revalidate(paths.chest(market.mint, owner));
  if (chest.loading) return <SkeletonRows rows={3} label="Loading your Shield positions" />;
  if (!chest.data) return <ErrorNote error={chest.error} onRetry={chest.refresh} what="your Shield positions" />;
  const positions = chest.data.shield;
  const nextId = positions.reduce((m, p) => Math.max(m, Number(p.id) + 1), 0);
  return (
    <div className="grid gap-10 lg:grid-cols-[24rem_minmax(0,1fr)] lg:gap-12">
      <LockForm
        market={market}
        params={params}
        chestBalance={chest.data.chest ? toBig(chest.data.chest.balance) : 0n}
        hasChest={!!chest.data.chest}
        nextId={nextId}
        onDone={refresh}
      />
      <section aria-labelledby="positions">
        <SectionTitle id="positions">Your positions</SectionTitle>
        {positions.length === 0 ? (
          <EmptyState title="No Shield positions yet">
            Lock USDC from your chest to start taking a share of every offer.
          </EmptyState>
        ) : (
          <ul className="grid gap-3" data-testid="shield-positions">
            {positions.map((p) => (
              <PositionRow key={p.id} p={p} market={market} onDone={refresh} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LockForm({
  market,
  params,
  chestBalance,
  hasChest,
  nextId,
  onDone,
}: {
  market: MarketInfo;
  params: UiParams;
  chestBalance: bigint;
  hasChest: boolean;
  nextId: number;
  onDone: () => void;
}) {
  const { send } = useSendTx();
  const now = useNow();
  const minDays = Math.ceil(params.shieldMinLockSecs / DAY);
  const [form, setForm] = useState<ShieldForm>({ amount: "", lockDays: String(minDays) });
  const [submitted, setSubmitted] = useState(false);
  const { errors, value } = validateShieldLock(form, {
    quoteDecimals: market.quoteDecimals,
    minLockSecs: params.shieldMinLockSecs,
    available: hasChest ? chestBalance : 0n,
  });
  const days = Number(form.lockDays);
  const m = Number.isFinite(days)
    ? lockMultiplierBps(days * DAY, params.shieldMinLockSecs, params.shieldMaxMultiplierBps)
    : null;
  const capDays = Math.round((params.shieldMaxMultiplierBps / 10_000) * minDays);
  const err = (k: keyof ShieldForm) => (submitted || form[k] !== "" ? errors[k] : undefined);

  return (
    <form
      className="panel grid content-start gap-5 self-start"
      noValidate
      data-testid="shield-lock-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setSubmitted(true);
        if (!value) return;
        const sig = await send({
          label: "Locking in the Shield",
          success: "Locked in the Shield",
          market,
          build: async ({ client, owner }) => [
            await client.shieldDepositIx(owner, value.amount, value.lockSecs, nextId),
          ],
        });
        if (sig) {
          setForm({ amount: "", lockDays: String(minDays) });
          setSubmitted(false);
          onDone();
        }
      }}
    >
      <h2 className="section-title">Lock USDC</h2>
      <Field
        label={`Amount from chest (${market.quoteSymbol})`}
        error={err("amount")}
        hint={
          hasChest
            ? `Chest balance: ${formatUnits(chestBalance, market.quoteDecimals, 2)}. Moving chest funds into the Shield has no penalty and does not restart the chest lock.`
            : "Deposit into your chest first; Shield locks are funded from it."
        }
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            className="input"
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            data-testid="shield-amount"
          />
        )}
      </Field>
      <Field
        label="Lock length (days)"
        error={err("lockDays")}
        hint={`At least ${minDays} days. The multiplier grows with length up to ${mult(params.shieldMaxMultiplierBps)} at ${capDays} days.`}
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            className="input"
            inputMode="numeric"
            value={form.lockDays}
            onChange={(e) => setForm((f) => ({ ...f, lockDays: e.target.value }))}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            data-testid="shield-days"
          />
        )}
      </Field>
      <dl className="grid gap-1 border-t border-line pt-4 text-sm" aria-live="polite">
        <div className="flex justify-between">
          <dt className="text-muted">Lock multiplier</dt>
          <dd className="figure text-xl" data-testid="shield-multiplier">
            {m === null ? "–" : mult(m)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Principal locked until</dt>
          <dd className="font-semibold">{value ? formatDate(now + value.lockSecs) : "–"}</dd>
        </div>
      </dl>
      <div className="terms text-sm">
        <p>
          <strong>Principal stays locked for the full term.</strong> As the Shield absorbs offers, part of your USDC is
          converted into {TOKEN_SYMBOL} at the fill price; you can claim those tokens and fee rewards at any time.
        </p>
      </div>
      <button type="submit" className="btn btn-primary btn-lg w-full" data-testid="shield-submit">
        Lock in the Shield
      </button>
    </form>
  );
}

function PositionRow({ p, market, onDone }: { p: ShieldPositionRow; market: MarketInfo; onDone: () => void }) {
  const { send } = useSendTx();
  const now = useNow();
  const end = toUnixSecs(p.lock_end);
  const unlocked = now >= end;
  const withdrawn = p.status === "withdrawn";
  const act = async (withdraw: boolean) => {
    const sig = await send({
      label: withdraw ? "Withdrawing Shield principal" : "Claiming Shield gains",
      success: withdraw ? "Principal returned to chest" : "Shield gains claimed",
      market,
      build: async ({ client, owner }) => [
        ...(await client.ensureHolderIxs(owner)),
        await client.shieldClaimIx(owner, Number(p.id), withdraw),
      ],
    });
    if (sig) onDone();
  };
  return (
    <li className="panel grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="grid gap-1">
        <p className="figure text-2xl">
          {formatUnits(p.principal, market.quoteDecimals, 2)}{" "}
          <span className="text-base text-muted">{market.quoteSymbol}</span>{" "}
          <span className="badge align-middle" data-tone="brass">
            {mult(p.multiplier_bps)}
          </span>
        </p>
        <p className="text-sm text-muted">
          Position {p.id}.{" "}
          {withdrawn
            ? "Withdrawn."
            : unlocked
              ? `Unlocked since ${formatDate(end)}.`
              : `Locked until ${formatDate(end)} (${formatDuration(end - now)}).`}{" "}
          Claimed so far: {formatCompact(p.claimed_tokens, TOKEN_DECIMALS)} {TOKEN_SYMBOL} and{" "}
          {formatUnits(p.claimed_rewards, market.quoteDecimals, 2)} {market.quoteSymbol}.
        </p>
      </div>
      {!withdrawn ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" onClick={() => void act(false)}>
            Claim gains
          </button>
          <button
            type="button"
            className="btn btn-sm"
            aria-disabled={!unlocked}
            title={unlocked ? undefined : `Available after ${formatDate(end)}`}
            onClick={() => unlocked && void act(true)}
          >
            Withdraw to chest
          </button>
        </div>
      ) : null}
    </li>
  );
}
