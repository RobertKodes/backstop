import { Connection } from "@solana/web3.js";
import { Redis } from "ioredis";
import { pino } from "pino";
import { loadConfig } from "./config.js";
import { makeDb, migrate } from "./db.js";
import { pollOnce, webhookServer } from "./sources.js";

async function main() {
  const cfg = loadConfig();
  const log = pino({ level: cfg.LOG_LEVEL, name: "indexer" });
  const db = makeDb(cfg.DATABASE_URL);
  const applied = await migrate(db);
  if (applied.length) log.info({ applied }, "migrations applied");
  const redis = new Redis(cfg.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 3 });
  const conn = new Connection(cfg.RPC_URL, "confirmed");

  const app = webhookServer(db, redis, cfg.HELIUS_WEBHOOK_SECRET, log);
  await app.listen({ port: cfg.INDEXER_PORT, host: "0.0.0.0" });
  log.info({ port: cfg.INDEXER_PORT }, "webhook receiver listening");

  if (cfg.POLLER_ENABLED) {
    let running = false;
    setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await pollOnce(conn, db, redis, log);
      } catch (e) {
        log.error({ err: e }, "poll failed");
      } finally {
        running = false;
      }
    }, cfg.POLL_INTERVAL_MS);
  }

  const stop = async () => {
    await app.close();
    await db.end();
    redis.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
