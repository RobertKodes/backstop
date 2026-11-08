"use client";

import { priceToFloat } from "@backstop/sdk";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";

import { type TreasuryResponse, paths } from "@/lib/api";
import { redeemPreview, withSlippage } from "@/lib/estimates";
import {
  SOL_DECIMALS,
  TOKEN_DECIMALS,
  formatBps,
  formatCompact,
  formatDateTime,
  formatPrice,
  formatUnits,
  parseUnits,
  toBig,
  unitsToDecimalString,
} from "@/lib/format";
import { type MarketInfo, useMarketParams, useRootMarket, useSolUsd, useWalletBalances } from "@/lib/market";
import { useSendTx } from "@/lib/tx";
import { revalidate, useApi } from "@/lib/use-api";

import { LineChart } from "../line-chart";
import {
  Address,
  EmptyState,
  ErrorNote,
  Field,
  PageHeader,
  SectionTitle,
  Skeleton,
  SkeletonRows,
  StaleNote,
} from "../ui";
import { TOKEN_SYMBOL } from "./live-view";

const SLIPPAGE_BPS = 50;
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function TreasuryView() {
  const { market, loading, error, refresh } = useRootMarket();
  return (
    <>
      <PageHeader
        title="Treasury"
        lede="Part of every trading fee is converted to SOL and held here. Any holder can burn tokens for a pro-rata share of it, at any time."
      />
      {market ? (
        <TreasuryBody market={market} />
      ) : loading ? (
        <SkeletonRows rows={5} label="Loading market" />
      ) : (
        <ErrorNote error={error} onRetry={refresh} what="the market" />
      )}
    </>
  );
}

