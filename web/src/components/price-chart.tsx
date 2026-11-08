"use client";

import { priceToFloat } from "@backstop/sdk";
import { useId, useState } from "react";

import { type Candle, paths } from "@/lib/api";
import { TOKEN_DECIMALS, formatPrice, toBig } from "@/lib/format";
import { useApi } from "@/lib/use-api";

import { LineChart, type Series } from "./line-chart";
import { ErrorNote, Skeleton } from "./ui";

const RANGES = [
  { id: "24h", label: "24 hours", bucket: 300, hours: 24 },
  { id: "7d", label: "7 days", bucket: 3_600, hours: 168 },
  { id: "30d", label: "30 days", bucket: 14_400, hours: 720 },
] as const;

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/**
 * Price (quote per token) with the treasury floor drawn in the same unit.
 * The floor is held in SOL, so it is converted with a SOL/USD reference; when
 * that is unavailable the floor is listed under the chart instead.
 */
export function PriceChart({
  mint,
  quoteDecimals,
  quoteSymbol,
  floorInQuote,
  floorNote,
}: {
  mint: string;
  quoteDecimals: number;
  quoteSymbol: string;
  floorInQuote: number | null;
  floorNote?: React.ReactNode;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[0]);
  const name = useId();
  const candles = useApi<Candle[]>(paths.price(mint, range.bucket, range.hours), { refreshMs: 30_000 });

  const points = (candles.data ?? [])
    .map((c) => ({ t: new Date(c.bucket).getTime(), v: priceToFloat(toBig(c.close), quoteDecimals, TOKEN_DECIMALS) }))
    .filter((p) => Number.isFinite(p.t) && p.v > 0);

  const series: Series[] = [
    { id: "price", label: `Price (${quoteSymbol})`, short: "Price", color: "var(--chart-price)", points },
  ];
  if (floorInQuote && points.length) {
    series.push({
      id: "floor",
      label: `Treasury floor (${quoteSymbol})`,
      short: "Floor",
      color: "var(--chart-floor)",
      dashed: true,
      points: [
        { t: points[0]!.t, v: floorInQuote },
        { t: points[points.length - 1]!.t, v: floorInQuote },
      ],
    });
  }

  const first = points[0]?.v;
  const last = points[points.length - 1]?.v;
  const summary =
    points.length > 0
      ? `Price over the last ${range.label}: from ${formatPrice(first)} to ${formatPrice(last)} ${quoteSymbol} per token.${
          floorInQuote ? ` Treasury floor about ${formatPrice(floorInQuote)} ${quoteSymbol} per token.` : ""
        } Use left and right arrow keys to read values.`
      : "No price data";

  return (
    <div className="grid gap-4">
      <fieldset className="segmented max-w-sm" data-testid="chart-range">
        <legend className="sr-only">Chart range</legend>
        {RANGES.map((r) => (
          <label key={r.id}>
            <input type="radio" name={name} checked={range.id === r.id} onChange={() => setRange(r)} />
            {r.label}
          </label>
        ))}
      </fieldset>
      {candles.loading ? (
        <Skeleton className="h-[260px]" label="Loading price chart" />
      ) : candles.error && !candles.data ? (
        <ErrorNote error={candles.error} onRetry={candles.refresh} what="price history" />
      ) : points.length === 0 ? (
        <p className="note">No trades in this range yet.</p>
      ) : (
        <LineChart
          testId="price-chart"
          series={series}
          summary={summary}
          formatValue={(v) => formatPrice(v)}
          formatTime={(t) => (range.hours > 24 ? dayFmt.format(t) : timeFmt.format(t))}
          caption={floorNote}
        />
      )}
    </div>
  );
}
