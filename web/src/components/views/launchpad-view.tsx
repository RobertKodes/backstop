"use client";

import "@/lib/polyfills";

import { CHILD_MAX_CREATOR_BPS, CHILD_MIN_LIQUIDITY_LAMPORTS, type LaunchStep, LaunchpadClient } from "@backstop/sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useState } from "react";

import { type ChildRow, paths } from "@/lib/api";
import { explorerTx } from "@/lib/config";
import {
  SOL_DECIMALS,
  TOKEN_DECIMALS,
  byteLength,
  formatBps,
  formatCompact,
  formatUnits,
  parseUnits,
} from "@/lib/format";
import { isValidAddress, useRootMarket } from "@/lib/market";
import { explainTxError, useSendTx } from "@/lib/tx";
import { type FieldKey, type LaunchForm, checkLaunchForm } from "@/lib/launch";
import { useApi } from "@/lib/use-api";

import { RiskPanel } from "../risk-panel";
import { EmptyState, ErrorNote, Field, PageHeader, SectionTitle, SkeletonRows, StaleNote } from "../ui";

const STEPS: { title: string; fields: FieldKey[] }[] = [
  { title: "Token details", fields: ["name", "symbol", "uri"] },
  { title: "Supply and creator allocation", fields: ["supply", "creatorPct"] },
  { title: "Initial liquidity", fields: ["liquiditySol"] },
  { title: "Review and launch", fields: [] },
];

type StepState = { label: string; status: "waiting" | "sending" | "done" | "failed"; signature?: string };

const PENDING_KEY = "backstop-pending-launch";

/** An unfinished launch (mint + creator) so it can be resumed after a failed step or a reload. */
function savePendingLaunch(mint: string, creator: string) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ mint, creator }));
  } catch {
    /* storage unavailable: resume still works within this visit */
  }
}

function readPendingLaunch(): { mint: string; creator: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") as { mint?: string; creator?: string } | null;
    return v?.mint && v.creator ? { mint: v.mint, creator: v.creator } : null;
  } catch {
    return null;
  }
}

function clearPendingLaunch() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function LaunchpadView() {
  return (
    <>
      <PageHeader
        title="Launchpad"
        lede="Launch a child token that runs the same offer mechanic, paired with SOL. Liquidity is locked forever and every child shows its risk facts."
      />
      <div className="grid gap-14">
        <Wizard />
        <ChildList />
      </div>
    </>
  );
}

