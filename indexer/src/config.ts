import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().default("postgres://backstop:backstop@localhost:5432/backstop"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  RPC_URL: z.string().default("http://127.0.0.1:8899"),
  /** Shared secret Helius sends in the Authorization header. */
  HELIUS_WEBHOOK_SECRET: z.string().optional(),
  INDEXER_PORT: z.coerce.number().default(8788),
  POLL_INTERVAL_MS: z.coerce.number().default(4_000),
  /** Disable the polling fallback when webhooks are reliable. */
  POLLER_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  LOG_LEVEL: z.string().default("info"),
});

export type Config = z.infer<typeof Env>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => Env.parse(env);
