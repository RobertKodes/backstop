"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";

import { type ChestResponse, type GrantRow, paths } from "@/lib/api";
import { useNow } from "@/lib/clock";
import {
  CHEST_EVENT_LABELS,
  DAY,
  type GrantForm,
  type UiParams,
  estimateChestYield,
  validateGrant,
  withdrawPreview,
} from "@/lib/estimates";
import {
  formatBps,
  formatDate,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatUnits,
  parseUnits,
  toBig,
  toUnixSecs,
  unitsToDecimalString,
} from "@/lib/format";
import { type MarketInfo, useMarketParams, useRootMarket, useWalletBalances } from "@/lib/market";
import { useSendTx } from "@/lib/tx";
import { revalidate, useApi } from "@/lib/use-api";

import { ConnectPrompt, EmptyState, ErrorNote, Field, PageHeader, SectionTitle, SkeletonRows, StaleNote } from "../ui";

export function ChestView() {
  const { market, loading, error, refresh } = useRootMarket();
  const { publicKey } = useWallet();
  const { params } = useMarketParams(market);
  return (
    <>
      <PageHeader
        title="My Chest"
        lede="Your chest holds USDC that earns a variable yield and bids on offers, by hand or with Auto-Absorb."
      />
      <LockTerms params={params} />
      <div className="mt-8">
        {!market ? (
          loading ? (
            <SkeletonRows rows={4} label="Loading market" />
          ) : (
            <ErrorNote error={error} onRetry={refresh} what="the market" />
          )
        ) : !publicKey ? (
          <ConnectPrompt action="open your chest" />
        ) : (
          <ChestBody market={market} owner={publicKey.toBase58()} params={params} />
        )}
      </div>
    </>
  );
}

/** The time lock and penalty are always on screen, connected or not. */
function LockTerms({ params }: { params: UiParams }) {
  return (
    <div className="terms" data-testid="chest-lock-terms">
      <p>
        <strong>Withdrawals are time-locked.</strong> Every deposit and every harvest restarts a{" "}
        {Math.round(params.chestLockSecs / DAY)}-day rolling lock. Withdrawing before it ends costs a{" "}
        <strong>{formatBps(params.chestPenaltyBps, 0)} penalty</strong>, paid to Shield depositors. After the lock ends,
        withdrawals are free and cannot be paused.
      </p>
    </div>
  );
}

