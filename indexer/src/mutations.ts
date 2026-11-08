// Declarative DB mutations produced by event handlers (pure, unit-testable).

export type Value = string | number | boolean | null | Record<string, unknown> | unknown[];
export type Row = Record<string, Value>;

export type Mutation =
  /** INSERT … ON CONFLICT (key) DO NOTHING — event-derived rows. */
  | { kind: "insert"; table: string; key: string[]; row: Row }
  /** INSERT … ON CONFLICT (key) DO UPDATE … WHERE updated_slot ≤ new slot. */
  | { kind: "upsert"; table: string; key: string[]; row: Row; slot: number }
  /** UPDATE table SET … WHERE key AND updated_slot ≤ slot (never creates rows). */
  | { kind: "patch"; table: string; where: Row; set: Row; slot: number };

export interface EventContext {
  signature: string;
  eventIndex: number;
  slot: number;
  /** ISO timestamp of the block (falls back to the event's own `ts`). */
  blockTime: string | null;
}

/** snake_case → camelCase */
export const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/**
 * Normalise Anchor-decoded event data into JSON-safe values with camelCase
 * keys: PublicKey → base58, BN/bigint → decimal string, byte arrays → hex.
 */
export function normalize(v: unknown): Value {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as { toBase58?: () => string; toString?: (r?: number) => string; constructor?: { name?: string } };
    if (typeof o.toBase58 === "function") return o.toBase58();
    if (o.constructor?.name === "BN" && typeof o.toString === "function") return o.toString(10);
    if (v instanceof Uint8Array) return Buffer.from(v).toString("hex");
    if (Array.isArray(v)) {
      if (v.length > 0 && v.every((x) => typeof x === "number" && x >= 0 && x < 256)) return Buffer.from(v).toString("hex");
      return v.map(normalize);
    }
    const out: Record<string, Value> = {};
    for (const [k, val] of Object.entries(v)) out[camel(k)] = normalize(val);
    return out;
  }
  return String(v);
}

export const tsFromUnix = (secs: Value | undefined): string | null =>
  secs === null || secs === undefined ? null : new Date(Number(secs) * 1000).toISOString();
