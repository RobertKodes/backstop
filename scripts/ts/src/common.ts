/* eslint-disable no-console -- CLI script: progress output is the interface */
// Shared helpers for genesis / seed scripts: cluster config, keys, sending.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Wallet } from "@anchor-lang/core";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  type PublicKey,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

export type Cluster = "localnet" | "devnet" | "mainnet-beta";

export function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : (process.env[name.toUpperCase().replace(/-/g, "_")] ?? fallback);
}

export function cluster(): Cluster {
  const c = arg("cluster", "localnet")!;
  if (c !== "localnet" && c !== "devnet" && c !== "mainnet-beta") throw new Error(`unknown cluster ${c}`);
  return c;
}

export function rpcUrl(c: Cluster): string {
  return (
    process.env.RPC_URL ??
    {
      localnet: "http://127.0.0.1:8899",
      devnet: "https://api.devnet.solana.com",
      "mainnet-beta": "https://api.mainnet-beta.solana.com",
    }[c]
  );
}

export function loadKeypair(spec: string): Keypair {
  const s = spec.startsWith("~") ? join(homedir(), spec.slice(1)) : spec;
  if (s.trim().startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s)));
  if (existsSync(s)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(s, "utf8"))));
  return Keypair.fromSecretKey(bs58.decode(s));
}

const here = dirname(fileURLToPath(import.meta.url));
export const outDir = join(here, "..", "out");

export function outFile(c: Cluster) {
  return join(outDir, `${c}.json`);
}

export function writeOut(c: Cluster, data: unknown) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile(c), JSON.stringify(data, null, 2));
}

export function readOut<T>(c: Cluster): T {
  return JSON.parse(readFileSync(outFile(c), "utf8")) as T;
}

/** Store generated (non-program) keypairs next to the output so reruns are idempotent. */
export function persistentKeypair(c: Cluster, name: string): Keypair {
  const dir = join(outDir, "keys", c);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, `${name}.json`);
  if (existsSync(p)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
  const k = Keypair.generate();
  writeFileSync(p, JSON.stringify(Array.from(k.secretKey)), { mode: 0o600 });
  return k;
}

export class KeypairWallet implements Wallet {
  constructor(readonly payer: Keypair) {}
  get publicKey() {
    return this.payer.publicKey;
  }
  async signTransaction<T>(tx: T): Promise<T> {
    if (tx instanceof VersionedTransaction) tx.sign([this.payer]);
    return tx;
  }
  async signAllTransactions<T>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map((t) => this.signTransaction(t)));
  }
}

export class Sender {
  constructor(
    readonly conn: Connection,
    readonly payer: Keypair,
    readonly log = (m: string) => console.log(m),
  ) {}

  async send(label: string, ixs: TransactionInstruction[], signers: Keypair[] = [], units = 400_000): Promise<string> {
    // add compute-budget instructions only if the caller did not (duplicates are rejected)
    const has = (d: number) =>
      ixs.some((ix) => ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === d);
    const all = [
      ...(has(2) ? [] : [ComputeBudgetProgram.setComputeUnitLimit({ units })]),
      ...(has(3) ? [] : [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 })]),
      ...ixs,
    ];
    for (let attempt = 1; ; attempt++) {
      try {
        const { blockhash, lastValidBlockHeight } = await this.conn.getLatestBlockhash("confirmed");
        const msg = new TransactionMessage({
          payerKey: this.payer.publicKey,
          recentBlockhash: blockhash,
          instructions: all,
        }).compileToV0Message();
        const tx = new VersionedTransaction(msg);
        const uniq = new Map<string, Keypair>([
          [this.payer.publicKey.toBase58(), this.payer],
          ...signers.map((s) => [s.publicKey.toBase58(), s] as [string, Keypair]),
        ]);
        tx.sign([...uniq.values()]);
        const sim = await this.conn.simulateTransaction(tx, { sigVerify: false });
        if (sim.value.err) {
          throw new Error(
            `simulation failed: ${JSON.stringify(sim.value.err)}\n${(sim.value.logs ?? []).slice(-12).join("\n")}`,
          );
        }
        const sig = await this.conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        const conf = await this.conn.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        if (conf.value.err) throw new Error(`failed: ${JSON.stringify(conf.value.err)}`);
        this.log(`  ✓ ${label} ${sig.slice(0, 16)}…`);
        return sig;
      } catch (e) {
        const msg = (e as Error).message;
        const transient = /blockhash|timeout|429|fetch failed|ECONNRESET|block height exceeded/i.test(msg);
        if (!transient || attempt >= 4) throw new Error(`${label}: ${msg}`);
        await sleep(1_000 * attempt);
      }
    }
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function airdropIfNeeded(conn: Connection, to: PublicKey, minLamports: number, c: Cluster) {
  const bal = await conn.getBalance(to, "confirmed");
  if (bal >= minLamports) return;
  if (c === "mainnet-beta") throw new Error(`${to.toBase58()} needs ${minLamports / 1e9} SOL`);
  const sig = await conn.requestAirdrop(to, Math.max(minLamports - bal, 1_000_000_000));
  await conn.confirmTransaction(sig, "confirmed");
}

export function connection(c: Cluster) {
  return new Connection(rpcUrl(c), "confirmed");
}
