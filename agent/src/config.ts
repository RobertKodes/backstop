import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { z } from "zod";

const bool = z
  .string()
  .default("false")
  .transform((v) => v === "true" || v === "1");

const MarketSchema = z.object({
  mint: z.string(),
  quoteSymbol: z.string().default("USDC"),
  quoteDecimals: z.number().int().min(0).max(18).default(6),
  tokenDecimals: z.number().int().min(0).max(18).default(9),
});

const EnvSchema = z.object({
  AGENT_MODEL: z.string().default("claude-opus-5-5"),
  AGENT_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),
  RPC_URL: z.string().default("http://127.0.0.1:8899"),
  DATABASE_URL: z.string(),
  /** JSON keypair file path, JSON array, or base58 secret. Never committed. */
  AGENT_KEYPAIR: z.string(),
  MARKETS: z.string().default("[]"),
  RUN_INTERVAL_SECS: z.coerce.number().int().min(300).default(21_600),
  DRY_RUN: z.string().default("true").transform((v) => v !== "false" && v !== "0"),
  MAX_ACTIONS_PER_RUN: z.coerce.number().int().min(0).max(5).default(2),
  MAX_STEP_BPS: z.coerce.number().int().min(1).max(10_000).default(2_500),
  X_ENABLED: bool,
  X_ACCESS_TOKEN: z.string().optional(),
  X_API_URL: z.string().default("https://api.x.com/2/tweets"),
  X_POST_SUFFIX: z.string().default(""),
  GOVERNANCE_WEBHOOK_URL: z.string().optional(),
  HEALTH_PORT: z.coerce.number().default(8791),
  PRIORITY_FEE_MICROLAMPORTS: z.coerce.number().default(10_000),
  LOG_LEVEL: z.string().default("info"),
});

export type AgentConfig = ReturnType<typeof loadConfig>;

export function loadKeypair(spec: string): Keypair {
  if (spec.trim().startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(spec)));
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(spec, "utf8"))));
  } catch {
    return Keypair.fromSecretKey(bs58.decode(spec));
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = EnvSchema.parse(env);
  if (e.X_ENABLED && !e.X_ACCESS_TOKEN) throw new Error("X_ENABLED=true requires X_ACCESS_TOKEN");
  return {
    model: e.AGENT_MODEL,
    effort: e.AGENT_EFFORT,
    rpcUrl: e.RPC_URL,
    databaseUrl: e.DATABASE_URL,
    agent: loadKeypair(e.AGENT_KEYPAIR),
    markets: z.array(MarketSchema).parse(JSON.parse(e.MARKETS)),
    intervalSecs: e.RUN_INTERVAL_SECS,
    dryRun: e.DRY_RUN,
    maxActions: e.MAX_ACTIONS_PER_RUN,
    maxStepBps: e.MAX_STEP_BPS,
    x: { enabled: e.X_ENABLED, token: e.X_ACCESS_TOKEN ?? "", url: e.X_API_URL, suffix: e.X_POST_SUFFIX },
    governanceWebhook: e.GOVERNANCE_WEBHOOK_URL,
    healthPort: e.HEALTH_PORT,
    priorityFee: e.PRIORITY_FEE_MICROLAMPORTS,
    logLevel: e.LOG_LEVEL,
  };
}
