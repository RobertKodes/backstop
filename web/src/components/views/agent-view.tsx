"use client";

import { useState } from "react";

import { type AgentPost, paths } from "@/lib/api";
import { explorerTx } from "@/lib/config";
import { formatDateTime, timeAgo } from "@/lib/format";
import { useRootMarket } from "@/lib/market";
import { useApi } from "@/lib/use-api";

import { EmptyState, ErrorNote, PageHeader, SkeletonRows, StaleNote } from "../ui";

const KIND_LABEL: Record<string, string> = {
  narration: "Market review",
  report: "Report",
  daily: "Daily report",
  proposal: "Proposal",
  action: "Action",
  alert: "Alert",
};

function label(kind: string) {
  return KIND_LABEL[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1).replace(/[_-]/g, " ");
}

/** camelCase / snake_case key → sentence case ("shieldDeposits" → "Shield deposits"). */
function humanKey(k: string) {
  const words = k
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "–";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Agent decision (agent/src/policy.ts `Decision`). */
interface Decision {
  kind: string;
  param: string;
  current?: string;
  value?: string;
  requested?: string;
  clamped?: boolean;
  reason?: string;
  rationale?: string;
}

/** On-chain action (agent/src/store.ts `Action`). */
interface AgentAction {
  param: string;
  value: string;
  status: string;
  signature?: string;
  error?: string;
}

const DECISION_LABEL: Record<string, { text: string; tone?: "brass" | "red" | "green" }> = {
  execute: { text: "Applied by the agent", tone: "green" },
  governance: { text: "Sent to governance", tone: "brass" },
  deferred: { text: "Deferred" },
  rejected: { text: "Rejected", tone: "red" },
};

const ACTION_LABEL: Record<string, { text: string; tone?: "brass" | "red" | "green" }> = {
  sent: { text: "Sent on-chain", tone: "green" },
  dry_run: { text: "Dry run (not sent)" },
  failed: { text: "Failed", tone: "red" },
  deferred: { text: "Deferred" },
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isDecision = (v: unknown): v is Decision => isObj(v) && typeof v.kind === "string" && typeof v.param === "string";
const isAction = (v: unknown): v is AgentAction =>
  isObj(v) && typeof v.param === "string" && typeof v.status === "string" && "value" in v;

function Generic({ it }: { it: unknown }) {
  return isObj(it) ? (
    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_minmax(0,1fr)]">
      {Object.entries(it).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{humanKey(k)}</dt>
          <dd className="break-words">{renderValue(v)}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <span className="break-words">{renderValue(it)}</span>
  );
}

function DecisionItem({ d }: { d: Decision }) {
  const l = DECISION_LABEL[d.kind] ?? { text: label(d.kind) };
  return (
    <div className="grid gap-1">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{humanKey(d.param)}</span>
        <span className="text-muted">
          {renderValue(d.current)} <span aria-hidden="true">→</span>
          <span className="sr-only"> to </span> {renderValue(d.value ?? d.requested)}
          {d.clamped ? " (limited by the step cap)" : ""}
        </span>
        <span className="badge" data-tone={l.tone}>
          {l.text}
        </span>
      </p>
      {d.reason ? <p className="text-muted">{d.reason}</p> : null}
      {d.rationale ? <p>{d.rationale}</p> : null}
    </div>
  );
}

function ActionItem({ a }: { a: AgentAction }) {
  const l = ACTION_LABEL[a.status] ?? { text: label(a.status) };
  return (
    <p className="flex flex-wrap items-center gap-2">
      <span className="font-semibold">{humanKey(a.param)}</span>
      <span className="text-muted">set to {renderValue(a.value)}</span>
      <span className="badge" data-tone={l.tone}>
        {l.text}
      </span>
      {a.signature && /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(a.signature) ? (
        <a className="link" href={explorerTx(a.signature)} target="_blank" rel="noreferrer">
          Transaction<span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : null}
      {a.error ? <span className="text-red">{a.error}</span> : null}
    </p>
  );
}

/** Decisions and actions use the agent's shapes; anything else is shown as labelled fields. */
function Items({ items, title }: { items: unknown[]; title: string }) {
  if (!items.length) return null;
  return (
    <div className="grid gap-2">
      <h3 className="font-semibold">{title}</h3>
      <ul className="grid gap-2">
        {items.map((it, i) => (
          <li key={i} className="rounded border border-line px-3 py-2 text-sm">
            {isAction(it) ? <ActionItem a={it} /> : isDecision(it) ? <DecisionItem d={it} /> : <Generic it={it} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Post({ p }: { p: AgentPost }) {
  const [open, setOpen] = useState(false);
  const proposals = Array.isArray(p.proposals) ? p.proposals : [];
  const actions = Array.isArray(p.actions) ? p.actions : [];
  const snapshot = p.snapshot && typeof p.snapshot === "object" ? Object.entries(p.snapshot) : [];
  return (
    <li
      className="grid gap-3 border-t border-line py-6 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8"
      data-testid="agent-post"
    >
      <div className="grid content-start gap-1">
        <span
          className="badge w-fit"
          data-tone={p.kind === "action" ? "brass" : p.kind === "alert" ? "red" : undefined}
        >
          {label(p.kind)}
        </span>
        <time dateTime={p.created_at} className="text-sm text-muted" title={formatDateTime(p.created_at)}>
          {timeAgo(p.created_at)}
        </time>
      </div>
      <div className="grid gap-4">
        <p className="prose-measure whitespace-pre-line text-[1.0625rem]">{p.body}</p>
        <Items items={proposals} title={`Decisions (${proposals.length})`} />
        <Items items={actions} title={`Actions taken (${actions.length})`} />
        {snapshot.length ? (
          <div>
            <button type="button" className="link text-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? "Hide" : "Show"} the market snapshot behind this post
            </button>
            {open ? (
              <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
                {snapshot.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{humanKey(k)}</dt>
                    <dd className="break-words">{renderValue(v)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function AgentView() {
  const { market } = useRootMarket();
  const posts = useApi<AgentPost[]>(paths.agentPosts(market?.mint), { refreshMs: 60_000 });
  return (
    <>
      <PageHeader
        title="Treasury agent"
        lede="An automated agent reviews the market every epoch, posts what it sees, and may adjust a few parameters within hard on-chain bounds. Every decision is listed here."
      />
      <div className="note mb-8 prose-measure text-sm">
        The agent can only change parameters inside limits set by governance, with a cooldown between changes. Its posts
        describe the market; they are not advice or forecasts.
      </div>
      {posts.loading ? (
        <SkeletonRows rows={4} label="Loading agent posts" />
      ) : !posts.data ? (
        <ErrorNote error={posts.error} onRetry={posts.refresh} what="agent posts" />
      ) : posts.data.length === 0 ? (
        <EmptyState title="No agent posts yet">Posts appear here after the agent&apos;s first review.</EmptyState>
      ) : (
        <>
          <StaleNote stale={posts.stale} />
          <ol className="border-b border-line" aria-label="Agent posts, newest first">
            {posts.data.map((p) => (
              <Post key={String(p.id)} p={p} />
            ))}
          </ol>
        </>
      )}
    </>
  );
}
