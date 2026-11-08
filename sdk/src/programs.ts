import { AnchorProvider, BorshCoder, EventParser, Program, type Wallet } from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

import ammIdl from "./idl/backstop_amm.json" with { type: "json" };
import chestIdl from "./idl/backstop_chest.json" with { type: "json" };
import coreIdl from "./idl/backstop_core.json" with { type: "json" };
import hookIdl from "./idl/backstop_hook.json" with { type: "json" };
import offersIdl from "./idl/backstop_offers.json" with { type: "json" };
import type { BackstopAmm } from "./idl/backstop_amm.js";
import type { BackstopChest } from "./idl/backstop_chest.js";
import type { BackstopCore } from "./idl/backstop_core.js";
import type { BackstopHook } from "./idl/backstop_hook.js";
import type { BackstopOffers } from "./idl/backstop_offers.js";

export type { BackstopAmm, BackstopChest, BackstopCore, BackstopHook, BackstopOffers };

export const IDLS = {
  hook: hookIdl as unknown as BackstopHook,
  core: coreIdl as unknown as BackstopCore,
  amm: ammIdl as unknown as BackstopAmm,
  offers: offersIdl as unknown as BackstopOffers,
  chest: chestIdl as unknown as BackstopChest,
};

/** Read-only wallet for indexers/APIs that never sign. */
export class ReadonlyWallet implements Wallet {
  readonly payer = Keypair.generate();
  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }
  async signTransaction<T extends Transaction | VersionedTransaction>(_tx: T): Promise<T> {
    throw new Error("read-only wallet cannot sign");
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(_txs: T[]): Promise<T[]> {
    throw new Error("read-only wallet cannot sign");
  }
}

export interface Programs {
  hook: Program<BackstopHook>;
  core: Program<BackstopCore>;
  amm: Program<BackstopAmm>;
  offers: Program<BackstopOffers>;
  chest: Program<BackstopChest>;
}

export function makePrograms(connection: Connection, wallet: Wallet = new ReadonlyWallet()): Programs {
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return {
    hook: new Program<BackstopHook>(IDLS.hook, provider),
    core: new Program<BackstopCore>(IDLS.core, provider),
    amm: new Program<BackstopAmm>(IDLS.amm, provider),
    offers: new Program<BackstopOffers>(IDLS.offers, provider),
    chest: new Program<BackstopChest>(IDLS.chest, provider),
  };
}

export interface ParsedEvent {
  program: keyof typeof IDLS;
  name: string;
  data: Record<string, unknown>;
  /** Index of the event within the transaction's logs (stable ordering). */
  index: number;
}

const coders = new Map<string, { program: keyof typeof IDLS; coder: BorshCoder }>(
  (Object.keys(IDLS) as (keyof typeof IDLS)[]).map((k) => [
    (IDLS[k] as unknown as { address: string }).address,
    { program: k, coder: new BorshCoder(IDLS[k] as never) },
  ]),
);

const INVOKE = /^Program (\w+) invoke \[\d+\]$/;
const EXIT = /^Program (\w+) (success|failed)/;

/**
 * Decode every Anchor event emitted by any BACKSTOP program in a transaction's
 * logs, in log order. A single pass tracks the CPI invoke stack so each
 * `Program data:` line is decoded with the coder of the program that emitted it.
 */
export function parseEvents(logs: string[]): ParsedEvent[] {
  const stack: string[] = [];
  const out: ParsedEvent[] = [];
  for (const line of logs) {
    const inv = INVOKE.exec(line);
    if (inv) {
      stack.push(inv[1]!);
      continue;
    }
    if (EXIT.test(line)) {
      stack.pop();
      continue;
    }
    if (line.startsWith("Program data: ")) {
      const current = stack[stack.length - 1];
      const entry = current ? coders.get(current) : undefined;
      if (!entry) continue;
      const ev = entry.coder.events.decode(line.slice("Program data: ".length));
      if (ev) out.push({ program: entry.program, name: ev.name, data: ev.data as Record<string, unknown>, index: out.length });
    }
  }
  return out;
}

/** Re-exported for consumers that want raw access. */
export { EventParser };
