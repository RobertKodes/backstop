// Synthetic but genuine program output: events are Borsh-encoded with the
// programs' own IDLs and wrapped in the exact log lines the runtime emits, so
// the load test exercises the indexer's real decode → mutate → write path.

import { createHash } from "node:crypto";
import { BorshCoder } from "@anchor-lang/core";
import { IDLS, PROGRAM_IDS } from "@backstop/sdk";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

type ProgramKey = keyof typeof IDLS;
type Idl = { address: string; events: { name: string; discriminator: number[] }[] };

const coders = Object.fromEntries(
  (Object.keys(IDLS) as ProgramKey[]).map((k) => [k, new BorshCoder(IDLS[k] as never)]),
) as Record<ProgramKey, BorshCoder>;

export interface Ev {
  program: ProgramKey;
  name: string;
  data: Record<string, unknown>;
}

/** `Program data:` line for one event. */
export function dataLine(e: Ev): string {
  const idl = IDLS[e.program] as unknown as Idl;
  const meta = idl.events.find((x) => x.name === e.name);
  if (!meta) throw new Error(`unknown event ${e.program}.${e.name}`);
  const body = coders[e.program].types.encode(e.name, e.data);
  return `Program data: ${Buffer.concat([Buffer.from(meta.discriminator), body]).toString("base64")}`;
}

/** Logs of one transaction whose top-level instruction belongs to `program`. */
export function txLogs(events: Ev[]): string[] {
  const out: string[] = [];
  for (const e of events) {
    const id = PROGRAM_IDS[e.program === "hook" ? "hook" : e.program].toBase58();
    out.push(`Program ${id} invoke [1]`, `Program log: Instruction: Synthetic`, dataLine(e), `Program ${id} success`);
  }
  return out;
}

let sigCounter = 0;
export function signature(): string {
  sigCounter += 1;
  return createHash("sha256").update(`load-${sigCounter}-${process.pid}`).digest("base64url").slice(0, 64);
}

export const bn = (v: bigint | number) => new BN(v.toString());
export const key = () => Keypair.generate().publicKey;
export const PRICE_SCALE = 10n ** 18n;

/** Deterministic pseudo-random (xorshift) so runs are comparable. */
export class Rng {
  constructor(private s = 0x2545f491) {}
  next(): number {
    this.s ^= this.s << 13;
    this.s ^= this.s >>> 17;
    this.s ^= this.s << 5;
    return (this.s >>> 0) / 0x1_0000_0000;
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  pick<T>(xs: T[]): T {
    return xs[Math.floor(this.next() * xs.length)]!;
  }
}

export function offerAddress(mint: PublicKey, id: bigint): PublicKey {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(id);
  return PublicKey.findProgramAddressSync([Buffer.from("offer"), mint.toBuffer(), b], PROGRAM_IDS.offers)[0];
}
