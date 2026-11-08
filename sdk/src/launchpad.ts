// Launchpad client (Phase 9). The interface is stable; the implementation
// is completed together with the `backstop-launchpad` program.

import type { Connection, Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";

export const CHILD_MIN_LIQUIDITY_LAMPORTS = 5_000_000_000n;
export const CHILD_MAX_CREATOR_BPS = 500;
export const CHILD_VESTING_SECS = 90 * 86_400;

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

export interface ChildInfo {
  mint: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  supply: bigint;
  creatorBps: number;
  liquidityLamports: bigint;
  vestingStart: number;
  vestingEnd: number;
  vestedClaimed: bigint;
  status: "created" | "hooked" | "minted" | "live";
}

export function validateLaunchParams(p: LaunchParams): string[] {
  const errs: string[] = [];
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  if (!p.name.trim() || bytes(p.name) > 32) errs.push("Name must be 1–32 bytes.");
  if (!p.symbol.trim() || bytes(p.symbol) > 10) errs.push("Symbol must be 1–10 bytes.");
  if (bytes(p.uri) > 200) errs.push("Metadata URI must be at most 200 bytes.");
  if (p.supply <= 0n || p.supply > 18_000_000_000_000_000_000n) errs.push("Supply must be positive and fit in u64.");
  if (!Number.isInteger(p.creatorBps) || p.creatorBps < 0 || p.creatorBps > CHILD_MAX_CREATOR_BPS) errs.push("Creator allocation must be between 0% and 5%.");
  if (p.liquidityLamports < CHILD_MIN_LIQUIDITY_LAMPORTS) errs.push("Initial liquidity must be at least 5 SOL.");
  return errs;
}

export interface LaunchpadApi {
  /** Ordered transactions that launch a child (each step is one transaction). */
  launchSteps(creator: PublicKey, mint: Keypair, params: LaunchParams): Promise<LaunchStep[]>;
  /** Claim the creator's vested allocation. */
  claimVestedIxs(creator: PublicKey, mint: PublicKey): Promise<TransactionInstruction[]>;
  fetchChild(mint: PublicKey): Promise<ChildInfo | null>;
}

export class LaunchpadClient implements LaunchpadApi {
  constructor(
    readonly connection: Connection,
    readonly parentMint: PublicKey,
  ) {}

  async launchSteps(_creator: PublicKey, _mint: Keypair, params: LaunchParams): Promise<LaunchStep[]> {
    const errs = validateLaunchParams(params);
    if (errs.length) throw new Error(errs.join(" "));
    throw new Error("launchpad program not available in this build yet");
  }

  async claimVestedIxs(_creator: PublicKey, _mint: PublicKey): Promise<TransactionInstruction[]> {
    throw new Error("launchpad program not available in this build yet");
  }

  async fetchChild(_mint: PublicKey): Promise<ChildInfo | null> {
    return null;
  }
}
