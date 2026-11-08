// The 24 h data snapshot the agent reasons over. Built from the indexer's
// Postgres tables. Only numeric aggregates (plus sanitised child symbols) ever
// reach the model: free text written on-chain by users — offer messages, child
// token names/URIs — is excluded so it cannot act as a prompt injection.

import type pg from "pg";

export interface MarketMeta {
  mint: string;
  quoteSymbol: string;
  quoteDecimals: number;
  tokenDecimals: number;
}

export interface Snapshot {
  mint: string;
  generatedAt: string;
  windowHours: number;
  quote: string;
  price: {
    last: number | null;
    open24h: number | null;
    high24h: number | null;
    low24h: number | null;
    changePct24h: number | null;
  };
  amm: {
    trades: number;
    buyVolume: number;
    sellVolume: number;
    remainderVolume: number;
    ticketVolume: number;
    fees: number;
  };
  offers: {
    created: number;
    settled: number;
    tokensOffered: number;
    avgDiscountBps: number | null;
    maxDiscountBps: number | null;
    /** Share of offered lots absorbed by holders + Shield (0–1). */
    absorptionRate: number | null;
    shieldLotShare: number | null;
    remainderTokensToAmm: number;
    openNow: number;
  };
  chests: {
    count: number;
    totalBalance: number;
    deposits24h: number;
    withdrawals24h: number;
    penalties24h: number;
    absorbed24h: number;
  };
  shield: { totalDeposits: number | null; absorbedQuote24h: number; absorbedTokens24h: number };
  fees: { distributed: number; toChests: number; toShield: number; toTreasury: number; toParent: number };
  treasury: {
    sol: number | null;
    floorPrice: number | null;
    circulating: number | null;
    redemptions24h: number;
    redeemedTokens24h: number;
  };
  yieldAdapter: { deployed: number | null; idle: number | null; idleShare: number | null };
  holders: { registered: number; new24h: number };
  children: { live: number; launched24h: number; symbols: string[] };
  recentParamChanges: {
    param: string;
    oldValue: string | null;
    newValue: string | null;
    byAgent: boolean;
    at: string | null;
  }[];
}

export interface SnapshotSource {
  build(meta: MarketMeta, now: Date, windowHours?: number): Promise<Snapshot>;
}

const PRICE_SCALE = 1e18;

/** Human value of a base-unit amount (strings from `numeric`). */
const human = (v: unknown, decimals: number): number =>
  v === null || v === undefined ? 0 : Number(v) / 10 ** decimals;
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const opt = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const round = (v: number | null, dp = 6): number | null =>
  v === null || !Number.isFinite(v) ? null : Number(v.toFixed(dp));
const lowerFirst = (v: string) => v.charAt(0).toLowerCase() + v.slice(1);
const sanitizeSymbol = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);

export class PgSnapshotSource implements SnapshotSource {
  constructor(private readonly db: pg.Pool) {}

  private async one<T extends Record<string, unknown>>(sql: string, values: unknown[]): Promise<T> {
    const r = await this.db.query(sql, values);
    return (r.rows[0] ?? {}) as T;
  }