function ChestBody({ market, owner, params }: { market: MarketInfo; owner: string; params: UiParams }) {
  const chest = useApi<ChestResponse>(paths.chest(market.mint, owner), { refreshMs: 30_000 });
  const now = useNow();
  if (chest.loading) return <SkeletonRows rows={5} label="Loading your chest" />;
  if (!chest.data) return <ErrorNote error={chest.error} onRetry={chest.refresh} what="your chest" />;

  const c = chest.data.chest;
  const balance = toBig(c?.balance);
  const lockUntil = toUnixSecs(c?.lock_until);
  const locked = now < lockUntil;
  const yieldEst = estimateChestYield(chest.data.events, balance, now);
  const refresh = () => void revalidate(paths.chest(market.mint, owner));

  return (
    <div className="grid gap-10">
      <StaleNote stale={chest.stale} />
      <dl className="grid grid-cols-1 gap-6 border-y border-line py-6 sm:grid-cols-3" data-testid="chest-summary">
        <div className="stat">
          <dt>Balance</dt>
          <dd className="!text-[2.5rem]">
            {formatUnits(balance, market.quoteDecimals, 2)}{" "}
            <span className="text-lg text-muted">{market.quoteSymbol}</span>
          </dd>
        </div>
        <div className="stat">
          <dt>Variable yield (estimated)</dt>
          <dd className="!text-[2.5rem]">{yieldEst === null ? "–" : formatPercent(yieldEst, 1)}</dd>
          <dd className="sub">
            {yieldEst === null
              ? "Appears after your first harvest. Rates change with fees and lending markets."
              : "Annualised from your harvests in the last 30 days. Variable; past rates do not carry forward."}
          </dd>
        </div>
        <div className="stat" data-testid="lock-status">
          <dt>Lock status</dt>
          <dd className={`!text-[2.5rem] ${locked ? "text-red" : ""}`}>
            {c ? (locked ? "Locked" : "Unlocked") : "No chest yet"}
          </dd>
          <dd className="sub">
            {locked
              ? `Until ${formatDate(lockUntil)} (${formatDuration(lockUntil - now)}). Early withdrawal penalty: ${formatBps(params.chestPenaltyBps, 0)}.`
              : c
                ? "Withdrawals are free now. A deposit or harvest restarts the lock."
                : "Your first deposit opens your chest and starts the lock."}
          </dd>
        </div>
      </dl>

      <div className="grid gap-6 lg:grid-cols-3">
        <DepositForm market={market} params={params} onDone={refresh} />
        <WithdrawForm
          market={market}
          params={params}
          balance={balance}
          lockUntil={lockUntil}
          now={now}
          onDone={refresh}
        />
        <HarvestCard market={market} params={params} onDone={refresh} hasChest={!!c} />
      </div>

      <AutoAbsorbForm
        key={JSON.stringify(chest.data.grant)}
        market={market}
        params={params}
        grant={chest.data.grant}
        onDone={refresh}
      />

      <section aria-labelledby="history">
        <SectionTitle id="history">History</SectionTitle>
        {chest.data.events.length === 0 ? (
          <EmptyState title="No chest activity yet">
            Deposits, bids, refunds and harvests will be listed here.
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table" data-testid="chest-history">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Activity</th>
                  <th scope="col" className="num">
                    Amount ({market.quoteSymbol})
                  </th>
                  <th scope="col" className="num">
                    Penalty
                  </th>
                  <th scope="col" className="num">
                    Balance after
                  </th>
                </tr>
              </thead>
              <tbody>
                {chest.data.events.map((e) => (
                  <tr key={`${e.signature}-${e.event_index}`}>
                    <td>{formatDateTime(e.ts)}</td>
                    <td>{CHEST_EVENT_LABELS[e.kind] ?? "Activity"}</td>
                    <td className="num">{formatUnits(e.assets, market.quoteDecimals, 2)}</td>
                    <td className="num">
                      {toBig(e.penalty) > 0n ? formatUnits(e.penalty, market.quoteDecimals, 2) : "–"}
                    </td>
                    <td className="num">{formatUnits(e.balance_after, market.quoteDecimals, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function DepositForm({ market, params, onDone }: { market: MarketInfo; params: UiParams; onDone: () => void }) {
  const { send } = useSendTx();
  const balances = useWalletBalances(market);
  const [v, setV] = useState("");
  const [touched, setTouched] = useState(false);
  const amount = parseUnits(v, market.quoteDecimals);
  const err =
    amount === null || amount === 0n
      ? "Enter an amount to deposit."
      : balances.quote !== null && amount > balances.quote
        ? `That is more ${market.quoteSymbol} than your wallet holds.`
        : undefined;
  return (
    <form
      className="panel grid content-start gap-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setTouched(true);
        if (err || !amount) return;
        const sig = await send({
          label: "Depositing",
          success: "Deposited to chest",
          market,
          build: ({ client, owner }) => client.depositIxs(owner, amount),
        });
        if (sig) {
          setV("");
          setTouched(false);
          balances.refresh();
          onDone();
        }
      }}
    >
      <h2 className="section-title">Deposit</h2>
      <Field
        label={`Amount (${market.quoteSymbol})`}
        error={touched ? err : undefined}
        hint={`Wallet: ${balances.quote === null ? "–" : formatUnits(balances.quote, market.quoteDecimals, 2)} ${market.quoteSymbol}. Restarts the ${Math.round(params.chestLockSecs / DAY)}-day lock.`}
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            className="input"
            inputMode="decimal"
            value={v}
            onChange={(e) => setV(e.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid}
          />
        )}
      </Field>
      <button type="submit" className="btn btn-primary">
        Deposit
      </button>
    </form>
  );
}

function WithdrawForm({
  market,
  params,
  balance,
  lockUntil,
  now,
  onDone,
}: {
  market: MarketInfo;
  params: UiParams;
  balance: bigint;
  lockUntil: number;
  now: number;
  onDone: () => void;
}) {
  const { send } = useSendTx();
  const [v, setV] = useState("");
  const [ack, setAck] = useState(false);
  const [touched, setTouched] = useState(false);
  const amount = parseUnits(v, market.quoteDecimals);
  const preview = amount ? withdrawPreview(amount, lockUntil, now, params.chestPenaltyBps) : null;
  const locked = now < lockUntil;
  const err =
    amount === null || amount === 0n
      ? "Enter an amount to withdraw."
      : amount > balance
        ? "That is more than your chest balance."
        : locked && !ack
          ? "Confirm the early-withdrawal penalty to continue."
          : undefined;
  return (
    <form
      className="panel grid content-start gap-4"
      noValidate
      data-testid="withdraw-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setTouched(true);
        if (err || !amount) return;
        const sig = await send({
          label: "Withdrawing",
          success: "Withdrawn from chest",
          market,
          build: async ({ client, owner }) => [
            ...(await client.ensureQuoteAtaIx(owner)),
            await client.withdrawIx(owner, amount),
          ],
        });
        if (sig) {
          setV("");
          setAck(false);
          setTouched(false);
          onDone();
        }
      }}
    >
      <h2 className="section-title">Withdraw</h2>
      <Field
        label={`Amount (${market.quoteSymbol})`}
        error={touched ? err : undefined}
        hint={locked ? `Locked until ${formatDate(lockUntil)}.` : "Unlocked: no penalty."}
      >
        {({ id, describedBy, invalid }) => (
          <div className="flex gap-2">
            <input
              id={id}
              className="input"
              inputMode="decimal"
              value={v}
              onChange={(e) => setV(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid}
            />
            <button
              type="button"
              className="btn"
              onClick={() => setV(unitsToDecimalString(balance, market.quoteDecimals))}
            >
              Max
            </button>
          </div>
        )}
      </Field>
      {preview ? (
        <dl className="grid gap-1 text-sm" aria-live="polite" data-testid="withdraw-preview">
          <div className="flex justify-between">
            <dt className="text-muted">Penalty</dt>
            <dd className={preview.penalty > 0n ? "font-semibold text-red" : "font-semibold"}>
              {formatUnits(preview.penalty, market.quoteDecimals, 2)} {market.quoteSymbol}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">You receive</dt>
            <dd className="font-semibold">
              {formatUnits(preview.net, market.quoteDecimals, 2)} {market.quoteSymbol}
            </dd>
          </div>
        </dl>
      ) : null}
      {locked ? (
        <label className="check text-sm">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>I accept the {formatBps(params.chestPenaltyBps, 0)} early-withdrawal penalty.</span>
        </label>
      ) : null}
      <button type="submit" className={`btn ${locked ? "btn-danger" : "btn-primary"}`}>
        {locked ? "Withdraw early" : "Withdraw"}
      </button>
    </form>
  );
}

function HarvestCard({
  market,
  params,
  onDone,
  hasChest,
}: {
  market: MarketInfo;
  params: UiParams;
  onDone: () => void;
  hasChest: boolean;
}) {
  const { send } = useSendTx();
  return (
    <div className="panel grid content-start gap-4">
      <h2 className="section-title">Harvest rewards</h2>
      <p className="text-muted">
        Moves your share of trading fees into the chest. Harvesting counts as a deposit, so it restarts the{" "}
        {Math.round(params.chestLockSecs / DAY)}-day lock.
      </p>
      <button
        type="button"
        className="btn"
        disabled={!hasChest}
        onClick={async () => {
          const sig = await send({
            label: "Harvesting",
            success: "Rewards harvested into chest",
            market,
            build: ({ client, owner }) => client.harvestIxs(owner),
          });
          if (sig) onDone();
        }}
      >
        Harvest into chest
      </button>
      {!hasChest ? <p className="field-hint">Deposit first to open your chest.</p> : null}
    </div>
  );
}

function grantToForm(g: GrantRow | null, decimals: number): GrantForm {
  if (!g) return { enabled: true, maxPerOffer: "", maxPerDay: "", minDiscountPct: "5", reserveFloor: "0" };
  return {
    enabled: g.enabled,
    maxPerOffer: unitsToDecimalString(toBig(g.max_per_offer), decimals),
    maxPerDay: unitsToDecimalString(toBig(g.max_per_day), decimals),
    minDiscountPct: String(g.min_discount_bps / 100),
    reserveFloor: unitsToDecimalString(toBig(g.reserve_floor), decimals),
  };
}

function AutoAbsorbForm({
  market,
  params,
  grant,
  onDone,
}: {
  market: MarketInfo;
  params: UiParams;
  grant: GrantRow | null;
  onDone: () => void;
}) {
  const { send } = useSendTx();
  const [form, setForm] = useState<GrantForm>(() => grantToForm(grant, market.quoteDecimals));
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const { errors, value } = validateGrant(form, {
    quoteDecimals: market.quoteDecimals,
    maxDiscountBps: params.maxDiscountBps,
  });
  const upd = (k: keyof GrantForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === "enabled" ? e.target.checked : e.target.value }));
  const err = (k: keyof GrantForm) => (submitted ? errors[k] : undefined);
  const q = market.quoteSymbol;

  const save = async (enabled: boolean) => {
    setSubmitted(true);
    const v = enabled ? value : { enabled: false, maxPerOffer: 0n, maxPerDay: 0n, minDiscountBps: 0, reserveFloor: 0n };
    if (!v) return;
    setBusy(true);
    const sig = await send({
      label: enabled ? "Saving Auto-Absorb" : "Revoking Auto-Absorb",
      success: enabled ? "Auto-Absorb saved" : "Auto-Absorb revoked",
      market,
      build: async ({ client, owner }) => [await client.setGrantIx(owner, { ...v, enabled: enabled && v.enabled })],
    });
    setBusy(false);
    if (sig) {
      setSubmitted(false);
      onDone();
    }
  };

  return (
    <section aria-labelledby="auto" className="panel grid gap-5" data-testid="auto-absorb">
      <div className="grid gap-1">
        <h2 id="auto" className="section-title">
          Auto-Absorb
        </h2>
        <p className="text-muted prose-measure">
          Let the keeper bid from your chest on offers that meet your limits. It can only bid within these caps, never
          withdraw. {grant ? (grant.enabled ? "Status: on." : "Status: off.") : "Not set up yet."}
        </p>
      </div>
      <form
        className="grid gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save(true);
        }}
      >
        <label className="check">
          <input type="checkbox" checked={form.enabled} onChange={upd("enabled")} />
          <span className="font-semibold">Bid automatically</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Max per offer (${q})`} error={err("maxPerOffer")}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                className="input"
                inputMode="decimal"
                value={form.maxPerOffer}
                onChange={upd("maxPerOffer")}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                data-testid="grant-max-offer"
              />
            )}
          </Field>
          <Field label={`Max per day (${q})`} error={err("maxPerDay")}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                className="input"
                inputMode="decimal"
                value={form.maxPerDay}
                onChange={upd("maxPerDay")}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                data-testid="grant-max-day"
              />
            )}
          </Field>
          <Field
            label="Minimum discount (%)"
            error={err("minDiscountPct")}
            hint={`Offers range from ${formatBps(params.minDiscountBps, 0)} to ${formatBps(params.maxDiscountBps, 0)}.`}
          >
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                className="input"
                inputMode="decimal"
                value={form.minDiscountPct}
                onChange={upd("minDiscountPct")}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                data-testid="grant-min-discount"
              />
            )}
          </Field>
          <Field
            label={`Reserve floor (${q})`}
            error={err("reserveFloor")}
            hint="Auto-Absorb never spends the chest below this amount."
          >
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                className="input"
                inputMode="decimal"
                value={form.reserveFloor}
                onChange={upd("reserveFloor")}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                data-testid="grant-reserve"
              />
            )}
          </Field>
        </div>
        {submitted && Object.keys(errors).length ? (
          <p className="field-error" role="alert" data-testid="grant-errors">
            Fix the highlighted fields to save Auto-Absorb.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="grant-save">
            Save Auto-Absorb
          </button>
          {grant?.enabled ? (
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void save(false)}>
              Revoke
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
