import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import type { Repo } from "./repo.js";

export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSecs: number): Promise<void>;
}

export class MemoryCache implements Cache {
  private m = new Map<string, { v: string; exp: number }>();
  async get(k: string) {
    const e = this.m.get(k);
    if (!e || e.exp < Date.now()) return null;
    return e.v;
  }
  async set(k: string, v: string, ttl: number) {
    this.m.set(k, { v, exp: Date.now() + ttl * 1000 });
  }
}

export class RedisCache implements Cache {
  constructor(private readonly r: Redis) {}
  get(k: string) {
    return this.r.get(k);
  }
  async set(k: string, v: string, ttl: number) {
    await this.r.set(k, v, "EX", ttl);
  }
}

/** Live event source (Redis pub/sub in production, an EventEmitter in tests). */
export interface LiveSource {
  subscribe(cb: (payload: string) => void): void;
}

export interface AppDeps {
  repo: Repo;
  cache: Cache;
  live?: LiveSource;
  redis?: Redis;
  rateLimitPerMinute?: number;
  logger?: boolean;
}

const base58 = { type: "string", pattern: "^[1-9A-HJ-NP-Za-km-z]{32,44}$" } as const;
const obj = { type: "object", additionalProperties: true } as const;
const arr = { type: "array", items: obj } as const;
const mintParams = { type: "object", required: ["mint"], properties: { mint: base58 } } as const;
const limitQs = { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 500, default: 50 } } } as const;