  async build(meta: MarketMeta, now: Date, windowHours = 24): Promise<Snapshot> {
    const { mint, quoteDecimals: qd, tokenDecimals: td } = meta;
    const since = new Date(now.getTime() - windowHours * 3_600_000);
    const args = [mint, since, now];
    const asOf = [mint, now];
    // quote base units per token base unit ×1e18  →  quote per whole token
    const px = (v: unknown) => (v === null || v === undefined ? null : (Number(v) / PRICE_SCALE) * 10 ** (td - qd));

    const [
      price,
      amm,
      offers,
      openNow,
      chests,
      chestFlows,
      shieldTot,
      shieldAbs,
      fees,
      tre,
      red,
      yld,
      holders,
      kids,
      kidSyms,
      changes,
    ] = await Promise.all([
      this.one(
        `select
             (select price from prices where mint=$1 and ts <= $3 order by ts desc, signature desc, event_index desc limit 1) as last,
             (select price from prices where mint=$1 and ts >= $2 and ts <= $3 order by ts asc limit 1) as open,
             (select max(price) from prices where mint=$1 and ts >= $2 and ts <= $3) as high,
             (select min(price) from prices where mint=$1 and ts >= $2 and ts <= $3) as low`,
        args,
      ),
      this.one(
        `select count(*) as trades,
             coalesce(sum(quote_amount) filter (where side=0),0) as buy,
             coalesce(sum(quote_amount) filter (where side=1),0) as sell,
             coalesce(sum(quote_amount) filter (where side=2),0) as remainder,
             coalesce(sum(quote_amount) filter (where side=3),0) as ticket,
             coalesce(sum(fee),0) as fees
           from prices where mint=$1 and ts >= $2 and ts <= $3`,
        args,
      ),
      this.one(
        `select count(*) as created,
             count(*) filter (where settled_at is not null) as settled,
             coalesce(sum(amount),0) as offered,
             avg(discount_bps) as avg_disc, max(discount_bps) as max_disc,
             sum(lots) filter (where settled_at is not null) as lots_settled,
             sum(coalesce(bidder_lots,0) + coalesce(shield_lots,0)) filter (where settled_at is not null) as lots_absorbed,
             sum(coalesce(shield_lots,0)) filter (where settled_at is not null) as lots_shield,
             coalesce(sum(remainder_tokens),0) as remainder
           from offers where mint=$1 and created_at >= $2 and created_at <= $3`,
        args,
      ),
      this.one(`select count(*) as n from offers where mint=$1 and status='open'`, [mint]),
      this.one(`select count(*) as n, coalesce(sum(balance),0) as total from chests where mint=$1`, [mint]),
      this.one(
        `select coalesce(sum(assets) filter (where kind=0),0) as dep,
             coalesce(sum(assets) filter (where kind=1),0) as wd,
             coalesce(sum(penalty),0) as pen,
             coalesce(sum(assets) filter (where kind=3),0) - coalesce(sum(assets) filter (where kind=4),0) as absorbed
           from chest_events where mint=$1 and ts >= $2 and ts <= $3`,
        args,
      ),
      this.one(
        `select total_deposits_after as total from shield_events where mint=$1 and total_deposits_after is not null and ts <= $2
           order by ts desc limit 1`,
        asOf,
      ),
      this.one(
        `select coalesce(sum(quote),0) as quote, coalesce(sum(tokens),0) as tokens
           from shield_events where mint=$1 and kind='absorbed' and ts >= $2 and ts <= $3`,
        args,
      ),
      this.one(
        `select coalesce(sum(amount),0) as amount, coalesce(sum(to_chests),0) as chests, coalesce(sum(to_shield),0) as shield,
             coalesce(sum(to_treasury),0) as treasury, coalesce(sum(to_parent),0) as parent
           from fee_distributions where mint=$1 and ts >= $2 and ts <= $3`,
        args,
      ),
      this.one(
        `select treasury_lamports as sol, floor_price as floor, circulating from treasury where mint=$1 and ts <= $2
           order by ts desc, signature desc, event_index desc limit 1`,
        asOf,
      ),
      this.one(
        `select count(*) as n, coalesce(sum(tokens),0) as tokens from redemptions where mint=$1 and ts >= $2 and ts <= $3`,
        args,
      ),
      this.one(
        `select adapter_value as deployed, idle_assets as idle from yield_events where mint=$1 and ts <= $2
           order by ts desc, signature desc, event_index desc limit 1`,
        asOf,
      ),
      this.one(
        `select count(*) as n, count(*) filter (where registered_at >= $2 and registered_at <= $3) as new
           from holders where mint=$1`,
        args,
      ),
      this.one(
        `select count(*) filter (where status='live') as live,
             count(*) filter (where created_at >= $2 and created_at <= $3) as launched
           from child_tokens where parent=$1`,
        args,
      ),
      this.db.query(
        `select symbol from child_tokens where parent=$1 and created_at >= $2 and created_at <= $3 order by created_at desc limit 10`,
        args,
      ),
      this.db.query(
        `select param, old_value, new_value, agent, ts from param_changes where mint=$1 and ts >= $2
           order by ts desc limit 20`,
        [mint, new Date(now.getTime() - 7 * 86_400_000)],
      ),
    ]);

    const last = px(price.last);
    const open = px(price.open);
    const lotsSettled = opt(offers.lots_settled);
    const deployed = yld.deployed === undefined ? null : human(yld.deployed, qd);
    const idle = yld.idle === undefined ? null : human(yld.idle, qd);

    return {
      mint,
      generatedAt: now.toISOString(),
      windowHours,
      quote: meta.quoteSymbol,
      price: {
        last: round(last, 9),
        open24h: round(open, 9),
        high24h: round(px(price.high), 9),
        low24h: round(px(price.low), 9),
        changePct24h: last !== null && open ? round(((last - open) / open) * 100, 2) : null,
      },
      amm: {
        trades: num(amm.trades),
        buyVolume: human(amm.buy, qd),
        sellVolume: human(amm.sell, qd),
        remainderVolume: human(amm.remainder, qd),
        ticketVolume: human(amm.ticket, qd),
        fees: human(amm.fees, qd),
      },
      offers: {
        created: num(offers.created),
        settled: num(offers.settled),
        tokensOffered: human(offers.offered, td),
        avgDiscountBps: round(opt(offers.avg_disc), 1),
        maxDiscountBps: opt(offers.max_disc),
        absorptionRate: lotsSettled ? round(num(offers.lots_absorbed) / lotsSettled, 4) : null,
        shieldLotShare: lotsSettled ? round(num(offers.lots_shield) / lotsSettled, 4) : null,
        remainderTokensToAmm: human(offers.remainder, td),
        openNow: num(openNow.n),
      },
      chests: {
        count: num(chests.n),
        totalBalance: human(chests.total, qd),
        deposits24h: human(chestFlows.dep, qd),
        withdrawals24h: human(chestFlows.wd, qd),
        penalties24h: human(chestFlows.pen, qd),
        absorbed24h: human(chestFlows.absorbed, qd),
      },
      shield: {
        totalDeposits: shieldTot.total === undefined ? null : human(shieldTot.total, qd),
        absorbedQuote24h: human(shieldAbs.quote, qd),
        absorbedTokens24h: human(shieldAbs.tokens, td),
      },
      fees: {
        distributed: human(fees.amount, qd),
        toChests: human(fees.chests, qd),
        toShield: human(fees.shield, qd),
        toTreasury: human(fees.treasury, qd),
        toParent: human(fees.parent, qd),
      },
      treasury: {
        sol: tre.sol === undefined ? null : human(tre.sol, 9),
        // lamports per token base unit ×1e18 → SOL per whole token
        floorPrice: tre.floor === undefined ? null : round((Number(tre.floor) / PRICE_SCALE) * 10 ** (td - 9), 12),
        circulating: tre.circulating === undefined ? null : human(tre.circulating, td),
        redemptions24h: num(red.n),
        redeemedTokens24h: human(red.tokens, td),
      },
      yieldAdapter: {
        deployed,
        idle,
        idleShare:
          deployed !== null && idle !== null && deployed + idle > 0 ? round(idle / (deployed + idle), 4) : null,
      },
      holders: { registered: num(holders.n), new24h: num(holders.new) },
      children: {
        live: num(kids.live),
        launched24h: num(kids.launched),
        symbols: (kidSyms.rows as { symbol: string }[]).map((r) => sanitizeSymbol(r.symbol)).filter(Boolean),
      },
      recentParamChanges: (
        changes.rows as {
          param: string;
          old_value: string | null;
          new_value: string | null;
          agent: boolean;
          ts: Date | null;
        }[]
      ).map((r) => ({
        // stored with the IDL's variant casing (e.g. "YieldBufferBps"); the model sees camelCase names
        param: lowerFirst(String(r.param).replace(/[^A-Za-z0-9_]/g, "")),
        oldValue: r.old_value === null ? null : String(r.old_value),
        newValue: r.new_value === null ? null : String(r.new_value),
        byAgent: r.agent,
        at: r.ts ? new Date(r.ts).toISOString() : null,
      })),
    };
  }
}

/** True when there is too little activity to justify any parameter change. */
export function isThin(s: Snapshot): boolean {
  return s.amm.trades + s.offers.created < 5;
}
