// On-chain side: read the market's parameters and the AgentAuthority, and
// send bounded `agent_set_param` transactions signed by the agent hot key.

import BN from "bn.js";
import { makePrograms, pda, type Programs } from "@backstop/sdk";
import type { Wallet } from "@anchor-lang/core";
import {
  ComputeBudgetProgram,
  type Connection,
  type Keypair,
  type PublicKey,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

import { PARAMS, type ParamValues } from "./params.js";
import type { AuthorityView } from "./policy.js";

export interface ChainState {
  params: ParamValues;
  authority: AuthorityView | null;
}

export interface Chain {
  read(mint: PublicKey): Promise<ChainState>;
  /** Simulate then send `agent_set_param`; returns the signature. */
  setParam(mint: PublicKey, paramIndex: number, value: bigint): Promise<string>;
}

type Bn = { toString(): string };
const big = (v: Bn | number) => BigInt(v.toString());

class KeypairWallet implements Wallet {
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

/** Anchor enum value for a ParamId index, e.g. `{ yieldBufferBps: {} }`. */
export function paramVariant(index: number): Record<string, Record<string, never>> {
  const def = PARAMS[index];
  if (!def) throw new Error(`unknown param index ${index}`);
  return { [def.name]: {} };
}

export async function buildSetParamIx(programs: Programs, agent: PublicKey, mint: PublicKey, index: number, value: bigint): Promise<TransactionInstruction> {
  return programs.core.methods
    .agentSetParam(paramVariant(index) as never, new BN(value.toString()))
    .accountsPartial({ agent, market: pda.market(mint), agentAuthority: pda.agent(mint) })
    .instruction();
}

export class SolanaChain implements Chain {
  readonly programs: Programs;

  constructor(
    readonly connection: Connection,
    readonly agent: Keypair,
    private readonly priorityFee = 10_000,
  ) {
    this.programs = makePrograms(connection, new KeypairWallet(agent));
  }

  async read(mint: PublicKey): Promise<ChainState> {
    const market = await this.programs.core.account.market.fetch(pda.market(mint));
    const p = market.params as unknown as Record<string, Bn | number>;
    const params: ParamValues = {};
    for (const d of PARAMS) params[d.name] = big(p[d.name] ?? 0);
    const a = await this.programs.core.account.agentAuthority.fetchNullable(pda.agent(mint));
    const authority: AuthorityView | null = a
      ? {
          agent: a.agent.toBase58(),
          cooldownSecs: Number(a.cooldownSecs.toString()),
          bounds: a.bounds.map((b) => ({ enabled: b.enabled, min: big(b.min), max: big(b.max), lastUpdate: Number(b.lastUpdate.toString()) })),
        }
      : null;
    return { params, authority };
  }

  async setParam(mint: PublicKey, paramIndex: number, value: bigint): Promise<string> {
    const ix = await buildSetParamIx(this.programs, this.agent.publicKey, mint, paramIndex, value);
    const ixs = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 60_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: this.priorityFee }),
      ix,
    ];
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({ payerKey: this.agent.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([this.agent]);
    const sim = await this.connection.simulateTransaction(tx, { sigVerify: false, commitment: "confirmed" });
    if (sim.value.err) throw new Error(`simulation failed: ${JSON.stringify(sim.value.err)} ${(sim.value.logs ?? []).slice(-4).join(" | ")}`);
    const sig = await this.connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
    const conf = await this.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (conf.value.err) throw new Error(`transaction failed: ${JSON.stringify(conf.value.err)}`);
    return sig;
  }
}

