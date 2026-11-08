// Transaction sending with simulation, priority fees, retries and audit
// logging (pre/post state hashes of every account the transaction writes).

import { createHash } from "node:crypto";
import {
  type AddressLookupTableAccount,
  ComputeBudgetProgram,
  type Connection,
  type Keypair,
  type PublicKey,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

export interface Audit {
  record(entry: AuditEntry): Promise<void>;
}

export interface AuditEntry {
  job: string;
  startedAt: Date;
  finishedAt: Date;
  ok: boolean;
  signature?: string;
  preStateHash?: string;
  postStateHash?: string;
  detail?: Record<string, unknown>;
  error?: string;
}

/** sha256 over (pubkey ‖ lamports ‖ owner ‖ data) of each account, in order. */
export async function stateHash(conn: Connection, keys: PublicKey[]): Promise<string> {
  const h = createHash("sha256");
  const infos = await conn.getMultipleAccountsInfo(keys, "confirmed");
  keys.forEach((k, i) => {
    const a = infos[i];
    h.update(k.toBuffer());
    if (a) {
      const l = Buffer.alloc(8);
      l.writeBigUInt64LE(BigInt(a.lamports));
      h.update(l);
      h.update(a.owner.toBuffer());
      h.update(a.data);
    } else {
      h.update(Buffer.from([0]));
    }
  });
  return h.digest("hex");
}

export function writableKeys(ixs: TransactionInstruction[]): PublicKey[] {
  const seen = new Map<string, PublicKey>();
  for (const ix of ixs) for (const k of ix.keys) if (k.isWritable) seen.set(k.pubkey.toBase58(), k.pubkey);
  return [...seen.values()];
}

export interface SendOpts {
  job: string;
  computeUnits?: number;
  priorityFee?: number;
  retries?: number;
  detail?: Record<string, unknown>;
  /** Address lookup tables (e.g. Jupiter routes). */
  lookupTables?: PublicKey[];
}

export class Sender {
  constructor(
    readonly conn: Connection,
    readonly payer: Keypair,
    readonly audit: Audit,
    readonly defaultPriorityFee = 10_000,
  ) {}

  async send(ixs: TransactionInstruction[], opts: SendOpts, signers: Keypair[] = []): Promise<string> {
    const startedAt = new Date();
    const keys = writableKeys(ixs);
    const pre = await stateHash(this.conn, keys).catch(() => undefined);
    const budget = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: opts.computeUnits ?? 600_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: opts.priorityFee ?? this.defaultPriorityFee }),
    ];
    const alts: AddressLookupTableAccount[] = [];
    for (const k of opts.lookupTables ?? []) {
      const t = (await this.conn.getAddressLookupTable(k)).value;
      if (t) alts.push(t);
    }
    let lastErr: unknown;
    for (let attempt = 0; attempt <= (opts.retries ?? 3); attempt++) {
      try {
        const { blockhash, lastValidBlockHeight } = await this.conn.getLatestBlockhash("confirmed");
        const msg = new TransactionMessage({ payerKey: this.payer.publicKey, recentBlockhash: blockhash, instructions: [...budget, ...ixs] }).compileToV0Message(alts);
        const tx = new VersionedTransaction(msg);
        tx.sign([this.payer, ...signers]);
        const sim = await this.conn.simulateTransaction(tx, { sigVerify: false });
        if (sim.value.err) throw new SimulationError(JSON.stringify(sim.value.err), sim.value.logs ?? []);
        const sig = await this.conn.sendTransaction(tx, { skipPreflight: true, maxRetries: 2 });
        const conf = await this.conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        if (conf.value.err) throw new Error(`tx failed: ${JSON.stringify(conf.value.err)}`);
        const post = await stateHash(this.conn, keys).catch(() => undefined);
        await this.audit.record({ job: opts.job, startedAt, finishedAt: new Date(), ok: true, signature: sig, preStateHash: pre, postStateHash: post, detail: opts.detail });
        return sig;
      } catch (e) {
        lastErr = e;
        if (e instanceof SimulationError && !e.retryable) break;
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
    await this.audit.record({
      job: opts.job,
      startedAt,
      finishedAt: new Date(),
      ok: false,
      preStateHash: pre,
      detail: opts.detail,
      error: lastErr instanceof Error ? `${lastErr.message}\n${lastErr instanceof SimulationError ? lastErr.logs.slice(-8).join("\n") : ""}` : String(lastErr),
    });
    throw lastErr;
  }
}

/** Simulation failures are deterministic program errors — retry only when stale. */
export class SimulationError extends Error {
  constructor(
    message: string,
    readonly logs: string[],
  ) {
    super(message);
  }
  get retryable(): boolean {
    return /BlockhashNotFound|AccountInUse|TooManyAccountLocks/.test(this.message);
  }
  /** Name of the Anchor error code in the logs, if any. */
  get code(): string | undefined {
    const l = this.logs.find((x) => x.includes("Error Code: "));
    return l?.split("Error Code: ")[1]?.split(".")[0];
  }
}
