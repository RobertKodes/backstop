// Persistence: every post is stored with the exact snapshot it was based on,
// the model's proposals and the actions taken; governance proposals go to
// their own table; every cycle gets a run record.

import type pg from "pg";

import type { Decision } from "./policy.js";

export interface RunRecord {
  mint: string;
  startedAt: Date;
  finishedAt: Date;
  ok: boolean;
  dryRun: boolean;
  requestedModel: string;
  servedModel?: string;
  requestId?: string | null;
  promptVersion: string;
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  errorCode?: string;
  error?: string;
}

export interface PostRecord {
  mint: string;
  kind: "narration";
  body: string;
  feed: string;
  model: string;
  snapshot: unknown;
  assessment: string;
  usedFallbackCopy: boolean;
  proposals: unknown[];
  actions: Action[];
}

export interface Action {
  param: string;
  value: string;
  status: "sent" | "dry_run" | "failed" | "deferred";
  signature?: string;
  error?: string;
}

export interface Store {
  recentPosts(mint: string, limit: number): Promise<string[]>;
  startRun(mint: string, startedAt: Date): Promise<number>;
  finishRun(id: number, r: RunRecord, postId?: number): Promise<void>;
  insertPost(runId: number, p: PostRecord): Promise<number>;
  markPosted(postId: number, xPostId: string): Promise<void>;
  insertProposals(mint: string, runId: number, postId: number, d: Decision[]): Promise<void>;
}

export class PgStore implements Store {
  constructor(private readonly db: pg.Pool) {}

  async recentPosts(mint: string, limit: number): Promise<string[]> {
    const r = await this.db.query<{ body: string }>("select body from agent_posts where mint = $1 order by created_at desc limit $2", [mint, limit]);
    return r.rows.map((x) => x.body);
  }

  async startRun(mint: string, startedAt: Date): Promise<number> {
    const r = await this.db.query<{ id: string }>("insert into agent_runs (mint, started_at) values ($1, $2) returning id", [mint, startedAt]);
    return Number(r.rows[0]!.id);
  }

  async finishRun(id: number, r: RunRecord, postId?: number): Promise<void> {
    await this.db.query(
      `update agent_runs set finished_at=$2, ok=$3, dry_run=$4, requested_model=$5, served_model=$6, request_id=$7,
         prompt_version=$8, input_tokens=$9, output_tokens=$10, cache_read_tokens=$11, error_code=$12, error=$13, post_id=$14
       where id=$1`,
      [
        id,
        r.finishedAt,
        r.ok,
        r.dryRun,
        r.requestedModel,
        r.servedModel ?? null,
        r.requestId ?? null,
        r.promptVersion,
        r.usage?.inputTokens ?? null,
        r.usage?.outputTokens ?? null,
        r.usage?.cacheReadTokens ?? null,
        r.errorCode ?? null,
        r.error ?? null,
        postId ?? null,
      ],
    );
  }

  async insertPost(runId: number, p: PostRecord): Promise<number> {
    const snapshot = { data: p.snapshot, feed: p.feed, assessment: p.assessment, usedFallbackCopy: p.usedFallbackCopy };
    const r = await this.db.query<{ id: string }>(
      `insert into agent_posts (mint, kind, body, snapshot, proposals, actions, run_id, model)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [p.mint, p.kind, p.body, JSON.stringify(snapshot), JSON.stringify(p.proposals), JSON.stringify(p.actions), runId, p.model],
    );
    return Number(r.rows[0]!.id);
  }

  async markPosted(postId: number, xPostId: string): Promise<void> {
    await this.db.query("update agent_posts set posted_to_x = true, x_post_id = $2 where id = $1", [postId, xPostId]);
  }

  async insertProposals(mint: string, runId: number, postId: number, ds: Decision[]): Promise<void> {
    for (const d of ds) {
      // a newer proposal for the same parameter supersedes older open ones
      await this.db.query("update agent_proposals set status='superseded', resolved_at=now() where mint=$1 and param=$2 and status='open'", [mint, d.param]);
      await this.db.query(
        `insert into agent_proposals (mint, run_id, post_id, param, current_value, proposed_value, bound_min, bound_max, tunable, reason, rationale)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [mint, runId, postId, d.param, d.current || null, d.requested, d.bound?.min ?? null, d.bound?.max ?? null, d.bound?.enabled ?? false, d.reason, d.rationale],
      );
    }
  }
}

/** In-memory store for tests and dry local runs without Postgres. */
export class MemoryStore implements Store {
  runs: (RunRecord & { id: number; postId?: number })[] = [];
  posts: (PostRecord & { id: number; runId: number; xPostId?: string })[] = [];
  proposals: (Decision & { mint: string; runId: number; postId: number })[] = [];

  async recentPosts(mint: string, limit: number) {
    return this.posts
      .filter((p) => p.mint === mint)
      .reverse()
      .slice(0, limit)
      .map((p) => p.body);
  }
  async startRun(mint: string, startedAt: Date) {
    const id = this.runs.length + 1;
    this.runs.push({ id, mint, startedAt, finishedAt: startedAt, ok: false, dryRun: true, requestedModel: "", promptVersion: "" });
    return id;
  }
  async finishRun(id: number, r: RunRecord, postId?: number) {
    this.runs[id - 1] = { ...r, id, postId };
  }
  async insertPost(runId: number, p: PostRecord) {
    const id = this.posts.length + 1;
    this.posts.push({ ...p, id, runId });
    return id;
  }
  async markPosted(postId: number, xPostId: string) {
    const p = this.posts[postId - 1];
    if (p) p.xPostId = xPostId;
  }
  async insertProposals(mint: string, runId: number, postId: number, ds: Decision[]) {
    for (const d of ds) this.proposals.push({ ...d, mint, runId, postId });
  }
}
