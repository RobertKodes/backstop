import { MarketClient } from "@backstop/sdk";
import { Connection } from "@solana/web3.js";
import Fastify from "fastify";
import pg from "pg";
import { pino } from "pino";
import { MemoryAudit, PgAudit } from "./audit.js";
import { loadConfig } from "./config.js";
import {
  autoAbsorb,
  epochs,
  fees,
  parentShare,
  rebalance,
  settleOffers,
  shieldLamports,
  snapshot,
  type JobContext,
} from "./jobs.js";
import { Scheduler, webhookAlert } from "./scheduler.js";
import { Sender } from "./tx.js";

const escape = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function main() {
  const cfg = loadConfig();
  const log = pino({ level: cfg.logLevel, name: "keeper" });
  const conn = new Connection(cfg.rpcUrl, "confirmed");
  const memory = new MemoryAudit(log);
  const audit = cfg.databaseUrl ? new PgAudit(new pg.Pool({ connectionString: cfg.databaseUrl, max: 4 }), log) : memory;
  const sender = new Sender(conn, cfg.keeper, audit, cfg.priorityFee);
  const sched = new Scheduler(log, webhookAlert(cfg.alertWebhook, log));
  log.info({ keeper: cfg.keeper.publicKey.toBase58(), markets: cfg.markets.length }, "keeper starting");

  for (const market of cfg.markets) {
    const client = new MarketClient(conn, {
      mint: market.mint,
      quoteMint: market.quoteMint,
      quoteTokenProgram: market.quoteTokenProgram,
    });
    const ctx: JobContext = { cfg, market, client, sender, log: log.child({ mint: market.mint.toBase58() }) };
    const m = market.mint.toBase58().slice(0, 6);
    sched.add(`${m}:settle`, 5_000, () => settleOffers(ctx));
    sched.add(`${m}:autoabsorb`, 5_000, () => autoAbsorb(ctx));
    sched.add(`${m}:fees`, 60_000, () => fees(ctx));
    sched.add(`${m}:parentShare`, 300_000, () => parentShare(ctx));
    sched.add(`${m}:shieldLamports`, 900_000, () => shieldLamports(ctx));
    sched.add(`${m}:yield`, 3_600_000, () => rebalance(ctx));
    sched.add(`${m}:epochs`, 600_000, () => epochs(ctx));
    sched.add(`${m}:snapshot`, 3_600_000, () => snapshot(ctx));
  }

  const app = Fastify();
  app.get("/status", async () => ({ keeper: cfg.keeper.publicKey.toBase58(), jobs: sched.status() }));
  app.get("/health", async (_req, reply) => {
    const stale = sched.status().filter((j) => j.consecutiveFailures >= 3);
    return reply.code(stale.length ? 503 : 200).send({ ok: stale.length === 0, failing: stale.map((j) => j.name) });
  });
  app.get("/", async (_req, reply) => {
    const rows = sched
      .status()
      .map(
        (j) =>
          `<tr><td>${escape(j.name)}</td><td>${j.runs}</td><td>${j.failures}</td><td>${j.consecutiveFailures ? "⚠ " + j.consecutiveFailures : "ok"}</td><td>${escape(j.lastOkAt ?? "-")}</td><td>${escape((j.lastError ?? "").slice(0, 120))}</td></tr>`,
      )
      .join("");
    const recent = memory.entries
      .slice(-25)
      .reverse()
      .map(
        (e) =>
          `<tr><td>${escape(e.job)}</td><td>${e.ok ? "✓" : "✗"}</td><td>${escape(e.signature ?? "")}</td><td>${escape(e.preStateHash?.slice(0, 12) ?? "")}→${escape(e.postStateHash?.slice(0, 12) ?? "")}</td></tr>`,
      )
      .join("");
    reply.type("text/html").send(`<!doctype html><meta charset="utf-8"><title>BACKSTOP keeper</title>
<style>body{font:14px system-ui;margin:24px;background:#0b0d10;color:#e6e6e6}table{border-collapse:collapse;margin-bottom:24px}td,th{border:1px solid #333;padding:4px 8px}</style>
<h1>Keeper ${escape(cfg.keeper.publicKey.toBase58())}</h1>
<table><tr><th>job</th><th>runs</th><th>failures</th><th>state</th><th>last ok</th><th>last error</th></tr>${rows}</table>
<h2>Recent transactions (this process)</h2><table><tr><th>job</th><th>ok</th><th>signature</th><th>state hash pre→post</th></tr>${recent}</table>`);
  });
  await app.listen({ port: cfg.dashboardPort, host: "0.0.0.0" });
  log.info({ port: cfg.dashboardPort }, "dashboard listening");

  const stop = async () => {
    sched.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
