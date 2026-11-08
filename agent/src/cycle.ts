// One agent cycle for one market:
// read chain → build snapshot → ask the model → policy gate → execute bounded
// updates → file governance proposals → store post + snapshot → post to X.

import type { PublicKey } from "@solana/web3.js";

import { type Advisor, AdvisorError, FEED_MAX_CHARS, PROMPT_VERSION } from "./advisor.js";
import type { Chain } from "./chain.js";
import { copyViolations, templateNarration } from "./copy.js";
import { boundsTable, type Decision, decide } from "./policy.js";
import { isThin, type MarketMeta, type SnapshotSource } from "./snapshot.js";
import type { Action, Store } from "./store.js";
import { fitPost, type Poster } from "./x.js";

export interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface CycleDeps {
  chain: Chain;
  source: SnapshotSource;
  advisor: Advisor;
  store: Store;
  poster: Poster;
  log: Logger;
  /** Called with proposals that need governance (e.g. a webhook). */
  notifyGovernance?: (mint: string, decisions: Decision[]) => Promise<void>;
  cfg: {
    model: string;
    agent: string;
    dryRun: boolean;
    maxActions: number;
    maxStepBps: number;
    xSuffix?: string;
  };
  now?: () => Date;
}

export interface CycleResult {
  runId: number;
  ok: boolean;
  postId?: number;
  decisions: Decision[];
  actions: Action[];
  xPostId?: string;
  errorCode?: string;
}

