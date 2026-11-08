import { readFileSync } from "node:fs";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { z } from "zod";

const Market = z.object({
  mint: z.string(),
  quoteMint: z.string(),
  quoteTokenProgram: z.string().optional(),
  /** Yield adapter remaining accounts for `rebalance` (base58, in order). */
  adapterAccounts: z.array(z.object({ pubkey: z.string(), writable: z.boolean() })).default([]),
});

const Env = z.object({
  RPC_URL: z.string().default("http://127.0.0.1:8899"),
  DATABASE_URL: z.string().optional(),
  /** Path to a JSON keypair file, or a base58 secret key. Never committed. */
  KEEPER_KEYPAIR: z.string(),
  /** JSON array of markets to service. */
  MARKETS: z.string().default("[]"),
  ALERT_WEBHOOK_URL: z.string().optional(),
  DASHBOARD_PORT: z.coerce.number().default(8790),
  /** Use Jupiter for fee conversions (mainnet). Off → conversions skipped unless MOCK_SWAP_* set. */
  JUPITER_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  JUPITER_URL: z.string().default("https://lite-api.jup.ag/swap/v1"),
  /** Max slippage the keeper requests from Jupiter (on-chain bound is separate). */
  SWAP_SLIPPAGE_BPS: z.coerce.number().default(50),
  /** Minimum fee-vault balance (quote base units) before distributing. */
  DISTRIBUTE_MIN: z.coerce.bigint().default(1_000_000n),
  /** Minimum treasury-vault balance before converting. */
  CONVERT_MIN: z.coerce.bigint().default(10_000_000n),
  /** Minimum pending redemption-fee lamports before converting them to Shield rewards. */
  SHIELD_CONVERT_MIN_LAMPORTS: z.coerce.bigint().default(100_000_000n),
  /** Seconds between TWAP chunks of a large conversion. */
  CHUNK_INTERVAL_SECS: z.coerce.number().default(120),
  PRIORITY_FEE_MICROLAMPORTS: z.coerce.number().default(10_000),
  LOG_LEVEL: z.string().default("info"),
});

export type MarketCfg = {
  mint: PublicKey;
  quoteMint: PublicKey;
  quoteTokenProgram?: PublicKey;
  adapterAccounts: { pubkey: PublicKey; isSigner: false; isWritable: boolean }[];
};

export interface Config {
  rpcUrl: string;
  databaseUrl?: string;
  keeper: Keypair;
  markets: MarketCfg[];
  alertWebhook?: string;
  dashboardPort: number;
  jupiterEnabled: boolean;
  jupiterUrl: string;
  slippageBps: number;
  distributeMin: bigint;
  convertMin: bigint;
  shieldConvertMinLamports: bigint;
  chunkIntervalSecs: number;
  priorityFee: number;
  logLevel: string;
}

export function loadKeypair(spec: string): Keypair {
  if (spec.trim().startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(spec)));
  try {
    const raw = readFileSync(spec, "utf8");
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch {
    return Keypair.fromSecretKey(bs58.decode(spec));
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = Env.parse(env);
  const markets = z
    .array(Market)
    .parse(JSON.parse(e.MARKETS))
    .map((m) => ({
      mint: new PublicKey(m.mint),
      quoteMint: new PublicKey(m.quoteMint),
      quoteTokenProgram: m.quoteTokenProgram ? new PublicKey(m.quoteTokenProgram) : undefined,
      adapterAccounts: m.adapterAccounts.map((a) => ({
        pubkey: new PublicKey(a.pubkey),
        isSigner: false as const,
        isWritable: a.writable,
      })),
    }));
  return {
    rpcUrl: e.RPC_URL,
    databaseUrl: e.DATABASE_URL,
    keeper: loadKeypair(e.KEEPER_KEYPAIR),
    markets,
    alertWebhook: e.ALERT_WEBHOOK_URL,
    dashboardPort: e.DASHBOARD_PORT,
    jupiterEnabled: e.JUPITER_ENABLED,
    jupiterUrl: e.JUPITER_URL,
    slippageBps: e.SWAP_SLIPPAGE_BPS,
    distributeMin: e.DISTRIBUTE_MIN,
    convertMin: e.CONVERT_MIN,
    shieldConvertMinLamports: e.SHIELD_CONVERT_MIN_LAMPORTS,
    chunkIntervalSecs: e.CHUNK_INTERVAL_SECS,
    priorityFee: e.PRIORITY_FEE_MICROLAMPORTS,
    logLevel: e.LOG_LEVEL,
  };
}
