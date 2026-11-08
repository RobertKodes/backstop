import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import type { Mutation, Row } from "./mutations.js";

export type Db = pg.Pool;

export function makeDb(url: string): Db {
  return new pg.Pool({ connectionString: url, max: 10 });
}

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad identifier ${s}`);
  return `"${s}"`;
};

const val = (v: Row[string]) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);

/** Translate one mutation into SQL + params. */
export function toSql(m: Mutation): { text: string; values: unknown[] } {
  if (m.kind === "insert" || m.kind === "upsert") {
    const cols = Object.keys(m.row);
    const values = cols.map((c) => val(m.row[c]!));
    const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
    const head = `insert into ${ident(m.table)} (${cols.map(ident).join(", ")}) values (${ph}) on conflict (${m.key.map(ident).join(", ")})`;
    if (m.kind === "insert") return { text: `${head} do nothing`, values };
    const sets = cols.filter((c) => !m.key.includes(c)).map((c) => `${ident(c)} = excluded.${ident(c)}`);
    return {
      text: `${head} do update set ${sets.join(", ")} where ${ident(m.table)}.updated_slot <= excluded.updated_slot`,
      values,
    };
  }
  const setCols = Object.keys(m.set);
  const whereCols = Object.keys(m.where);
  const values: unknown[] = [...setCols.map((c) => val(m.set[c]!)), m.slot, ...whereCols.map((c) => val(m.where[c]!))];
  const sets = [...setCols.map((c, i) => `${ident(c)} = $${i + 1}`), `updated_slot = $${setCols.length + 1}`];
  const where = whereCols.map((c, i) => `${ident(c)} = $${setCols.length + 2 + i}`);
  return {
    text: `update ${ident(m.table)} set ${sets.join(", ")} where ${where.join(" and ")} and updated_slot <= $${setCols.length + 1}`,
    values,
  };
}

/** Apply mutations atomically. */
export async function apply(db: Db, ms: Mutation[], extra?: (c: pg.PoolClient) => Promise<void>): Promise<void> {
  const client = await db.connect();
  try {
    await client.query("begin");
    for (const m of ms) {
      const q = toSql(m);
      await client.query(q.text, q.values);
    }
    if (extra) await extra(client);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

/** Run every pending SQL migration in `migrations/` (lexicographic order). */
export async function migrate(db: Db, dir?: string): Promise<string[]> {
  const here = dirname(fileURLToPath(import.meta.url));
  const folder = dir ?? join(here, "..", "migrations");
  await db.query("create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await db.query<{ version: string }>("select version from schema_migrations")).rows.map((r) => r.version));
  const applied: string[] = [];
  for (const f of readdirSync(folder).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(folder, f), "utf8");
    await apply(db, [], async (c) => {
      await c.query(sql);
      await c.query("insert into schema_migrations (version) values ($1)", [f]);
    });
    applied.push(f);
  }
  return applied;
}

export async function getCursor(db: Db, source: string): Promise<{ slot: number; signature: string | null } | null> {
  const r = await db.query<{ slot: string; signature: string | null }>("select slot, signature from cursors where source = $1", [source]);
  const row = r.rows[0];
  return row ? { slot: Number(row.slot), signature: row.signature } : null;
}

export async function setCursor(c: pg.PoolClient | Db, source: string, slot: number, signature: string): Promise<void> {
  await c.query(
    `insert into cursors (source, slot, signature, updated_at) values ($1, $2, $3, now())
     on conflict (source) do update set slot = excluded.slot, signature = excluded.signature, updated_at = now()
     where cursors.slot <= excluded.slot`,
    [source, slot, signature],
  );
}
