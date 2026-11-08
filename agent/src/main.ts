// AI treasury agent service. Runs a cycle per market every RUN_INTERVAL_SECS
// (or once with --once, e.g. from cron) and exposes /health and /status.

import Anthropic from "@anthropic-ai/sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import Fastify from "fastify";
import pg from "pg";
import { pino } from "pino";

import { ClaudeAdvisor } from "./advisor.js";
import { SolanaChain } from "./chain.js";
import { loadConfig } from "./config.js";
import { type CycleResult, runCycle } from "./cycle.js";
import type { Decision } from "./policy.js";
import { PgSnapshotSource } from "./snapshot.js";
import { PgStore } from "./store.js";
import { DisabledPoster, XApiPoster } from "./x.js";

async function main() {
  const cfg = loadConfig();
  const log = pino({ level: cfg.logLevel });
  const db = new pg.Pool({ connectionString: cfg.databaseUrl, max: 4 });
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const chain = new SolanaChain(connection, cfg.agent, cfg.priorityFee);
  // Credentials resolve from ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / an `ant auth login` profile.
  const advisor = new ClaudeAdvisor(new Anthropic(), { model: cfg.model, effort: cfg.effort });
  const poster = cfg.x.enabled ? new XApiPoster(cfg.x.token, cfg.x.url) : new DisabledPoster();
  const notifyGovernance = cfg.governanceWebhook
    ? async (mint: string, ds: Decision[]) => {
        await fetch(cfg.governanceWebhook!, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source: "backstop-agent",
            mint,
            proposals: ds.map((d) => ({
              param: d.param,
              from: d.current,
              to: d.requested,
              reason: d.reason,
              rationale: d.rationale,
            })),
          }),
          signal: AbortSignal.timeout(10_000),
        });
      }
    : undefined;

  const deps = {
    chain,
    source: new PgSnapshotSource(db),
    advisor,
    store: new PgStore(db),
    poster,
    log,
    notifyGovernance,
    cfg: {
      model: cfg.model,
      agent: cfg.agent.publicKey.toBase58(),
      dryRun: cfg.dryRun,
      maxActions: cfg.maxActions,
      maxStepBps: cfg.maxStepBps,
      xSuffix: cfg.x.suffix,
    },
  };
  const last = new Map<string, CycleResult & { at: string }>();

  const runAll = async () => {
    for (const m of cfg.markets) {
      const r = await runCycle(deps, { ...m, mintKey: new PublicKey(m.mint) }).catch((e: Error) => {
        log.error({ mint: m.mint, err: e.message }, "cycle crashed");
        return { runId: 0, ok: false, decisions: [], actions: [], errorCode: "crash" } satisfies CycleResult;
      });
      last.set(m.mint, { ...r, at: new Date().toISOString() });
    }
  };

  log.info(
    {
      agent: cfg.agent.publicKey.toBase58(),
      model: cfg.model,
      dryRun: cfg.dryRun,
      xEnabled: cfg.x.enabled,
      markets: cfg.markets.length,
    },
    "BACKSTOP agent starting",
  );
  if (process.argv.includes("--once")) {
    await runAll();
    await db.end();
    return;
  }

  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ ok: true }));
  app.get("/status", async () => ({
    dryRun: cfg.dryRun,
    model: cfg.model,
    xEnabled: cfg.x.enabled,
    last: Object.fromEntries(last),
  }));
  await app.listen({ port: cfg.healthPort, host: "0.0.0.0" });

  let stopping = false;
  const loop = async () => {
    while (!stopping) {
      await runAll();
      await new Promise((r) => setTimeout(r, cfg.intervalSecs * 1000));
    }
  };
  const stop = async () => {
    stopping = true;
    await app.close();
    await db.end();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  await loop();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
