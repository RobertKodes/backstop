import { parseEvents } from "@backstop/sdk";
import type { Redis } from "ioredis";
import { apply, type Db, setCursor } from "./db.js";
import { eventToMutations } from "./handlers.js";
import { type Mutation, normalize } from "./mutations.js";

export interface TxInput {
  signature: string;
  slot: number;
  blockTime: number | null;
  logs: string[];
  failed: boolean;
}

export interface IngestResult {
  events: { program: string; name: string; data: Record<string, unknown> }[];
  mutations: Mutation[];
}

/** Pure: decode a transaction's events into mutations. Failed txs emit nothing. */
export function decodeTx(tx: TxInput): IngestResult {
  if (tx.failed) return { events: [], mutations: [] };
  const blockTime = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null;
  const events = parseEvents(tx.logs).map((e) => ({
    program: e.program,
    name: e.name,
    data: normalize(e.data) as Record<string, unknown>,
    index: e.index,
  }));
  const mutations = events.flatMap((e) =>
    eventToMutations(e.program, e.name, e.data as never, {
      signature: tx.signature,
      eventIndex: e.index,
      slot: tx.slot,
      blockTime,
    }),
  );
  return { events, mutations };
}

export const LIVE_CHANNEL = "backstop:live";

/**
 * Persist a transaction's events (idempotent) and fan them out on Redis for
 * the API's WebSocket clients.
 */
export async function ingestTx(db: Db, redis: Redis | null, tx: TxInput, cursorSource?: string): Promise<IngestResult> {
  const res = decodeTx(tx);
  if (res.mutations.length === 0 && !cursorSource) return res;
  await apply(db, res.mutations, async (c) => {
    if (cursorSource) await setCursor(c, cursorSource, tx.slot, tx.signature);
  });
  if (redis && res.events.length) {
    const payload = JSON.stringify({ signature: tx.signature, slot: tx.slot, blockTime: tx.blockTime, events: res.events });
    await redis.publish(LIVE_CHANNEL, payload);
  }
  return res;
}
