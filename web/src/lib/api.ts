// REST client for the BACKSTOP read API (api/src/app.ts). Rows mirror the
// indexer schema: numeric columns arrive as base-unit strings, timestamps as
// ISO strings.

import { config } from "./config";

export type OfferStatus = "open" | "closing" | "settled" | "closed";

export interface MarketRow {
  mint: string;
  quote_mint: string | null;
  parent: string | null;
  governance: string | null;
  supply: string | null;
  created_at: string | null;
}

export interface PriceRow {
  price: string;
  base_reserve: string;
  quote_reserve: string;
  ts: string;
}

export interface TreasuryRow {
  ts: string;
  treasury_lamports: string;
  circulating: string;
  floor_price: string;
}

export interface MarketStats {
  price: PriceRow | null;
  absorbedToday: { holdersTokens: string; holdersQuote: string; shieldTokens: string; shieldQuote: string };
  volume24h: string;
  liveOffers: number;
  floor: TreasuryRow | null;
}

export interface OfferRow {
  offer: string;
  mint: string;
  id: string;
  seller: string;
  amount: string;
  lots: number;
  lot_size: string;
  lot_cost: string;
  twap: string;
  fill_price: string;
  discount_bps: number;
  momentum_bps: string;
  message: string | null;
  created_at: string;
  expires_at: string;
  status: OfferStatus;
  total_capacity: string;
  bid_count?: number;
  closed_early?: boolean | null;
  shield_lots?: number | null;
  bidder_lots?: number | null;
  proceeds?: string | null;
  fee?: string | null;
  seller_net?: string | null;
  remainder_tokens?: string | null;
  remainder_proceeds?: string | null;
  ticket_amount?: string | null;
  settled_at?: string | null;
}

export interface BidRow {
  bid: string;
  offer: string;
  mint: string;
  bidder: string;
  kind: number;
  amount: string;
  capacity: string;
  prefix: string;
  created_at: string;
  signature: string;
}

export interface FillRow {
  bid: string;
  offer: string;
  mint: string;
  bidder: string;
  kind: number;
  lots: string;
  tokens: string;
  cost: string;
  refund: string;
  tenure_credited: string;
  ts: string;
  signature: string;
}

export interface OfferDetail {
  offer: OfferRow;
  bids: BidRow[];
  fills: FillRow[];
}

export interface ChestRow {
  mint: string;
  owner: string;
  balance: string;
  lock_until: string | null;
  updated_at: string | null;
}

export interface ChestEventRow {
  signature: string;
  event_index: number;
  kind: number;
  assets: string;
  shares_delta: string;
  penalty: string;
  balance_after: string;
  lock_until: string | null;
  ts: string;
}

export interface GrantRow {
  enabled: boolean;
  max_per_offer: string;
  max_per_day: string;
  min_discount_bps: number;
  reserve_floor: string;
}

export interface ShieldPositionRow {
  id: number;
  principal: string;
  multiplier_bps: number;
  lock_end: string;
  claimed_tokens: string;
  claimed_rewards: string;
  status: "locked" | "withdrawn" | string;
}

export interface ChestResponse {
  chest: ChestRow | null;
  events: ChestEventRow[];
  grant: GrantRow | null;
  shield: ShieldPositionRow[];
}

export type LeaderboardKind = "tenure" | "absorbers" | "shield";

export interface TenureRow {
  wallet: string;
  balance: string;
  tenure: string;
  multiplier_bps: number;
  ts: string;
}
export interface AbsorberRow {
  wallet: string;
  tokens: string;
  quote: string;
  fills: number;
}
export interface ShieldLeaderRow {
  wallet: string;
  principal: string;
  weighted: string;
  positions: number;
}

export interface RedemptionRow {
  signature: string;
  wallet: string;
  tokens: string;
  gross_lamports: string;
  fee_lamports: string;
  net_lamports: string;
  ts: string;
}

export interface TreasuryResponse {
  latest: TreasuryRow | null;
  history: TreasuryRow[];
  redemptions: RedemptionRow[];
}

export interface Candle {
  bucket: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface Absorption {
  shieldDeposits: string;
  autoAbsorbPerOffer: string;
  activeGrants: number;
}

export interface TicketRow {
  mint: string;
  seller: string;
  offer_id: string;
  amount: string;
  remaining: string;
  expires_at: string;
}

export interface ChildRow {
  mint: string;
  parent: string;
  creator: string;
  name: string;
  symbol: string;
  uri: string | null;
  supply: string;
  creator_bps: number;
  liquidity: string;
  vesting_end: string | null;
  status: string;
  created_at: string;
  /** Not indexed yet; shown when the API provides it. */
  holder_count?: number | null;
}

export interface AgentPost {
  id: number | string;
  mint: string;
  created_at: string;
  kind: string;
  body: string;
  snapshot: Record<string, unknown> | null;
  proposals: unknown[] | null;
  actions: unknown[] | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, { signal, headers: { accept: "application/json" } });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("The data service is unreachable.", 0);
  }
  if (!res.ok) {
    throw new ApiError(
      res.status === 404 ? "Not found." : `The data service returned an error (${res.status}).`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

export const paths = {
  markets: () => "/v1/markets",
  market: (mint: string) => `/v1/markets/${mint}`,
  offers: (mint: string, status: "live" | "recent", limit = 50) =>
    `/v1/markets/${mint}/offers?status=${status}&limit=${limit}`,
  offer: (offer: string) => `/v1/offers/${offer}`,
  chest: (mint: string, owner: string) => `/v1/markets/${mint}/chests/${owner}`,
  leaderboard: (mint: string, kind: LeaderboardKind, limit = 50) =>
    `/v1/markets/${mint}/leaderboards/${kind}?limit=${limit}`,
  treasury: (mint: string) => `/v1/markets/${mint}/treasury`,
  price: (mint: string, bucket: number, hours: number) => `/v1/markets/${mint}/price?bucket=${bucket}&hours=${hours}`,
  absorption: (mint: string) => `/v1/markets/${mint}/absorption`,
  tickets: (mint: string, seller: string) => `/v1/markets/${mint}/tickets/${seller}`,
  children: () => "/v1/children",
  child: (mint: string) => `/v1/children/${mint}`,
  agentPosts: (mint?: string, limit = 30) => `/v1/agent/posts?${mint ? `mint=${mint}&` : ""}limit=${limit}`,
};