function TreasuryBody({ market }: { market: MarketInfo }) {
  const t = useApi<TreasuryResponse>(paths.treasury(market.mint), { refreshMs: 60_000 });
  const solUsd = useSolUsd();
  const latest = t.data?.latest;
  const floorSol = latest ? priceToFloat(toBig(latest.floor_price), SOL_DECIMALS, TOKEN_DECIMALS) : null;
  const history = t.data?.history ?? [];
  const solPoints = history.map((h) => ({ t: new Date(h.ts).getTime(), v: Number(toBig(h.treasury_lamports)) / 1e9 }));
  const floorPoints = history.map((h) => ({
    t: new Date(h.ts).getTime(),
    v: priceToFloat(toBig(h.floor_price), SOL_DECIMALS, TOKEN_DECIMALS),
  }));

  return (
    <div className="grid gap-10">
      <dl
        className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 md:grid-cols-4"
        data-testid="treasury-facts"
      >
        <div className="stat">
          <dt>SOL held</dt>
          <dd>
            {t.loading ? (
              <Skeleton className="h-7 w-24" />
            ) : latest ? (
              `${formatUnits(latest.treasury_lamports, SOL_DECIMALS, 2)} SOL`
            ) : (
              "–"
            )}
          </dd>
          {latest && solUsd ? (
            <dd className="sub">
              about ${formatCompact(BigInt(Math.round((Number(toBig(latest.treasury_lamports)) / 1e9) * solUsd)), 0)} at
              the current SOL price
            </dd>
          ) : null}
        </div>
        <div className="stat">
          <dt>Floor price</dt>
          <dd>
            {t.loading ? <Skeleton className="h-7 w-24" /> : floorSol === null ? "–" : `${formatPrice(floorSol)} SOL`}
          </dd>
          <dd className="sub">per token, before the redemption fee</dd>
        </div>
        <div className="stat">
          <dt>Circulating supply</dt>
          <dd>{latest ? formatCompact(latest.circulating, TOKEN_DECIMALS) : "–"}</dd>
          <dd className="sub">excludes tokens held by the AMM pool</dd>
        </div>
        <div className="stat">
          <dt>Recent redemptions</dt>
          <dd>{t.data?.redemptions.length ?? 0}</dd>
        </div>
      </dl>
      <ErrorNote error={t.data ? undefined : t.error} onRetry={t.refresh} what="treasury figures" />
      <StaleNote stale={t.stale} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
        <div className="grid content-start gap-10">
          <section aria-labelledby="sol-history">
            <SectionTitle id="sol-history">SOL held, last 30 days</SectionTitle>
            {t.loading ? (
              <Skeleton className="h-[220px]" label="Loading treasury history" />
            ) : solPoints.length ? (
              <LineChart
                testId="treasury-chart"
                height={220}
                series={[
                  { id: "sol", label: "Treasury SOL", short: "SOL", color: "var(--chart-price)", points: solPoints },
                ]}
                summary={`Treasury SOL over 30 days, now ${formatUnits(latest?.treasury_lamports, SOL_DECIMALS, 2)} SOL.`}
                formatValue={(v) => formatPrice(v)}
                formatTime={(x) => dayFmt.format(x)}
              />
            ) : (
              <EmptyState title="No treasury snapshots yet" />
            )}
          </section>
          <section aria-labelledby="floor-history">
            <SectionTitle id="floor-history">Floor per token (SOL), last 30 days</SectionTitle>
            {floorPoints.length ? (
              <LineChart
                height={200}
                series={[{ id: "floor", label: "Floor (SOL)", color: "var(--chart-floor)", points: floorPoints }]}
                summary={`Floor price per token over 30 days, now ${formatPrice(floorSol)} SOL.`}
                formatValue={(v) => formatPrice(v)}
                formatTime={(x) => dayFmt.format(x)}
                caption="Floor = treasury SOL ÷ circulating supply."
              />
            ) : null}
          </section>
        </div>
        <RedeemForm market={market} treasury={t.data} />
      </div>

      <section aria-labelledby="redemptions">
        <SectionTitle id="redemptions">Recent redemptions</SectionTitle>
        {!t.data?.redemptions.length ? (
          <EmptyState title="No redemptions yet" />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Wallet</th>
                  <th scope="col" className="num">
                    Burned ({TOKEN_SYMBOL})
                  </th>
                  <th scope="col" className="num">
                    Received (SOL)
                  </th>
                  <th scope="col" className="num">
                    Fee (SOL)
                  </th>
                </tr>
              </thead>
              <tbody>
                {t.data.redemptions.map((r) => (
                  <tr key={r.signature}>
                    <td>{formatDateTime(r.ts)}</td>
                    <td>
                      <Address value={r.wallet} />
                    </td>
                    <td className="num">{formatCompact(r.tokens, TOKEN_DECIMALS)}</td>
                    <td className="num">{formatUnits(r.net_lamports, SOL_DECIMALS, 4)}</td>
                    <td className="num">{formatUnits(r.fee_lamports, SOL_DECIMALS, 4)}</td>
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

function RedeemForm({ market, treasury }: { market: MarketInfo; treasury: TreasuryResponse | undefined }) {
  const { publicKey } = useWallet();
  const { send, connected, openWalletModal } = useSendTx();
  const balances = useWalletBalances(market);
  const { params } = useMarketParams(market);
  const [v, setV] = useState("");
  const [touched, setTouched] = useState(false);
  const amount = parseUnits(v, TOKEN_DECIMALS);
  const latest = treasury?.latest;
  const preview =
    amount && latest
      ? redeemPreview(amount, toBig(latest.treasury_lamports), toBig(latest.circulating), params.redemptionFeeBps)
      : null;
  const err =
    amount === null || amount === 0n
      ? "Enter how many tokens to redeem."
      : balances.token !== null && amount > balances.token
        ? `That is more ${TOKEN_SYMBOL} than your wallet holds.`
        : !latest
          ? "Treasury figures are not available yet."
          : !preview
            ? "That is more than the circulating supply."
            : undefined;

  return (
    <form
      className="panel grid content-start gap-5 self-start"
      noValidate
      data-testid="redeem-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setTouched(true);
        if (!connected) return openWalletModal();
        if (err || !amount || !preview) return;
        const sig = await send({
          label: "Redeeming",
          success: "Redeemed for SOL",
          market,
          build: ({ client, owner }) => client.redeemIxs(owner, amount, withSlippage(preview.net, SLIPPAGE_BPS)),
        });
        if (sig) {
          setV("");
          setTouched(false);
          balances.refresh();
          void revalidate(paths.treasury(market.mint));
        }
      }}
    >
      <div>
        <h2 className="section-title">Redeem at the floor</h2>
        <p className="mt-1 text-sm text-muted">
          Burn {TOKEN_SYMBOL} for its pro-rata share of treasury SOL. Always available; a{" "}
          {formatBps(params.redemptionFeeBps, 0)} fee stays in the treasury.
        </p>
      </div>
      <Field
        label={`Tokens to burn (${TOKEN_SYMBOL})`}
        error={touched || v ? err : undefined}
        hint={
          publicKey
            ? `Wallet: ${balances.token === null ? "–" : formatUnits(balances.token, TOKEN_DECIMALS, 2)} ${TOKEN_SYMBOL}`
            : undefined
        }
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
              data-testid="redeem-amount"
            />
            {balances.token ? (
              <button
                type="button"
                className="btn"
                onClick={() => setV(unitsToDecimalString(balances.token!, TOKEN_DECIMALS))}
              >
                Max
              </button>
            ) : null}
          </div>
        )}
      </Field>
      <dl className="grid gap-2 border-t border-line pt-4 text-sm" aria-live="polite" data-testid="redeem-preview">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Pro-rata share</dt>
          <dd className="font-semibold">{preview ? `${formatUnits(preview.gross, SOL_DECIMALS, 6)} SOL` : "–"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Redemption fee ({formatBps(params.redemptionFeeBps, 0)})</dt>
          <dd className="font-semibold">{preview ? `− ${formatUnits(preview.fee, SOL_DECIMALS, 6)} SOL` : "–"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">You receive</dt>
          <dd className="figure text-lg" data-testid="redeem-net">
            {preview ? `${formatUnits(preview.net, SOL_DECIMALS, 6)} SOL` : "–"}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted">
        Based on the latest treasury snapshot; the program computes the exact amount and rejects the burn if it would
        pay more than 0.5% less than this preview.
      </p>
      <button type="submit" className="btn btn-primary btn-lg w-full" data-testid="redeem-submit">
        {connected ? "Burn and redeem" : "Connect wallet to redeem"}
      </button>
    </form>
  );
}
