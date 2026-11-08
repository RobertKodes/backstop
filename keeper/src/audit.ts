import pg from "pg";
import type { Logger } from "pino";
import type { Audit, AuditEntry } from "./tx.js";

/** Persists every keeper transaction to `keeper_runs` (indexer schema). */
export class PgAudit implements Audit {
  constructor(
    private readonly db: pg.Pool,
    private readonly log: Logger,
  ) {}
  async record(e: AuditEntry): Promise<void> {
    this.log[e.ok ? "info" : "warn"]({ job: e.job, sig: e.signature, ok: e.ok, err: e.error }, "keeper tx");
    await this.db.query(
      `insert into keeper_runs (job, started_at, finished_at, ok, signature, pre_state_hash, post_state_hash, detail, error)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        e.job,
        e.startedAt,
        e.finishedAt,
        e.ok,
        e.signature ?? null,
        e.preStateHash ?? null,
        e.postStateHash ?? null,
        e.detail ?? {},
        e.error ?? null,
      ],
    );
  }
}

/** Log-only audit (no database configured). Keeps the last 500 entries in memory for the dashboard. */
export class MemoryAudit implements Audit {
  readonly entries: AuditEntry[] = [];
  constructor(private readonly log?: Logger) {}
  async record(e: AuditEntry): Promise<void> {
    this.log?.[e.ok ? "info" : "warn"]({ job: e.job, sig: e.signature, ok: e.ok, err: e.error }, "keeper tx");
    this.entries.push(e);
    if (this.entries.length > 500) this.entries.shift();
  }
}
