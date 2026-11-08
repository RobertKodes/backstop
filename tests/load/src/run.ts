/* eslint-disable no-console -- load-test report is printed */
// Indexer + API load test (spec §8: ≥ 500 offers/hour, 50k holders).
//
//   pnpm --filter ./tests/load build && pnpm --filter ./tests/load load      (full)
//   pnpm --filter ./tests/load test                                         (smoke, CI)
//
// 1. 50k holders: registration + transfer events, plus one tenure snapshot
//    batch (as written by the keeper) — the leaderboard's worst case.
// 2. Offer flow at ≥ 500 offers/hour for HOURS simulated hours: create, one
//    transaction per bid, close, settle (with AMM remainder), one claim per
//    bid, plus AMM swaps — ingested sequentially through `ingestTx`, exactly
//    like the poller. Reports throughput vs the required rate.
// 3. API: concurrent clients over a weighted endpoint mix, with the response
//    cache on (production-like) and off (raw query cost). Reports p50/p95/p99.
// Exits non-zero if a threshold is missed. Uses LOAD_DATABASE_URL or
// DATABASE_URL and DROPS its schema — point it at a scratch database.

import { buildApp, MemoryCache, type Cache } from "@backstop/api/dist/app.js";
import { PgRepo } from "@backstop/api/dist/repo.js";
import { ingestTx, makeDb, migrate } from "@backstop/indexer";
import { PROGRAM_IDS } from "@backstop/sdk";
import { PublicKey } from "@solana/web3.js";

import { bn, type Ev, key, offerAddress, PRICE_SCALE, Rng, signature, txLogs } from "./gen.js";

const smoke = process.argv.includes("--smoke");
const env = (k: string, d: number) => Number(process.env[k] ?? d);
const CFG = {
  holders: env("HOLDERS", smoke ? 2_000 : 50_000),
  offersPerHour: env("OFFERS_PER_HOUR", 500),
  hours: env("HOURS", smoke ? 0.1 : 2),
  bidsPerOffer: env("BIDS_PER_OFFER", 12),
  apiConcurrency: env("API_CONCURRENCY", smoke ? 8 : 64),
  apiSeconds: env("API_SECONDS", smoke ? 5 : 20),
  // thresholds
  minIngestHeadroom: env("MIN_INGEST_HEADROOM", 10), // × the required tx rate
  maxP95Ms: env("MAX_P95_MS", 250),
  maxP95NoCacheMs: env("MAX_P95_NOCACHE_MS", 1_000),
};

const url = process.env.LOAD_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("set LOAD_DATABASE_URL (or DATABASE_URL) to a scratch Postgres database");
  process.exit(2);
}

const rng = new Rng();
const mint = key();
const quote = key();
const USDC = 1_000_000n;
const TOKEN = 1_000_000_000n;
let slot = 1_000;
let clock = Math.floor(Date.now() / 1000) - Math.ceil(CFG.hours * 3_600) - 3_600;

const db = makeDb(url);
const ingest = (events: Ev[], at = clock) =>
  ingestTx(db, null, { signature: signature(), slot: ++slot, blockTime: at, logs: txLogs(events), failed: false });

function pct(xs: number[], p: number) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]! : NaN;
}

async function timed<T>(label: string, f: () => Promise<T>): Promise<{ value: T; secs: number }> {
  const t0 = performance.now();
  const value = await f();
  const secs = (performance.now() - t0) / 1000;
  console.log(`  ${label}: ${secs.toFixed(1)} s`);
  return { value, secs };
}