export async function runCycle(deps: CycleDeps, market: MarketMeta & { mintKey: PublicKey }): Promise<CycleResult> {
  const { chain, source, advisor, store, poster, log, cfg } = deps;
  const now = deps.now?.() ?? new Date();
  const startedAt = new Date();
  const runId = await store.startRun(market.mint, startedAt);
  const base = {
    mint: market.mint,
    startedAt,
    dryRun: cfg.dryRun,
    requestedModel: cfg.model,
    promptVersion: PROMPT_VERSION,
  };
  const fail = async (errorCode: string, error: string, extra: object = {}): Promise<CycleResult> => {
    log.error({ mint: market.mint, runId, errorCode, error, ...extra }, "agent cycle failed");
    await store.finishRun(runId, { ...base, ...extra, finishedAt: new Date(), ok: false, errorCode, error });
    return { runId, ok: false, decisions: [], actions: [], errorCode };
  };

  // 1. chain state
  let state;
  try {
    state = await chain.read(market.mintKey);
  } catch (e) {
    return fail("chain", `reading market: ${(e as Error).message}`);
  }
  let authority = state.authority;
  if (authority && authority.agent !== cfg.agent) {
    log.warn(
      { mint: market.mint, onChain: authority.agent, ours: cfg.agent },
      "agent key is not the on-chain agent; nothing will execute",
    );
    authority = { ...authority, bounds: authority.bounds.map((b) => ({ ...b, enabled: false })) };
  }
  const auth = authority ?? { agent: "", cooldownSecs: 3_600, bounds: [] };
  const nowSecs = Math.floor(now.getTime() / 1000);

  // 2. snapshot (the exact data the model sees is what gets stored)
  const snapshot = await source.build(market, now);
  const recentPosts = await store.recentPosts(market.mint, 3);

  // 3. model
  let advice;
  try {
    advice = await advisor.advise({
      snapshot,
      paramTable: boundsTable(state.params, auth, nowSecs),
      recentPosts,
      maxActions: cfg.maxActions,
      maxStepBps: cfg.maxStepBps,
    });
  } catch (e) {
    if (e instanceof AdvisorError)
      return fail(e.code, e.message, e.detail ? { servedModel: String(e.detail.model ?? "") || undefined } : {});
    return fail("api", (e as Error).message);
  }
  const { output } = advice;

  // 4. policy gate
  let decisions = decide(output.proposals, state.params, auth, {
    now: nowSecs,
    maxActions: cfg.maxActions,
    maxStepBps: cfg.maxStepBps,
  });
  if (isThin(snapshot)) {
    decisions = decisions.map((d) =>
      d.kind === "execute" || d.kind === "governance"
        ? { ...d, kind: "rejected", reason: "insufficient activity in the window" }
        : d,
    );
  }

  // 5. execute bounded updates
  const actions: Action[] = [];
  for (const d of decisions) {
    if (d.kind === "deferred") actions.push({ param: d.param, value: d.value, status: "deferred", error: d.reason });
    if (d.kind !== "execute") continue;
    if (cfg.dryRun) {
      actions.push({ param: d.param, value: d.value, status: "dry_run" });
      continue;
    }
    try {
      const signature = await chain.setParam(market.mintKey, d.paramIndex, BigInt(d.value));
      actions.push({ param: d.param, value: d.value, status: "sent", signature });
      log.info(
        { mint: market.mint, param: d.param, from: d.current, to: d.value, signature },
        "agent parameter update sent",
      );
    } catch (e) {
      actions.push({ param: d.param, value: d.value, status: "failed", error: (e as Error).message });
      log.error({ mint: market.mint, param: d.param, err: (e as Error).message }, "agent parameter update failed");
    }
  }

  // 6. narration (copy-checked; deterministic fallback if it violates the guidelines)
  let post = output.post.trim();
  let feed = output.feed.trim().slice(0, FEED_MAX_CHARS);
  const violations = copyViolations(`${post}\n${feed}`);
  const usedFallbackCopy = violations.length > 0 || post.length === 0;
  if (usedFallbackCopy) {
    log.warn({ mint: market.mint, violations }, "model narration violates copy guidelines; using template");
    ({ post, feed } = templateNarration(snapshot, decisions));
  }
  const outcome = outcomeLines(decisions, actions);
  if (outcome) feed = `${feed}\n\n${outcome}`;

  // 7. store post + snapshot + governance proposals
  const gov = decisions.filter((d) => d.kind === "governance");
  let postId: number;
  try {
    postId = await store.insertPost(runId, {
      mint: market.mint,
      kind: "narration",
      body: post,
      feed,
      model: advice.model,
      snapshot,
      assessment: output.assessment,
      usedFallbackCopy,
      proposals: decisions,
      actions,
    });
    if (gov.length) await store.insertProposals(market.mint, runId, postId, gov);
  } catch (e) {
    return fail("store", (e as Error).message);
  }
  if (gov.length && deps.notifyGovernance) {
    await deps
      .notifyGovernance(market.mint, gov)
      .catch((e: Error) => log.warn({ err: e.message }, "governance notification failed"));
  }

  // 8. X (feature-flagged)
  let xPostId: string | undefined;
  if (poster.enabled) {
    try {
      const r = await poster.post(fitPost(post, cfg.xSuffix));
      if (r) {
        xPostId = r.id;
        await store.markPosted(postId, r.id);
      }
    } catch (e) {
      log.warn({ mint: market.mint, err: (e as Error).message }, "X post failed; kept in-app only");
    }
  }

  await store.finishRun(
    runId,
    {
      ...base,
      finishedAt: new Date(),
      ok: true,
      servedModel: advice.model,
      requestId: advice.requestId,
      usage: advice.usage,
    },
    postId,
  );
  log.info(
    {
      mint: market.mint,
      runId,
      postId,
      executed: actions.filter((a) => a.status === "sent").length,
      governance: gov.length,
      servedModel: advice.model,
    },
    "agent cycle complete",
  );
  return { runId, ok: true, postId, decisions, actions, xPostId };
}

/** Deterministic, factual summary of what actually happened on-chain. */
export function outcomeLines(decisions: Decision[], actions: Action[]): string {
  const lines: string[] = [];
  for (const a of actions) {
    const d = decisions.find((x) => x.param === a.param);
    const from = d?.current ?? "?";
    if (a.status === "sent")
      lines.push(`Applied on-chain: ${a.param} ${from} → ${a.value}${d?.clamped ? " (step-limited)" : ""}.`);
    if (a.status === "dry_run") lines.push(`Dry run (not sent): ${a.param} ${from} → ${a.value}.`);
    if (a.status === "failed") lines.push(`Not applied: ${a.param} (transaction failed).`);
    if (a.status === "deferred") lines.push(`Deferred: ${a.param} (${a.error ?? "cooldown"}).`);
  }
  for (const d of decisions.filter((x) => x.kind === "governance"))
    lines.push(`Filed for governance review: ${d.param} → ${d.requested} (${d.reason}).`);
  return lines.join("\n");
}
