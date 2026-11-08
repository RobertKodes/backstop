// Launchpad client: builds the seven ordered launch transactions for a child
// token and the creator's vesting claim. Mirrors the on-chain state machine in
// `programs/backstop-launchpad` (one transaction per step, enforced order).

import BN from "bn.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  type Connection,
  type Keypair,
  type PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { Wallet } from "@anchor-lang/core";

import { ASSOCIATED_TOKEN_PROGRAM, PROGRAM_IDS, TOKEN_2022, TOKEN_PROGRAM, WSOL } from "./constants.js";
import { hookAccounts } from "./hook.js";
import { ata2022, ataClassic, pda } from "./pda.js";
import { makePrograms, type Programs } from "./programs.js";

export const CHILD_MIN_LIQUIDITY_LAMPORTS = 5_000_000_000n;
export const CHILD_MAX_CREATOR_BPS = 500;
export const CHILD_VESTING_SECS = 90 * 86_400;
/** Hook reward state grows in 10 KiB steps; 4 calls reach the full ring. */
export const REWARD_STATE_GROW_CALLS = 4;

export interface LaunchParams {
  /** ≤ 32 bytes */
  name: string;
  /** ≤ 10 bytes */
  symbol: string;
  /** Metadata JSON URI, ≤ 200 bytes */
  uri: string;
  /** Total supply in base units (9 decimals). */
  supply: bigint;
  /** Creator allocation in bps (0–500), linearly vested over 90 days. */
  creatorBps: number;
  /** Initial SOL liquidity in lamports (≥ 5 SOL), locked forever. */
  liquidityLamports: bigint;
}

export interface LaunchStep {
  label: string;
  ixs: TransactionInstruction[];
  signers: Keypair[];
}

export type ChildStatus = "created" | "hooked" | "minted" | "market" | "pool" | "book" | "live";
export const CHILD_STATUSES: readonly ChildStatus[] = ["created", "hooked", "minted", "market", "pool", "book", "live"];

export interface ChildInfo {
  mint: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  supply: bigint;
  creatorBps: number;
  creatorAmount: bigint;
  liquidityLamports: bigint;
  vestingStart: number;
  vestingEnd: number;
  vestedClaimed: bigint;
  status: ChildStatus;
}

export function validateLaunchParams(p: LaunchParams): string[] {
  const errs: string[] = [];
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  if (!p.name.trim() || bytes(p.name) > 32) errs.push("Name must be 1–32 bytes.");
  if (!p.symbol.trim() || bytes(p.symbol) > 10) errs.push("Symbol must be 1–10 bytes.");
  if (bytes(p.uri) > 200) errs.push("Metadata URI must be at most 200 bytes.");
  if (p.supply < 10_000n || p.supply > 18_000_000_000_000_000_000n) errs.push("Supply must be at least 10,000 base units and fit in u64.");
  if (!Number.isInteger(p.creatorBps) || p.creatorBps < 0 || p.creatorBps > CHILD_MAX_CREATOR_BPS) errs.push("Creator allocation must be between 0% and 5%.");
  if (p.liquidityLamports < CHILD_MIN_LIQUIDITY_LAMPORTS) errs.push("Initial liquidity must be at least 5 SOL.");
  return errs;
}

/** Linear vesting (mirror of `ChildLaunch::vested`). */
export function vestedAmount(info: Pick<ChildInfo, "creatorAmount" | "vestingStart" | "vestingEnd">, now: number): bigint {
  if (info.vestingEnd <= info.vestingStart || info.vestingStart === 0) return 0n;
  if (now <= info.vestingStart) return 0n;
  if (now >= info.vestingEnd) return info.creatorAmount;
  return (info.creatorAmount * BigInt(now - info.vestingStart)) / BigInt(info.vestingEnd - info.vestingStart);
}

export interface LaunchpadApi {
  /** Ordered transactions that launch a child (each step is one transaction). */
  launchSteps(creator: PublicKey, mint: Keypair, params: LaunchParams): Promise<LaunchStep[]>;
  /** Steps still needed to finish a partially launched child (resume after a failure). */
  resumeSteps(creator: PublicKey, mint: PublicKey): Promise<LaunchStep[]>;
  /** Claim the creator's vested allocation. */
  claimVestedIxs(creator: PublicKey, mint: PublicKey): Promise<TransactionInstruction[]>;
  fetchChild(mint: PublicKey): Promise<ChildInfo | null>;
}

const bn = (v: bigint | number) => new BN(v.toString());
const decodeStr = (bytes: number[], len: number) => new TextDecoder().decode(Uint8Array.from(bytes.slice(0, len)));
const cu = (units: number) => ComputeBudgetProgram.setComputeUnitLimit({ units });

