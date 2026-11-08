// Read model over the indexer schema. `Repo` is an interface so routes can be
// tested with an in-memory fake; `PgRepo` is the production implementation.

import pg from "pg";

export type Row = Record<string, unknown>;

export interface Repo {
  markets(): Promise<Row[]>;
  marketStats(mint: string): Promise<Row>;
  offers(mint: string, status: "live" | "recent", limit: number): Promise<Row[]>;
  offer(offer: string): Promise<{ offer: Row; bids: Row[]; fills: Row[] } | null>;
  chest(mint: string, owner: string): Promise<{ chest: Row | null; events: Row[]; grant: Row | null; shield: Row[] }>;
  leaderboard(mint: string, kind: "tenure" | "absorbers" | "shield", limit: number): Promise<Row[]>;
  treasury(mint: string): Promise<{ latest: Row | null; history: Row[]; redemptions: Row[] }>;
  candles(mint: string, bucketSecs: number, sinceIso: string): Promise<Row[]>;
  absorption(mint: string): Promise<Row>;
  tickets(mint: string, seller: string): Promise<Row[]>;
  children(): Promise<Row[]>;
  child(mint: string): Promise<Row | null>;
  agentPosts(mint: string | null, limit: number): Promise<Row[]>;
  agentProposals(mint: string | null, status: string | null, limit: number): Promise<Row[]>;
  keeperRuns(limit: number): Promise<Row[]>;
}

export class PgRepo implements Repo {
  constructor(private readonly db: pg.Pool) {}

  private async q(text: string, values: unknown[] = []): Promise<Row[]> {
    return (await this.db.query(text, values)).rows;
  }

  markets() {
    return this.q("select * from markets order by created_at");
  }

  async marketStats(mint: string) {
    const [price] = await this.q(
      "select price, base_reserve, quote_reserve, ts from prices where mint = $1 order by ts desc, event_index desc limit 1",
      [mint],
    );
    const [absorbed] = await this.q(
      `select coalesce(sum(tokens),0)::text tokens, coalesce(sum(cost),0)::text quote from fills where mint = $1 and ts > now() - interval '24 hours'`,
      [mint],
    );
    const [shield] = await this.q(
      `select coalesce(sum(tokens),0)::text tokens, coalesce(sum(quote),0)::text quote from shield_events where mint = $1 and kind = 'absorbed' and ts > now() - interval '24 hours'`,
      [mint],
    );
    const [vol] = await this.q(
      `select coalesce(sum(quote_amount),0)::text volume from prices where mint = $1 and ts > now() - interval '24 hours'`,
      [mint],
    );
    const [live] = await this.q(`select count(*)::int n from offers where mint = $1 and status in ('open','closing')`, [
      mint,
    ]);
    const [floor] = await this.q(
      "select treasury_lamports, circulating, floor_price, ts from treasury where mint = $1 order by ts desc limit 1",
      [mint],
    );
    return {
      price: price ?? null,
      absorbedToday: {
        holdersTokens: absorbed?.tokens ?? "0",
        holdersQuote: absorbed?.quote ?? "0",
        shieldTokens: shield?.tokens ?? "0",
        shieldQuote: shield?.quote ?? "0",
      },
      volume24h: vol?.volume ?? "0",
      liveOffers: live?.n ?? 0,
      floor: floor ?? null,
    };
  }

  offers(mint: string, status: "live" | "recent", limit: number) {
    return status === "live"
      ? this.q(
          `select o.*, (select count(*)::int from bids b where b.offer = o.offer) bid_count from offers o
           where mint = $1 and status in ('open','closing') order by expires_at asc limit $2`,
          [mint, limit],
        )
      : this.q(`select * from offers where mint = $1 order by created_at desc limit $2`, [mint, limit]);
  }

  async offer(offer: string) {
    const [o] = await this.q("select * from offers where offer = $1", [offer]);
    if (!o) return null;
    const bids = await this.q("select * from bids where offer = $1 order by prefix", [offer]);
    const fills = await this.q("select * from fills where offer = $1", [offer]);
    return { offer: o, bids, fills };
  }