/** JSON-serialise rows (numeric columns arrive as strings, dates as Date). */
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false, trustProxy: true });
  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: deps.rateLimitPerMinute ?? 240,
    timeWindow: "1 minute",
    ...(deps.redis ? { redis: deps.redis } : {}),
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "BACKSTOP API",
        version: "0.1.0",
        description: "Read API over indexed BACKSTOP protocol state. Amounts are raw base units (strings). Live updates via WebSocket at /v1/ws.",
      },
    },
  });
  await app.register(websocket);

  /** Cache a GET handler's JSON for `ttl` seconds keyed by URL. */
  const cached =
    (ttl: number, fn: (req: { params: Record<string, string>; query: Record<string, unknown> }) => Promise<unknown>) =>
    async (req: { url: string; params: unknown; query: unknown }, reply: { header: (k: string, v: string) => unknown; type: (t: string) => unknown; send: (b: string) => unknown }) => {
      const key = `api:${req.url}`;
      const hit = await deps.cache.get(key);
      if (hit) {
        reply.header("x-cache", "hit");
        reply.type("application/json");
        return reply.send(hit);
      }
      const body = json(await fn({ params: req.params as Record<string, string>, query: req.query as Record<string, unknown> }));
      await deps.cache.set(key, body, ttl);
      reply.header("x-cache", "miss");
      reply.type("application/json");
      return reply.send(body);
    };

  const notFound = (v: unknown) => {
    if (v === null || v === undefined) {
      const e = new Error("not found") as Error & { statusCode: number };
      e.statusCode = 404;
      throw e;
    }
    return v;
  };

  app.get("/health", async () => ({ ok: true }));
  app.get("/docs/json", { schema: { hide: true } }, async () => app.swagger());

  app.get("/v1/markets", { schema: { tags: ["markets"], response: { 200: arr } } }, cached(30, () => deps.repo.markets()));
  app.get("/v1/markets/:mint", { schema: { tags: ["markets"], params: mintParams, response: { 200: obj } } }, cached(5, (r) => deps.repo.marketStats(r.params.mint!)));
  app.get(
    "/v1/markets/:mint/offers",
    {
      schema: {
        tags: ["offers"],
        params: mintParams,
        querystring: { type: "object", properties: { status: { type: "string", enum: ["live", "recent"], default: "live" }, limit: { type: "integer", minimum: 1, maximum: 200, default: 50 } } },
        response: { 200: arr },
      },
    },
    cached(2, (r) => deps.repo.offers(r.params.mint!, (r.query.status as "live" | "recent") ?? "live", Number(r.query.limit ?? 50))),
  );
  app.get(
    "/v1/offers/:offer",
    { schema: { tags: ["offers"], params: { type: "object", required: ["offer"], properties: { offer: base58 } }, response: { 200: obj } } },
    cached(2, async (r) => notFound(await deps.repo.offer(r.params.offer!))),
  );
  app.get(
    "/v1/markets/:mint/chests/:owner",
    { schema: { tags: ["chests"], params: { type: "object", required: ["mint", "owner"], properties: { mint: base58, owner: base58 } }, response: { 200: obj } } },
    cached(3, (r) => deps.repo.chest(r.params.mint!, r.params.owner!)),
  );
  app.get(
    "/v1/markets/:mint/leaderboards/:kind",
    {
      schema: {
        tags: ["leaderboards"],
        params: { type: "object", required: ["mint", "kind"], properties: { mint: base58, kind: { type: "string", enum: ["tenure", "absorbers", "shield"] } } },
        querystring: limitQs,
        response: { 200: arr },
      },
    },
    cached(30, (r) => deps.repo.leaderboard(r.params.mint!, r.params.kind as "tenure" | "absorbers" | "shield", Number(r.query.limit ?? 50))),
  );
  app.get("/v1/markets/:mint/treasury", { schema: { tags: ["treasury"], params: mintParams, response: { 200: obj } } }, cached(10, (r) => deps.repo.treasury(r.params.mint!)));
  app.get(
    "/v1/markets/:mint/price",
    {
      schema: {
        tags: ["markets"],
        params: mintParams,
        querystring: { type: "object", properties: { bucket: { type: "integer", minimum: 60, maximum: 86_400, default: 300 }, hours: { type: "integer", minimum: 1, maximum: 720, default: 24 } } },
        response: { 200: arr },
      },
    },
    cached(5, (r) => {
      const hours = Number(r.query.hours ?? 24);
      return deps.repo.candles(r.params.mint!, Number(r.query.bucket ?? 300), new Date(Date.now() - hours * 3_600_000).toISOString());
    }),
  );
  app.get("/v1/markets/:mint/absorption", { schema: { tags: ["markets"], params: mintParams, response: { 200: obj } } }, cached(10, (r) => deps.repo.absorption(r.params.mint!)));
  app.get(
    "/v1/markets/:mint/tickets/:seller",
    { schema: { tags: ["offers"], params: { type: "object", required: ["mint", "seller"], properties: { mint: base58, seller: base58 } }, response: { 200: arr } } },
    cached(5, (r) => deps.repo.tickets(r.params.mint!, r.params.seller!)),
  );
  app.get("/v1/children", { schema: { tags: ["launchpad"], response: { 200: arr } } }, cached(15, () => deps.repo.children()));
  app.get(
    "/v1/children/:mint",
    { schema: { tags: ["launchpad"], params: mintParams, response: { 200: obj } } },
    cached(15, async (r) => notFound(await deps.repo.child(r.params.mint!))),
  );
  app.get(
    "/v1/agent/posts",
    { schema: { tags: ["agent"], querystring: { type: "object", properties: { mint: base58, limit: { type: "integer", minimum: 1, maximum: 100, default: 20 } } }, response: { 200: arr } } },
    cached(15, (r) => deps.repo.agentPosts((r.query.mint as string) ?? null, Number(r.query.limit ?? 20))),
  );
  app.get(
    "/v1/agent/proposals",
    {
      schema: {
        tags: ["agent"],
        description: "Agent proposals that need governance review (not agent-tunable or outside on-chain bounds).",
        querystring: {
          type: "object",
          properties: {
            mint: base58,
            status: { type: "string", enum: ["open", "accepted", "rejected", "superseded"] },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
          },
        },
        response: { 200: arr },
      },
    },
    cached(15, (r) => deps.repo.agentProposals((r.query.mint as string) ?? null, (r.query.status as string) ?? null, Number(r.query.limit ?? 50))),
  );
  app.get("/v1/keeper/runs", { schema: { tags: ["ops"], querystring: limitQs, response: { 200: arr } } }, cached(10, (r) => deps.repo.keeperRuns(Number(r.query.limit ?? 50))));

  // ------------------------------------------------------------ live (WS)
  const clients = new Set<{ send: (s: string) => void; mints: Set<string> }>();
  deps.live?.subscribe((payload) => {
    let parsed: { events?: { data?: { mint?: string } }[] };
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    const mints = new Set((parsed.events ?? []).map((e) => e.data?.mint).filter(Boolean) as string[]);
    for (const c of clients) if (c.mints.size === 0 || [...mints].some((m) => c.mints.has(m))) c.send(payload);
  });
  app.get("/v1/ws", { websocket: true, schema: { hide: true } }, (socket) => {
    const client = { send: (s: string) => socket.send(s), mints: new Set<string>() };
    clients.add(client);
    socket.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as { op?: string; mint?: string };
        if (msg.op === "subscribe" && msg.mint) client.mints.add(msg.mint);
        if (msg.op === "unsubscribe" && msg.mint) client.mints.delete(msg.mint);
        socket.send(JSON.stringify({ op: "ack", mints: [...client.mints] }));
      } catch {
        socket.send(JSON.stringify({ op: "error", error: "bad message" }));
      }
    });
    socket.on("close", () => clients.delete(client));
  });

  return app;
}
