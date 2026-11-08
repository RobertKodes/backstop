"use client";

import type { ChildRow } from "@/lib/api";
import { useNow } from "@/lib/clock";
import { vestingProgress } from "@/lib/estimates";
import {
  SOL_DECIMALS,
  formatBps,
  formatDate,
  formatDuration,
  formatPercent,
  formatUnits,
  toUnixSecs,
} from "@/lib/format";

import { Meter } from "./ui";

/** Plain facts about a launchpad child, shown for every child. */
export function RiskPanel({ child }: { child: ChildRow }) {
  const now = useNow();
  const vestEnd = toUnixSecs(child.vesting_end);
  const vested = vestingProgress(vestEnd, now);
  const age = now - toUnixSecs(child.created_at);
  const live = child.status === "live";
  return (
    <div className="grid gap-4" data-testid="risk-panel">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted">Creator allocation</dt>
          <dd className="font-semibold" data-testid="risk-creator">
            {formatBps(child.creator_bps)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Initial liquidity</dt>
          <dd className="font-semibold">{formatUnits(child.liquidity, SOL_DECIMALS, 2)} SOL</dd>
        </div>
        <div>
          <dt className="text-muted">Age</dt>
          <dd className="font-semibold">{age > 0 ? formatDuration(age) : "–"}</dd>
        </div>
        <div>
          <dt className="text-muted">Holders</dt>
          <dd className="font-semibold">
            {typeof child.holder_count === "number" ? child.holder_count : "Not indexed yet"}
          </dd>
        </div>
      </dl>
      {child.creator_bps > 0 ? (
        <div className="grid gap-1">
          <p className="flex justify-between text-sm">
            <span className="text-muted">Creator vesting</span>
            <span>
              {formatPercent(vested, 0)} vested{vestEnd ? `, fully by ${formatDate(vestEnd)}` : ""}
            </span>
          </p>
          <Meter
            value={vested}
            tone="brass"
            label="Creator allocation vested"
            valueText={`${formatPercent(vested, 0)} vested over 90 days`}
          />
        </div>
      ) : (
        <p className="text-sm text-muted">No creator allocation: the creator received no tokens at launch.</p>
      )}
      <ul className="grid gap-1 text-sm" aria-label="On-chain facts checked at launch">
        {[
          "Liquidity is locked forever and cannot be withdrawn by anyone.",
          "Mint authority revoked: no new tokens can be created.",
          "No freeze authority and no permanent delegate: nobody can freeze or move holders' tokens.",
          ...(child.creator_bps > 0 ? ["Creator tokens vest linearly over 90 days."] : []),
        ].map((f) => (
          <li key={f} className="flex gap-2">
            <svg viewBox="0 0 16 16" width="16" height="16" className="mt-1 flex-none text-green" aria-hidden="true">
              <path
                d="M3 8.5l3 3 7-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {!live ? (
        <p className="terms text-sm">
          <strong>Not live yet.</strong> The protocol verifies these facts on-chain before trading opens (status:{" "}
          {child.status}).
        </p>
      ) : null}
      <p className="text-sm text-muted">
        These checks remove some ways a launch can go wrong. They say nothing about whether the token will hold value.
      </p>
    </div>
  );
}