async function main() {
  console.log(`BACKSTOP load test${smoke ? " (smoke)" : ""}`, CFG);
  await db.query("drop schema public cascade; create schema public;");
  await migrate(db);

  // market + pool exist so stats endpoints have context
  await ingest([
    { program: "core", name: "MarketInitialized", data: marketInit() },
    {
      program: "amm",
      name: "PoolInitialized",
      data: {
        mint,
        quoteMint: quote,
        baseReserve: bn(900_000_000n * TOKEN),
        quoteReserve: bn(100_000n * USDC),
        price: bn((100_000n * USDC * PRICE_SCALE) / (900_000_000n * TOKEN)),
        ts: bn(clock),
      },
    },
  ]);

  // ---------------------------------------------------------- 1. holders
  console.log(`\n1. ${CFG.holders.toLocaleString()} holders`);
  const holders: PublicKey[] = Array.from({ length: CFG.holders }, key);
  const batch = 25; // registrations per transaction
  const { secs: hSecs } = await timed("registration + transfer events", async () => {
    for (let i = 0; i < holders.length; i += batch) {
      const evs: Ev[] = [];
      for (const w of holders.slice(i, i + batch)) {
        const amount = BigInt(rng.int(1_000, 2_000_000)) * TOKEN;
        evs.push({
          program: "hook",
          name: "HolderRegistered",
          data: { mint, wallet: w, balance: bn(0), ts: bn(clock) },
        });
        evs.push({
          program: "hook",
          name: "TransferTracked",
          data: {
            mint,
            srcWallet: PROGRAM_IDS.amm,
            dstWallet: w,
            amount: bn(amount),
            kind: 1,
            srcTracked: false,
            dstTracked: true,
            ts: bn(clock),
          },
        });
      }
      await ingest(evs);
      clock += 1;
    }
  });
  const { secs: snapSecs } = await timed("tenure snapshot batch (keeper path)", async () => {
    const ts = new Date(clock * 1000);
    for (let i = 0; i < holders.length; i += 5_000) {
      const chunk = holders.slice(i, i + 5_000);
      await db.query(
        `insert into tenure_snapshots (mint, wallet, ts, balance, tenure, multiplier_bps)
         select $1, w, $2, b::numeric, t::numeric, m from unnest($3::text[], $4::text[], $5::text[], $6::int[]) as x(w, b, t, m)`,
        [
          mint.toBase58(),
          ts,
          chunk.map((w) => w.toBase58()),
          chunk.map(() => (BigInt(rng.int(1_000, 2_000_000)) * TOKEN).toString()),
          chunk.map(() => (BigInt(rng.int(1, 1e9)) * TOKEN).toString()),
          chunk.map(() => rng.int(10_000, 30_000)),
        ],
      );
    }
  });

  // ------------------------------------------------------------ 2. offers
  const offers = Math.max(1, Math.round(CFG.offersPerHour * CFG.hours));
  const txsPerOffer = 1 + CFG.bidsPerOffer + 1 + 1 + CFG.bidsPerOffer + 2; // create, bids, close, settle(+remainder), claims, 2 swaps
  console.log(
    `\n2. ${offers} offers over ${CFG.hours} h (${CFG.offersPerHour}/h, ${CFG.bidsPerOffer} bids each, ${txsPerOffer} txs/offer)`,
  );
  const spacing = (3_600 / CFG.offersPerHour) | 0;
  let txCount = 0;
  let evCount = 0;
  let price = (100_000n * USDC * PRICE_SCALE) / (900_000_000n * TOKEN);
  const offerIds: string[] = [];
  const { secs: oSecs } = await timed("offer lifecycle ingestion", async () => {
    for (let id = 0n; id < BigInt(offers); id++) {
      const offer = offerAddress(mint, id);
      offerIds.push(offer.toBase58());
      const seller = rng.pick(holders);
      const lots = 100n;
      const lotSize = BigInt(rng.int(1_000, 6_000)) * TOKEN;
      const fill = (price * 95n) / 100n;
      const lotCost = (lotSize * fill + PRICE_SCALE - 1n) / PRICE_SCALE;
      const t0 = clock;
      const r1 = await ingest(
        [
          {
            program: "offers",
            name: "OfferCreated",
            data: {
              mint,
              offer,
              id: bn(id),
              seller,
              amount: bn(lots * lotSize),
              lots: bn(lots),
              lotSize: bn(lotSize),
              lotCost: bn(lotCost),
              twap: bn(price),
              fillPrice: bn(fill),
              discountBps: 500,
              momentumBps: bn(0),
              sellerLotTenure: bn(0n),
              createdAt: bn(t0),
              expiresAt: bn(t0 + 600),
              message: "",
            },
          },
        ],
        t0,
      );
      evCount += r1.events.length;
      let prefix = 0n;
      const bids: { bid: PublicKey; bidder: PublicKey; kind: number; cap: bigint }[] = [];
      for (let b = 0; b < CFG.bidsPerOffer; b++) {
        const bidder = rng.pick(holders);
        const kind = rng.int(0, 2);
        const cap = BigInt(rng.int(1, 20));
        const bid = key();
        bids.push({ bid, bidder, kind, cap });
        const r = await ingest(
          [
            {
              program: "offers",
              name: "BidPlaced",
              data: {
                mint,
                offer,
                bid,
                bidder,
                kind,
                amount: bn(cap * lotCost),
                capacity: bn(cap),
                prefix: bn(prefix),
                totalCapacity: bn(prefix + cap),
                ts: bn(t0 + 10 + b),
              },
            },
          ],
          t0 + 10 + b,
        );
        prefix += cap;
        evCount += r.events.length;
      }
      const total = prefix;
      const shieldLots = 20n;
      const avail = lots - shieldLots;
      const bidderLots = total < avail ? total : avail;
      const remainder = (avail - bidderLots) * lotSize;
      const proceeds = (shieldLots + bidderLots) * lotCost;
      const fee = (proceeds * 3n) / 100n;
      for (const evs of [
        [
          {
            program: "offers",
            name: "BiddingClosed",
            data: { mint, offer, randSlot: bn(slot + 4), early: false, ts: bn(t0 + 600) },
          },
        ],
        [
          {
            program: "offers",
            name: "OfferSettled",
            data: {
              mint,
              offer,
              seller,
              shieldLots: bn(shieldLots),
              bidderLots: bn(bidderLots),
              totalCapacity: bn(total),
              randomOffset: bn(rng.int(0, Number(total) - 1)),
              seed: Array.from({ length: 32 }, () => rng.int(0, 255)),
              proceeds: bn(proceeds),
              fee: bn(fee),
              sellerNet: bn(proceeds - fee),
              remainderTokens: bn(remainder),
              ticketAmount: bn((shieldLots + bidderLots) * lotSize),
              ts: bn(t0 + 602),
            },
          },
          ...(remainder > 0n
            ? [{ program: "amm", name: "Swapped", data: swap(PROGRAM_IDS.offers, 2, remainder, t0 + 602) }]
            : []),
        ],
      ] as Ev[][]) {
        const r = await ingest(evs, t0 + 602);
        evCount += r.events.length;
      }
      let left = bidderLots;
      for (const b of bids) {
        const got = left < b.cap ? left : b.cap;
        left -= got;
        const r = await ingest(
          [
            {
              program: "offers",
              name: "BidClaimed",
              data: {
                mint,
                offer,
                bid: b.bid,
                bidder: b.bidder,
                kind: b.kind,
                lots: bn(got),
                tokens: bn(got * lotSize),
                cost: bn(got * lotCost),
                refund: bn((b.cap - got) * lotCost),
                tenureCreditedRaw: bn(0n),
                ts: bn(t0 + 610),
              },
            },
          ],
          t0 + 610,
        );
        evCount += r.events.length;
      }
      for (let k = 0; k < 2; k++) {
        const r = await ingest(
          [
            {
              program: "amm",
              name: "Swapped",
              data: swap(rng.pick(holders), k, BigInt(rng.int(100, 5_000)) * USDC, t0 + 300 + k),
            },
          ],
          t0 + 300 + k,
        );
        evCount += r.events.length;
      }
      txCount += txsPerOffer;
      clock = t0 + spacing;
    }
  });
  const txRate = txCount / oSecs;
  const required = (CFG.offersPerHour * txsPerOffer) / 3_600;
  const headroom = txRate / required;
  console.log(
    `  ${txCount.toLocaleString()} txs / ${evCount.toLocaleString()} events → ${txRate.toFixed(0)} tx/s (${(evCount / oSecs).toFixed(0)} events/s)`,
  );
  console.log(
    `  required at ${CFG.offersPerHour} offers/h: ${required.toFixed(2)} tx/s → headroom ×${headroom.toFixed(0)}`,
  );

  // --------------------------------------------------------------- 3. API
  console.log(`\n3. API: ${CFG.apiConcurrency} concurrent clients × ${CFG.apiSeconds} s`);
  const m = mint.toBase58();
  const routes: [number, () => string][] = [
    [6, () => `/v1/markets/${m}/offers?status=recent`],
    [4, () => `/v1/markets/${m}`],
    [4, () => `/v1/offers/${rng.pick(offerIds)}`],
    [3, () => `/v1/markets/${m}/chests/${rng.pick(holders).toBase58()}`],
    [2, () => `/v1/markets/${m}/leaderboards/tenure?limit=50`],
    [2, () => `/v1/markets/${m}/leaderboards/absorbers?limit=50`],
    [2, () => `/v1/markets/${m}/price?bucket=60`],
    [1, () => `/v1/markets/${m}/absorption`],
    [1, () => `/v1/markets/${m}/treasury`],
    [1, () => `/v1/children`],
  ];
  const weighted = routes.flatMap(([w, f]) => Array.from({ length: w }, () => f));
  const noCache: Cache = { get: async () => null, set: async () => {} };
  const results: Record<string, { p50: number; p95: number; p99: number; rps: number; errors: number }> = {};
  for (const [label, cache] of [
    ["cache on", new MemoryCache()],
    ["cache off", noCache],
  ] as [string, Cache][]) {
    const app = await buildApp({ repo: new PgRepo(db), cache, rateLimitPerMinute: 1_000_000_000 });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
    const lat: number[] = [];
    let errors = 0;
    const stopAt = performance.now() + CFG.apiSeconds * 1000;
    await Promise.all(
      Array.from({ length: CFG.apiConcurrency }, async () => {
        while (performance.now() < stopAt) {
          const path = rng.pick(weighted)();
          const t0 = performance.now();
          try {
            const r = await fetch(base + path);
            await r.arrayBuffer();
            if (r.status >= 500 || (r.status >= 400 && r.status !== 404)) errors++;
          } catch {
            errors++;
          }
          lat.push(performance.now() - t0);
        }
      }),
    );
    await app.close();
    results[label] = {
      p50: pct(lat, 50),
      p95: pct(lat, 95),
      p99: pct(lat, 99),
      rps: lat.length / CFG.apiSeconds,
      errors,
    };
    const r = results[label]!;
    console.log(
      `  ${label}: ${lat.length.toLocaleString()} req, ${r.rps.toFixed(0)} req/s, p50 ${r.p50.toFixed(1)} ms, p95 ${r.p95.toFixed(1)} ms, p99 ${r.p99.toFixed(1)} ms, errors ${errors}`,
    );
  }

  // ------------------------------------------------------------ verdict
  const failures: string[] = [];
  if (headroom < CFG.minIngestHeadroom)
    failures.push(`ingest headroom ×${headroom.toFixed(1)} < ×${CFG.minIngestHeadroom}`);
  if (results["cache on"]!.p95 > CFG.maxP95Ms)
    failures.push(`API p95 ${results["cache on"]!.p95.toFixed(0)} ms > ${CFG.maxP95Ms} ms`);
  if (results["cache off"]!.p95 > CFG.maxP95NoCacheMs)
    failures.push(`API p95 without cache ${results["cache off"]!.p95.toFixed(0)} ms > ${CFG.maxP95NoCacheMs} ms`);
  for (const [k, r] of Object.entries(results)) if (r.errors > 0) failures.push(`${r.errors} API errors (${k})`);
  const summary = {
    holders: CFG.holders,
    holderIngestSecs: hSecs,
    tenureSnapshotSecs: snapSecs,
    offers,
    txs: txCount,
    txPerSec: txRate,
    headroom,
    api: results,
  };
  console.log(`\nsummary ${JSON.stringify(summary)}`);
  await db.end();
  if (failures.length) {
    console.error(`\nFAIL: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("\nPASS");

  function swap(trader: PublicKey, side: number, amount: bigint, ts: number) {
    price = side === 0 ? (price * 1_001n) / 1_000n : (price * 999n) / 1_000n;
    const quoteAmount = side === 0 ? amount : (amount * price) / PRICE_SCALE;
    return {
      mint,
      trader,
      side,
      baseAmount: bn(side === 0 ? (amount * PRICE_SCALE) / price : amount),
      quoteAmount: bn(quoteAmount),
      fee: bn((quoteAmount * 3n) / 100n),
      baseReserve: bn(900_000_000n * TOKEN),
      quoteReserve: bn(100_000n * USDC),
      price: bn(price),
      ts: bn(ts),
    };
  }
}

function marketInit() {
  return {
    mint,
    quoteMint: quote,
    parent: PublicKey.default,
    governance: key(),
    supply: bn(1_000_000_000n * TOKEN),
    ts: bn(clock),
  };
}

main().catch(async (e) => {
  console.error(e);
  await db.end().catch(() => undefined);
  process.exit(1);
});
