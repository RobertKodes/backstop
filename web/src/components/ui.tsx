"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useId } from "react";

import { useNow } from "@/lib/clock";
import { explorerAddress } from "@/lib/config";
import { formatCountdown, shortAddress, spokenCountdown, toUnixSecs } from "@/lib/format";

import { useWalletDialog } from "./wallet-dialog";

export function PageHeader({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 grid gap-4 md:mb-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div className="grid gap-3">
        <h1 className="page-title">{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export function SectionTitle({
  id,
  children,
  aside,
}: {
  id?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 id={id} className="section-title">
        {children}
      </h2>
      {aside ? <div className="text-sm text-muted">{aside}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "", label }: { className?: string; label?: string }) {
  return (
    <div
      className={`skeleton ${className}`}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-busy={label ? true : undefined}
    >
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}

export function SkeletonRows({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="grid gap-3" role="status" aria-label={label} aria-busy="true" data-testid="skeleton">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-12" />
      ))}
    </div>
  );
}

export function ErrorNote({
  error,
  onRetry,
  what = "this data",
}: {
  error: Error | undefined;
  onRetry?: () => void;
  what?: string;
}) {
  if (!error) return null;
  return (
    <div className="note flex flex-wrap items-center justify-between gap-3" role="alert" data-testid="error-note">
      <p>
        <strong className="font-semibold">Could not load {what}.</strong> {error.message} Figures will refresh
        automatically once the data service is reachable.
      </p>
      {onRetry ? (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function StaleNote({ stale }: { stale: boolean }) {
  if (!stale) return null;
  return (
    <p className="text-sm text-muted" role="status">
      Showing the last figures received; the data service is not responding right now.
    </p>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line-strong px-5 py-8 text-center">
      <p className="font-semibold">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-[52ch] text-muted">{children}</div> : null}
    </div>
  );
}

export function Address({
  value,
  chars = 4,
  link = true,
}: {
  value: string | null | undefined;
  chars?: number;
  link?: boolean;
}) {
  if (!value) return <span>–</span>;
  const short = shortAddress(value, chars);
  if (!link)
    return (
      <span title={value}>
        <span aria-hidden="true">{short}</span>
        <span className="sr-only">{value}</span>
      </span>
    );
  return (
    <a href={explorerAddress(value)} target="_blank" rel="noreferrer" className="link" title={value}>
      <span aria-hidden="true">{short}</span>
      <span className="sr-only">Address {value} (opens explorer in a new tab)</span>
    </a>
  );
}

/** Field wrapper wiring label, hint and error to the control via ids. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, describedBy, invalid: !!error })}
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="field-error" data-testid="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ConnectPrompt({ action }: { action: string }) {
  const { setVisible } = useWalletDialog();
  const { connecting } = useWallet();
  return (
    <div className="panel grid justify-items-start gap-3" data-testid="connect-prompt">
      <p className="section-title">Connect a wallet to {action}</p>
      <p className="text-muted">BACKSTOP works with Phantom, Solflare, Backpack and other Solana wallets.</p>
      <button type="button" className="btn btn-primary" onClick={() => setVisible(true)}>
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    </div>
  );
}

/** Seconds remaining until `expiresAt`, from the shared clock. */
export function useRemaining(expiresAt: string | number | null | undefined): number {
  const now = useNow();
  // 0 only during server render; data (and so countdowns) render client-side.
  if (!now) return 0;
  return Math.max(0, toUnixSecs(expiresAt) - now);
}

/**
 * Countdown digits. Visible digits change every second; assistive tech gets
 * a role="timer" (polite-off by default) with a spoken label.
 */
export function Countdown({
  expiresAt,
  className = "",
  doneLabel = "Bidding closed",
}: {
  expiresAt: string | number;
  className?: string;
  doneLabel?: string;
}) {
  const remaining = useRemaining(expiresAt);
  const urgent = remaining > 0 && remaining <= 60;
  if (remaining <= 0) {
    return (
      <span
        className={`clock text-muted ${className}`}
        role="timer"
        aria-label={doneLabel}
        data-testid="countdown"
        data-remaining={0}
      >
        00:00
      </span>
    );
  }
  return (
    <span
      role="timer"
      aria-label={`Closes in ${spokenCountdown(remaining)}`}
      className={`clock ${urgent ? "text-red" : "text-brass"} ${className}`}
      data-testid="countdown"
      data-remaining={remaining}
    >
      <span aria-hidden="true">{formatCountdown(remaining)}</span>
    </span>
  );
}

export function Meter({
  value,
  label,
  tone = "ink",
  valueText,
}: {
  value: number;
  label: string;
  tone?: "ink" | "brass" | "green";
  valueText?: string;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div
      className="bar"
      data-tone={tone}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      aria-valuetext={valueText}
    >
      <span style={{ width: `${pct * 100}%` }} />
    </div>
  );
}
