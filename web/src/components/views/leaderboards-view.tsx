"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";

import { type AbsorberRow, type LeaderboardKind, type ShieldLeaderRow, type TenureRow, paths } from "@/lib/api";
import { DAY } from "@/lib/estimates";
import { TOKEN_DECIMALS, formatCompact, formatUnits, toBig } from "@/lib/format";
import { type MarketInfo, useRootMarket } from "@/lib/market";
import { useApi } from "@/lib/use-api";

import { Tabs } from "../tabs";
import { Address, EmptyState, ErrorNote, PageHeader, SkeletonRows, StaleNote } from "../ui";
import { TOKEN_SYMBOL } from "./live-view";

const TABS: { id: LeaderboardKind; label: string; blurb: string }[] = [
  {
    id: "tenure",
    label: "Oldest bags",
    blurb: "Holders ranked by tenure: balance × time held. Tenure raises the reward multiplier up to 3× after 90 days.",
  },
  {
    id: "absorbers",
    label: "Top absorbers",
    blurb: "Wallets that have absorbed the most tokens from offers, by chest, wallet and Auto-Absorb bids.",
  },
  {
    id: "shield",
    label: "Top Shield",
    blurb: "Shield depositors with locked positions, ranked by lock-weighted principal.",
  },
];

export function LeaderboardsView() {
  const { market, loading, error, refresh } = useRootMarket();
  const [tab, setTab] = useState<LeaderboardKind>("tenure");
  const blurb = TABS.find((t) => t.id === tab)?.blurb;
  return (
    <>
      <PageHeader title="Leaderboards" lede="Who holds longest, who absorbs most, and who stands behind the Shield." />
      {!market ? (
        loading ? (
          <SkeletonRows rows={6} label="Loading market" />
        ) : (
          <ErrorNote error={error} onRetry={refresh} what="the market" />
        )
      ) : (
        <Tabs tabs={TABS} value={tab} onChange={(id) => setTab(id as LeaderboardKind)} label="Leaderboards">
          <p className="mb-4 text-muted prose-measure">{blurb}</p>
          <Board market={market} kind={tab} />
        </Tabs>
      )}
    </>
  );
}

function Board({ market, kind }: { market: MarketInfo; kind: LeaderboardKind }) {
  const rows = useApi<unknown[]>(paths.leaderboard(market.mint, kind), { refreshMs: 60_000 });
  const { publicKey } = useWallet();
  const me = publicKey?.toBase58();
  if (rows.loading) return <SkeletonRows rows={6} label="Loading leaderboard" />;
  if (!rows.data) return <ErrorNote error={rows.error} onRetry={rows.refresh} what="this leaderboard" />;
  if (!rows.data.length) return <EmptyState title="Nobody here yet" />;

  const rank = (i: number, wallet: string) => (
    <th scope="row" className="w-12 text-left font-semibold">
      {i + 1}
      {wallet === me ? <span className="sr-only"> (you)</span> : null}
    </th>
  );
  const you = (w: string) =>
    w === me ? (
      <span className="badge ml-2" data-tone="brass">
        You
      </span>
    ) : null;

  return (
    <div className="table-scroll">
      <StaleNote stale={rows.stale} />
      <table className="data-table" data-testid={`leaderboard-${kind}`}>
        {kind === "tenure" ? (
          <>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Holder</th>
                <th scope="col" className="num">
                  Balance ({TOKEN_SYMBOL})
                </th>
                <th scope="col" className="num">
                  Average age
                </th>
                <th scope="col" className="num">
                  Multiplier
                </th>
              </tr>
            </thead>
            <tbody>
              {(rows.data as TenureRow[]).map((r, i) => {
                const bal = toBig(r.balance);
                const age = bal > 0n ? Number(toBig(r.tenure) / bal) : 0;
                return (
                  <tr key={r.wallet}>
                    {rank(i, r.wallet)}
                    <td>
                      <Address value={r.wallet} />
                      {you(r.wallet)}
                    </td>
                    <td className="num">{formatCompact(r.balance, TOKEN_DECIMALS)}</td>
                    <td className="num">{Math.floor(age / DAY)} days</td>
                    <td className="num">{(r.multiplier_bps / 10_000).toFixed(2)}×</td>
                  </tr>
                );
              })}
            </tbody>
          </>
        ) : kind === "absorbers" ? (
          <>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Absorber</th>
                <th scope="col" className="num">
                  Absorbed ({TOKEN_SYMBOL})
                </th>
                <th scope="col" className="num">
                  Paid ({market.quoteSymbol})
                </th>
                <th scope="col" className="num">
                  Fills
                </th>
              </tr>
            </thead>
            <tbody>
              {(rows.data as AbsorberRow[]).map((r, i) => (
                <tr key={r.wallet}>
                  {rank(i, r.wallet)}
                  <td>
                    <Address value={r.wallet} />
                    {you(r.wallet)}
                  </td>
                  <td className="num">{formatCompact(r.tokens, TOKEN_DECIMALS)}</td>
                  <td className="num">{formatUnits(r.quote, market.quoteDecimals, 0)}</td>
                  <td className="num">{r.fills}</td>
                </tr>
              ))}
            </tbody>
          </>
        ) : (
          <>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Depositor</th>
                <th scope="col" className="num">
                  Locked ({market.quoteSymbol})
                </th>
                <th scope="col" className="num">
                  Lock-weighted
                </th>
                <th scope="col" className="num">
                  Positions
                </th>
              </tr>
            </thead>
            <tbody>
              {(rows.data as ShieldLeaderRow[]).map((r, i) => (
                <tr key={r.wallet}>
                  {rank(i, r.wallet)}
                  <td>
                    <Address value={r.wallet} />
                    {you(r.wallet)}
                  </td>
                  <td className="num">{formatUnits(r.principal, market.quoteDecimals, 0)}</td>
                  <td className="num">{formatUnits(r.weighted, market.quoteDecimals, 0)}</td>
                  <td className="num">{r.positions}</td>
                </tr>
              ))}
            </tbody>
          </>
        )}
      </table>
    </div>
  );
}
