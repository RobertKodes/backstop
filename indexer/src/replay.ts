// `pnpm indexer:replay -- --from-slot <N>`: idempotently re-ingest history.
import { Connection } from "@solana/web3.js";
import { pino } from "pino";
import { loadConfig } from "./config.js";
import { makeDb, migrate } from "./db.js";
import { replayFrom } from "./sources.js";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const cfg = loadConfig();
  const log = pino({ level: cfg.LOG_LEVEL, name: "replay" });
  const fromSlot = Number(arg("--from-slot") ?? 0);
  const db = makeDb(cfg.DATABASE_URL);
  await migrate(db);
  await replayFrom(new Connection(cfg.RPC_URL, "confirmed"), db, fromSlot, log);
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