function Wizard() {
  const { market } = useRootMarket();
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { sendRaw, connected, openWalletModal } = useSendTx();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<LaunchForm>({
    name: "",
    symbol: "",
    uri: "",
    supply: "1000000000",
    creatorPct: "0",
    liquiditySol: "5",
  });
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<StepState[] | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [launched, setLaunched] = useState<string | null>(null);

  const { params, errors } = checkLaunchForm(form);
  const stepErrors = (i: number) => STEPS[i]!.fields.filter((k) => errors[k]);
  const err = (k: FieldKey) => {
    const owner = STEPS.findIndex((s) => s.fields.includes(k));
    return shown.has(owner) ? errors[k] : undefined;
  };
  const set = (k: FieldKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const next = () => {
    setShown((s) => new Set(s).add(step));
    if (stepErrors(step).length === 0) setStep((x) => Math.min(STEPS.length - 1, x + 1));
  };

  /** Send each step as its own transaction, stopping at the first failure. */
  const runSteps = async (steps: LaunchStep[], mint: string) => {
    const state: StepState[] = steps.map((s) => ({ label: s.label, status: "waiting" }));
    setProgress([...state]);
    for (let i = 0; i < steps.length; i++) {
      state[i] = { ...state[i]!, status: "sending" };
      setProgress([...state]);
      try {
        const sig = await sendRaw(steps[i]!.ixs, steps[i]!.signers, (s) => {
          state[i] = { ...state[i]!, signature: s };
          setProgress([...state]);
        });
        state[i] = { ...state[i]!, status: "done", signature: sig };
        setProgress([...state]);
      } catch (e) {
        state[i] = { ...state[i]!, status: "failed" };
        setProgress([...state]);
        setLaunchError(
          `Step ${i + 1} (${steps[i]!.label}) did not complete: ${explainTxError(e)} Completed steps stay on-chain; choose Resume launch to continue from this step.`,
        );
        return;
      }
    }
    clearPendingLaunch();
    setLaunched(mint);
  };

  const launch = async () => {
    setShown(new Set([0, 1, 2]));
    setLaunchError(null);
    setLaunched(null);
    if (!params) return;
    if (!connected || !publicKey) return openWalletModal();
    if (!market || !isValidAddress(market.mint)) {
      setLaunchError("The parent market is not configured, so a child cannot be launched from this deployment.");
      return;
    }
    setRunning(true);
    const mintKp = Keypair.generate();
    let steps: LaunchStep[];
    try {
      steps = await new LaunchpadClient(connection, new PublicKey(market.mint)).launchSteps(publicKey, mintKp, params);
    } catch (e) {
      setRunning(false);
      setLaunchError(
        `Launching is unavailable: ${(e as Error).message}. Nothing was sent and your wallet was not charged.`,
      );
      return;
    }
    savePendingLaunch(mintKp.publicKey.toBase58(), publicKey.toBase58());
    await runSteps(steps, mintKp.publicKey.toBase58());
    setRunning(false);
  };

  const resume = async () => {
    setLaunchError(null);
    if (!connected || !publicKey) return openWalletModal();
    const saved = readPendingLaunch();
    if (!saved || saved.creator !== publicKey.toBase58() || !market) {
      setLaunchError("There is no unfinished launch for this wallet in this browser.");
      return;
    }
    setRunning(true);
    try {
      const steps = await new LaunchpadClient(connection, new PublicKey(market.mint)).resumeSteps(
        publicKey,
        new PublicKey(saved.mint),
      );
      if (steps.length === 0) {
        clearPendingLaunch();
        setLaunched(saved.mint);
      } else await runSteps(steps, saved.mint);
    } catch (e) {
      setLaunchError(`Could not resume the launch: ${explainTxError(e)}`);
    }
    setRunning(false);
  };

  const supply = parseUnits(form.supply, TOKEN_DECIMALS) ?? 0n;
  const creatorBps = Math.round(Number(form.creatorPct) * 100) || 0;

  return (
    <section
      aria-labelledby="wizard"
      className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12"
      data-testid="launch-wizard"
    >
      <div className="grid content-start gap-4">
        <h2 id="wizard" className="section-title">
          Create a child token
        </h2>
        <ol className="grid gap-1" aria-label="Launch steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <button
                type="button"
                className={`flex w-full items-center gap-3 rounded px-2 py-2 text-left ${i === step ? "bg-surface-2 font-semibold" : "text-muted"}`}
                aria-current={i === step ? "step" : undefined}
                onClick={() => i <= step && setStep(i)}
                disabled={i > step}
              >
                <span
                  className={`figure grid h-7 w-7 place-items-center rounded-full border text-sm ${i < step ? "border-green text-green" : i === step ? "border-brass text-brass" : "border-line-strong"}`}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <span>
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <form
        className="panel grid content-start gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step < STEPS.length - 1) next();
          else void launch();
        }}
      >
        <h3 className="section-title">
          Step {step + 1} of {STEPS.length}: {STEPS[step]!.title}
        </h3>

        {step === 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name" error={err("name")} hint={`${byteLength(form.name)}/32 bytes`}>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  className="input"
                  value={form.name}
                  onChange={set("name")}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  data-testid="launch-name"
                />
              )}
            </Field>
            <Field label="Symbol" error={err("symbol")} hint={`${byteLength(form.symbol)}/10 bytes`}>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  className="input"
                  value={form.symbol}
                  onChange={set("symbol")}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  data-testid="launch-symbol"
                />
              )}
            </Field>
            <div className="md:col-span-2">
              <Field
                label="Metadata URI"
                error={err("uri")}
                hint="Link to the token metadata JSON (name, symbol, image). Up to 200 bytes."
              >
                {({ id, describedBy, invalid }) => (
                  <input
                    id={id}
                    className="input"
                    inputMode="url"
                    placeholder="https://…/metadata.json"
                    value={form.uri}
                    onChange={set("uri")}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    data-testid="launch-uri"
                  />
                )}
              </Field>
            </div>
          </div>
        ) : step === 1 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Total supply (tokens)" error={err("supply")} hint="Fixed forever; 9 decimals.">
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  className="input"
                  inputMode="numeric"
                  value={form.supply}
                  onChange={set("supply")}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  data-testid="launch-supply"
                />
              )}
            </Field>
            <Field
              label="Creator allocation (%)"
              error={err("creatorPct")}
              hint={`0% to ${formatBps(CHILD_MAX_CREATOR_BPS, 0)} of supply, vested linearly over 90 days.`}
            >
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  className="input"
                  inputMode="decimal"
                  value={form.creatorPct}
                  onChange={set("creatorPct")}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  data-testid="launch-creator"
                />
              )}
            </Field>
          </div>
        ) : step === 2 ? (
          <div className="grid gap-4">
            <Field
              label="Initial liquidity (SOL)"
              error={err("liquiditySol")}
              hint={`At least ${formatUnits(CHILD_MIN_LIQUIDITY_LAMPORTS, SOL_DECIMALS, 0)} SOL.`}
            >
              {({ id, describedBy, invalid }) => (
                <div className="input-affix max-w-xs">
                  <input
                    id={id}
                    className="input"
                    inputMode="decimal"
                    value={form.liquiditySol}
                    onChange={set("liquiditySol")}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    data-testid="launch-liquidity"
                  />
                  <span className="affix">SOL</span>
                </div>
              )}
            </Field>
            <div className="terms">
              <p>
                <strong>Liquidity is locked forever.</strong> The SOL you add seeds the child&apos;s AMM pool and can
                never be withdrawn, by you or anyone else.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-5">
            <dl className="grid gap-2 text-sm sm:grid-cols-2" data-testid="launch-review">
              {[
                ["Name", form.name || "–"],
                ["Symbol", form.symbol || "–"],
                ["Metadata URI", form.uri || "–"],
                ["Supply", `${formatCompact(supply, TOKEN_DECIMALS)} tokens`],
                [
                  "Creator allocation",
                  `${formatBps(creatorBps)} (${formatCompact((supply * BigInt(creatorBps)) / 10_000n, TOKEN_DECIMALS)} tokens, vested over 90 days)`,
                ],
                ["Initial liquidity", `${form.liquiditySol} SOL, locked forever`],
              ].map(([k, v]) => (
                <div key={k} className="grid gap-0.5">
                  <dt className="text-muted">{k}</dt>
                  <dd className="break-all font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {Object.keys(errors).length ? (
              <p className="field-error" role="alert">
                Some details need fixing: {Object.values(errors).join(" ")}
              </p>
            ) : null}
            <p className="text-sm text-muted">
              Launching takes several transactions, each approved in your wallet. Progress is shown below; if one step
              fails, the earlier ones stay on-chain.
            </p>
          </div>
        )}

        {launchError ? (
          <div className="terms" role="alert" data-testid="launch-error">
            <p>{launchError}</p>
          </div>
        ) : null}

        {progress ? (
          <ol className="grid gap-2" aria-label="Launch progress" data-testid="launch-progress">
            {progress.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 text-sm">
                <span
                  className="badge"
                  data-tone={
                    p.status === "done"
                      ? "green"
                      : p.status === "failed"
                        ? "red"
                        : p.status === "sending"
                          ? "brass"
                          : undefined
                  }
                >
                  {p.status === "done"
                    ? "Confirmed"
                    : p.status === "failed"
                      ? "Failed"
                      : p.status === "sending"
                        ? "Sending"
                        : "Waiting"}
                </span>
                <span>
                  {i + 1}. {p.label}
                </span>
                {p.signature ? (
                  <a className="link" href={explorerTx(p.signature)} target="_blank" rel="noreferrer">
                    Transaction<span className="sr-only"> for step {i + 1} (opens in a new tab)</span>
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}

        {launched ? (
          <div className="note" role="status" data-testid="launch-done">
            <p>
              <strong>Launch complete.</strong> Trading opens once the indexer picks up the new market.{" "}
              <Link className="link" href={`/launchpad/${launched}`}>
                Open the dashboard
              </Link>
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {step > 0 ? (
            <button type="button" className="btn" onClick={() => setStep((x) => x - 1)} disabled={running}>
              Back
            </button>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={running} data-testid="launch-next">
            {step < STEPS.length - 1
              ? "Continue"
              : !connected
                ? "Connect wallet to launch"
                : running
                  ? "Launching…"
                  : "Launch token"}
          </button>
          {step === STEPS.length - 1 && connected ? (
            <button
              type="button"
              className="btn"
              onClick={() => void resume()}
              disabled={running}
              data-testid="launch-resume"
            >
              Resume launch
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function ChildList() {
  const children = useApi<ChildRow[]>(paths.children(), { refreshMs: 60_000 });
  return (
    <section aria-labelledby="children">
      <SectionTitle id="children" aside={children.data ? `${children.data.length} launched` : undefined}>
        Launched children
      </SectionTitle>
      {children.loading ? (
        <SkeletonRows rows={3} label="Loading child tokens" />
      ) : !children.data ? (
        <ErrorNote error={children.error} onRetry={children.refresh} what="child tokens" />
      ) : children.data.length === 0 ? (
        <EmptyState title="No child tokens yet">The first launch will appear here with its risk facts.</EmptyState>
      ) : (
        <>
          <StaleNote stale={children.stale} />
          <ul className="grid gap-5 md:grid-cols-2" data-testid="children-list">
            {children.data.map((c) => (
              <li key={c.mint} className="panel grid content-start gap-4" data-testid="child-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="section-title">
                    <Link href={`/launchpad/${c.mint}`} className="hover:underline">
                      {c.name} <span className="text-muted">({c.symbol})</span>
                    </Link>
                  </h3>
                  <span className="badge" data-tone={c.status === "live" ? "green" : "brass"}>
                    {c.status === "live" ? "Live" : "Launching"}
                  </span>
                </div>
                <RiskPanel child={c} />
                <Link href={`/launchpad/${c.mint}`} className="link w-fit">
                  Open {c.symbol} dashboard
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
