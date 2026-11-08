// Event sources: Helius raw webhooks (primary) and an RPC polling fallback
// that also implements replay-from-slot.

import { PROGRAM_IDS } from "@backstop/sdk";
import { type ConfirmedSignatureInfo, Connection, PublicKey } from "@solana/web3.js";
import Fastify from "fastify";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import { type Db, getCursor } from "./db.js";
import { ingestTx, type TxInput } from "./ingest.js";

export const WATCHED = [PROGRAM_IDS.hook, PROGRAM_IDS.core, PROGRAM_IDS.amm, PROGRAM_IDS.offers, PROGRAM_IDS.chest, PROGRAM_IDS.launchpad];

/** Helius "raw" webhook payload (subset). */
interface HeliusRawTx {
  slot: number;
  blockTime: number | null;
  meta: { err: unknown; logMessages: string[] | null } | null;
  transaction: { signatures: string[] };
}

export function heliusToInput(t: HeliusRawTx): TxInput {
  return {
    signature: t.transaction.signatures[0]!,
    slot: t.slot,
    blockTime: t.blockTime,
    logs: t.meta?.logMessages ?? [],
    failed: !!t.meta?.err,
  };
}

export function webhookServer(db: Db, redis: Redis | null, secret: string | undefined, log: Logger) {
  const app = Fastify({ logger: false, bodyLimit: 20 * 1024 * 1024 });
  app.get("/health", async () => ({ ok: true }));
  app.post("/helius", async (req, reply) => {
    if (secret && req.headers.authorization !== secret) return reply.code(401).send({ error: "unauthorized" });
    const body = (Array.isArray(req.body) ? req.body : [req.body]) as HeliusRawTx[];
    let events = 0;
    for (const t of body) events += (await ingestTx(db, redis, heliusToInput(t))).events.length;
    log.debug({ txs: body.length, events }, "webhook batch");
    return { ok: true, events };
  });
  return app;
}

async function fetchTx(conn: Connection, sig: string): Promise<TxInput | null> {
  const t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  if (!t) return null;
  return { signature: sig, slot: t.slot, blockTime: t.blockTime ?? null, logs: t.meta?.logMessages ?? [], failed: !!t.meta?.err };
}

/** Collect signatures for `program` newer than `until`, oldest first (paged). */
async function signaturesSince(conn: Connection, program: PublicKey, until: string | undefined, minSlot = 0): Promise<ConfirmedSignatureInfo[]> {
  const out: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await conn.getSignaturesForAddress(program, { before, until, limit: 1000 }, "confirmed");
    if (page.length === 0) break;
    out.push(...page.filter((p) => p.slot >= minSlot));
    if (page[page.length - 1]!.slot < minSlot || page.length < 1000) break;
    before = page[page.length - 1]!.signature;
  }
  return out.reverse();
}

/** One polling pass over every watched program. Returns events ingested. */
export async function pollOnce(conn: Connection, db: Db, redis: Redis | null, log: Logger): Promise<number> {
  let total = 0;
  for (const program of WATCHED) {
    const source = `poll:${program.toBase58()}`;
    const cur = await getCursor(db, source);
    const sigs = await signaturesSince(conn, program, cur?.signature ?? undefined);
    for (const s of sigs) {
      const tx = await fetchTx(conn, s.signature);
      if (tx) total += (await ingestTx(db, redis, tx, source)).events.length;
    }
    if (sigs.length) log.info({ program: program.toBase58(), txs: sigs.length }, "polled");
  }
  return total;
}

/** Re-ingest every transaction touching the programs from `fromSlot` on (idempotent). */
export async function replayFrom(conn: Connection, db: Db, fromSlot: number, log: Logger): Promise<number> {
  const seen = new Set<string>();
  const all: ConfirmedSignatureInfo[] = [];
  for (const program of WATCHED) {
    for (const s of await signaturesSince(conn, program, undefined, fromSlot)) {
      if (!seen.has(s.signature)) {
        seen.add(s.signature);
        all.push(s);
      }
    }
  }
  all.sort((a, b) => a.slot - b.slot);
  let events = 0;
  for (const s of all) {
    const tx = await fetchTx(conn, s.signature);
    if (tx) events += (await ingestTx(db, null, tx)).events.length;
  }
  log.info({ fromSlot, txs: all.length, events }, "replay complete");
  return events;
}