  async chest(mint: string, owner: string) {
    const [chest] = await this.q("select * from chests where mint = $1 and owner = $2", [mint, owner]);
    const events = await this.q(
      "select * from chest_events where mint = $1 and owner = $2 order by ts desc limit 100",
      [mint, owner],
    );
    const [grant] = await this.q("select * from grants where mint = $1 and owner = $2", [mint, owner]);
    const shield = await this.q("select * from shield_positions where mint = $1 and owner = $2 order by id", [
      mint,
      owner,
    ]);
    return { chest: chest ?? null, events, grant: grant ?? null, shield };
  }

  leaderboard(mint: string, kind: "tenure" | "absorbers" | "shield", limit: number) {
    if (kind === "tenure")
      return this.q(
        `select wallet, balance, tenure, multiplier_bps, ts from tenure_snapshots
         where mint = $1 and ts = (select max(ts) from tenure_snapshots where mint = $1)
         order by tenure desc limit $2`,
        [mint, limit],
      );
    if (kind === "absorbers")
      return this.q(
        `select bidder wallet, sum(tokens)::text tokens, sum(cost)::text quote, count(*)::int fills
         from fills where mint = $1 group by bidder order by sum(tokens) desc limit $2`,
        [mint, limit],
      );
    return this.q(
      `select owner wallet, sum(principal)::text principal, sum(principal * multiplier_bps / 10000)::text weighted, count(*)::int positions
       from shield_positions where mint = $1 and status = 'locked' group by owner order by sum(principal * multiplier_bps) desc limit $2`,
      [mint, limit],
    );
  }

  async treasury(mint: string) {
    const history = await this.q(
      "select ts, treasury_lamports, circulating, floor_price from treasury where mint = $1 and ts > now() - interval '30 days' order by ts",
      [mint],
    );
    const redemptions = await this.q("select * from redemptions where mint = $1 order by ts desc limit 50", [mint]);
    return { latest: history[history.length - 1] ?? null, history, redemptions };
  }

  candles(mint: string, bucketSecs: number, sinceIso: string) {
    return this.q(
      `select date_bin(make_interval(secs => $2), ts, timestamptz '2000-01-01') bucket,
              (array_agg(price order by ts, event_index))[1]::text open,
              max(price)::text high, min(price)::text low,
              (array_agg(price order by ts desc, event_index desc))[1]::text close,
              sum(quote_amount)::text volume
       from prices where mint = $1 and ts >= $3 group by bucket order by bucket`,
      [mint, bucketSecs, sinceIso],
    );
  }

  async absorption(mint: string) {
    const [shield] = await this.q(
      `select total_deposits_after::text total from shield_events where mint = $1 and total_deposits_after is not null order by ts desc limit 1`,
      [mint],
    );
    const [auto] = await this.q(
      `select coalesce(sum(least(g.max_per_offer, greatest(c.balance - g.reserve_floor, 0))),0)::text capacity, count(*)::int grants
       from grants g join chests c on c.mint = g.mint and c.owner = g.owner where g.mint = $1 and g.enabled`,
      [mint],
    );
    return {
      shieldDeposits: shield?.total ?? "0",
      autoAbsorbPerOffer: auto?.capacity ?? "0",
      activeGrants: auto?.grants ?? 0,
    };
  }

  tickets(mint: string, seller: string) {
    return this.q("select * from tickets where mint = $1 and seller = $2 and expires_at > now() order by expires_at", [
      mint,
      seller,
    ]);
  }

  children() {
    return this.q("select * from child_tokens order by created_at desc limit 200");
  }

  async child(mint: string) {
    const [c] = await this.q("select * from child_tokens where mint = $1", [mint]);
    return c ?? null;
  }

  agentPosts(mint: string | null, limit: number) {
    return mint
      ? this.q("select * from agent_posts where mint = $1 order by created_at desc limit $2", [mint, limit])
      : this.q("select * from agent_posts order by created_at desc limit $1", [limit]);
  }

  agentProposals(mint: string | null, status: string | null, limit: number) {
    return this.q(
      `select * from agent_proposals where ($1::text is null or mint = $1) and ($2::text is null or status = $2)
       order by created_at desc limit $3`,
      [mint, status, limit],
    );
  }

  keeperRuns(limit: number) {
    return this.q(
      "select id, job, started_at, finished_at, ok, signature, pre_state_hash, post_state_hash, error from keeper_runs order by id desc limit $1",
      [limit],
    );
  }
}