export class LaunchpadClient implements LaunchpadApi {
  readonly programs: Programs;

  constructor(
    readonly connection: Connection,
    readonly parentMint: PublicKey,
    wallet?: Wallet,
  ) {
    this.programs = makePrograms(connection, wallet);
  }

  async launchSteps(creator: PublicKey, mint: Keypair, params: LaunchParams): Promise<LaunchStep[]> {
    const errs = validateLaunchParams(params);
    if (errs.length) throw new Error(errs.join(" "));
    const create = await this.programs.launchpad.methods
      .createChild({
        name: params.name,
        symbol: params.symbol,
        uri: params.uri,
        supply: bn(params.supply),
        creatorBps: params.creatorBps,
        liquidityLamports: bn(params.liquidityLamports),
      })
      .accountsPartial({
        creator,
        mint: mint.publicKey,
        config: pda.launchpad(),
        parentMarket: pda.market(this.parentMint),
        mintAuthority: pda.childMintAuthority(mint.publicKey),
        child: pda.child(mint.publicKey),
        tokenProgram: TOKEN_2022,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const rest = await this.stepsFrom("created", creator, mint.publicKey, params.liquidityLamports);
    return [{ label: "Create mint", ixs: [cu(300_000), create], signers: [mint] }, ...rest];
  }

  async resumeSteps(creator: PublicKey, mint: PublicKey): Promise<LaunchStep[]> {
    const child = await this.fetchChild(mint);
    if (!child) throw new Error("child not found — start a new launch");
    if (!child.creator.equals(creator)) throw new Error("only the creator can continue this launch");
    return this.stepsFrom(child.status, creator, mint, child.liquidityLamports);
  }

  /** Build every step after `status` (exclusive). */
  private async stepsFrom(status: ChildStatus, creator: PublicKey, mint: PublicKey, liquidity: bigint): Promise<LaunchStep[]> {
    const lp = this.programs.launchpad;
    const order = CHILD_STATUSES.indexOf(status);
    const steps: LaunchStep[] = [];
    const child = pda.child(mint);
    const config = pda.launchpad();
    const market = pda.market(mint);
    const treasury = pda.treasury(mint);
    const pool = pda.pool(mint);
    const book = pda.book(mint);
    const vesting = pda.vesting(mint);

    if (order < 1) {
      const hook = await lp.methods
        .initChildHook()
        .accountsPartial({
          creator,
          config,
          child,
          mint,
          mintAuthority: pda.childMintAuthority(mint),
          hookConfig: pda.hookConfig(mint),
          extraMetas: pda.extraAccountMetas(mint),
          rewardState: pda.rewardState(mint),
          hookProgram: PROGRAM_IDS.hook,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      const grow: TransactionInstruction[] = [];
      for (let i = 0; i < REWARD_STATE_GROW_CALLS; i++) {
        grow.push(
          await this.programs.hook.methods
            .growRewardState()
            .accountsPartial({
              payer: creator,
              config: pda.hookConfig(mint),
              rewardState: pda.rewardState(mint),
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
        );
      }
      steps.push({ label: "Attach transfer hook", ixs: [cu(400_000), hook], signers: [] });
      steps.push({ label: "Allocate tenure ledger", ixs: [cu(400_000), ...grow], signers: [] });
    }
    if (order < 2) {
      const ix = await lp.methods
        .mintChildSupply()
        .accountsPartial({
          creator,
          config,
          child,
          mint,
          mintAuthority: pda.childMintAuthority(mint),
          hookConfig: pda.hookConfig(mint),
          poolAuthority: pool,
          poolVault: ata2022(pool, mint),
          vestingAuthority: vesting,
          vestingVault: ata2022(vesting, mint),
          tokenProgram: TOKEN_2022,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      steps.push({ label: "Mint fixed supply, revoke mint authority", ixs: [cu(300_000), ix], signers: [] });
    }
    if (order < 3) {
      const ix = await lp.methods
        .initChildMarket()
        .accountsPartial({
          creator,
          config,
          child,
          mint,
          hookConfig: pda.hookConfig(mint),
          quoteMint: WSOL,
          market,
          treasury,
          feeVault: ataClassic(market, WSOL),
          treasuryQuoteVault: ataClassic(treasury, WSOL),
          parentVault: pda.parentVault(mint),
          quoteTokenProgram: TOKEN_PROGRAM,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
          systemProgram: SystemProgram.programId,
          coreProgram: PROGRAM_IDS.core,
        })
        .instruction();
      steps.push({ label: "Create market", ixs: [cu(400_000), ix], signers: [] });
    }
    if (order < 4) {
      const wsol = ataClassic(creator, WSOL);
      const ix = await lp.methods
        .initChildPool()
        .accountsPartial({
          creator,
          config,
          child,
          market,
          mint,
          quoteMint: WSOL,
          pool,
          ammBaseVault: ata2022(pool, mint),
          quoteVault: ataClassic(pool, WSOL),
          creatorWsol: wsol,
          baseTokenProgram: TOKEN_2022,
          quoteTokenProgram: TOKEN_PROGRAM,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
          systemProgram: SystemProgram.programId,
          ammProgram: PROGRAM_IDS.amm,
        })
        .instruction();
      steps.push({
        label: "Lock initial liquidity",
        ixs: [
          cu(400_000),
          createAssociatedTokenAccountIdempotentInstruction(creator, wsol, creator, WSOL, TOKEN_PROGRAM),
          SystemProgram.transfer({ fromPubkey: creator, toPubkey: wsol, lamports: liquidity }),
          createSyncNativeInstruction(wsol, TOKEN_PROGRAM),
          ix,
        ],
        signers: [],
      });
    }
    if (order < 5) {
      const ix = await lp.methods
        .initChildBook()
        .accountsPartial({
          creator,
          config,
          child,
          market,
          mint,
          quoteMint: WSOL,
          book,
          escrowVault: ata2022(book, mint),
          baseTokenProgram: TOKEN_2022,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
          systemProgram: SystemProgram.programId,
          offersProgram: PROGRAM_IDS.offers,
        })
        .instruction();
      steps.push({ label: "Open offer book", ixs: [cu(300_000), ix], signers: [] });
    }
    if (order < 6) {
      const cm = pda.chestMarket(mint);
      const ra = pda.rewardsVaultAuthority(mint);
      const shield = pda.shield(mint);
      const ix = await lp.methods
        .initChildChests()
        .accountsPartial({
          creator,
          config,
          child,
          market,
          mint,
          quoteMint: WSOL,
          chestMarket: cm,
          vault: ataClassic(cm, WSOL),
          rewardsAuth: ra,
          holderRewardsVault: ataClassic(ra, WSOL),
          shield,
          shieldQuoteVault: ataClassic(shield, WSOL),
          shieldTokenVault: ata2022(shield, mint),
          shieldRewardsVault: pda.shieldRewardsVault(mint),
          baseTokenProgram: TOKEN_2022,
          quoteTokenProgram: TOKEN_PROGRAM,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
          systemProgram: SystemProgram.programId,
          chestProgram: PROGRAM_IDS.chest,
        })
        .instruction();
      steps.push({ label: "Open chests and Shield (go live)", ixs: [cu(500_000), ix], signers: [] });
    }
    return steps;
  }

  async claimVestedIxs(creator: PublicKey, mint: PublicKey): Promise<TransactionInstruction[]> {
    const vesting = pda.vesting(mint);
    const creatorToken = ata2022(creator, mint);
    const ix = await this.programs.launchpad.methods
      .claimVested()
      .accountsPartial({
        creator,
        child: pda.child(mint),
        mint,
        vestingAuthority: vesting,
        vestingVault: ata2022(vesting, mint),
        creatorToken,
        tokenProgram: TOKEN_2022,
      })
      .remainingAccounts(hookAccounts(mint, vesting, creator))
      .instruction();
    return [
      cu(300_000),
      createAssociatedTokenAccountIdempotentInstruction(creator, creatorToken, creator, mint, TOKEN_2022),
      ix,
    ];
  }

  async fetchChild(mint: PublicKey): Promise<ChildInfo | null> {
    const c = await this.programs.launchpad.account.childLaunch.fetchNullable(pda.child(mint));
    if (!c) return null;
    return {
      mint: c.mint,
      creator: c.creator,
      name: decodeStr(c.name, c.nameLen),
      symbol: decodeStr(c.symbol, c.symbolLen),
      uri: decodeStr(c.uri, c.uriLen),
      supply: BigInt(c.supply.toString()),
      creatorBps: c.creatorBps,
      creatorAmount: BigInt(c.creatorAmount.toString()),
      liquidityLamports: BigInt(c.liquidityLamports.toString()),
      vestingStart: c.vestingStart.toNumber(),
      vestingEnd: c.vestingEnd.toNumber(),
      vestedClaimed: BigInt(c.vestedClaimed.toString()),
      status: CHILD_STATUSES[c.status] ?? "created",
    };
  }

  /** All children (newest first) straight from chain; the API is preferred for lists. */
  async listChildren(): Promise<ChildInfo[]> {
    const all = await this.programs.launchpad.account.childLaunch.all();
    const out: ChildInfo[] = [];
    for (const a of all) {
      const info = await this.fetchChild(a.account.mint);
      if (info) out.push(info);
    }
    return out.sort((x, y) => y.vestingStart - x.vestingStart);
  }
}

