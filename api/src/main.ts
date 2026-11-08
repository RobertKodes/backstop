import { Redis } from "ioredis";
import pg from "pg";
import { z } from "zod";
import { buildApp, RedisCache } from "./app.js";
import { PgRepo } from "./repo.js";

const env = z
  .object({
    DATABASE_URL: z.string().default("postgres://backstop:backstop@localhost:5432/backstop"),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    API_PORT: z.coerce.number().default(8787),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().default(240),
  })
  .parse(process.env);

async function main() {
  const db = new pg.Pool({ connectionString: env.DATABASE_URL, max: 20 });
  const redis = new Redis(env.REDIS_URL);
  const sub = new Redis(env.REDIS_URL);
  await sub.subscribe("backstop:live");
  const app = await buildApp({
    repo: new PgRepo(db),
    cache: new RedisCache(redis),
    redis,
    rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE,
    live: { subscribe: (cb) => sub.on("message", (_ch: string, msg: string) => cb(msg)) },
    logger: true,
  });
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
