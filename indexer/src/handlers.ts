// Event → mutations. One function per event name; every mapping is pure so
// it can be unit-tested and replayed idempotently.

import { type EventContext, type Mutation, type Row, type Value, tsFromUnix } from "./mutations.js";

type D = Record<string, Value>;
type Handler = (d: D, c: EventContext) => Mutation[];

const s = (v: Value | undefined) => (v === null || v === undefined ? null : String(v));
const n = (v: Value | undefined) => (v === null || v === undefined ? null : Number(v));
const ev = (c: EventContext) => ({ signature: c.signature, event_index: c.eventIndex });
const time = (d: D, c: EventContext, field = "ts") => tsFromUnix(d[field]) ?? c.blockTime;
const ins = (table: string, row: Row, key = ["signature", "event_index"]): Mutation => ({ kind: "insert", table, key, row });
const ups = (table: string, key: string[], row: Row, c: EventContext): Mutation => ({
  kind: "upsert",
  table,
  key,
  row: { ...row, updated_slot: c.slot },
  slot: c.slot,
});
const patch = (table: string, where: Row, set: Row, c: EventContext): Mutation => ({
  kind: "patch",
  table,
  where,
  set,
  slot: c.slot,
});

const CHEST_KINDS = ["deposit", "withdraw", "harvest", "bid", "refund", "shield_in", "shield_out", "shield_reward"];

export const handlers: Record<string, Handler> = {
  // ------------------------------------------------------------- hook
  HookInitialized: () => [],
  HolderRegistered: (d, c) => [
    ups("holders", ["mint", "wallet"], { mint: s(d.mint), wallet: s(d.wallet), registered_at: time(d, c), balance: s(d.balance) }, c),
  ],
  HolderSynced: (d, c) => [
    ups("holders", ["mint", "wallet"], { mint: s(d.mint), wallet: s(d.wallet), balance: s(d.balance) }, c),
  ],
  TenureReset: (d, c) => [
    ups("holders", ["mint", "wallet"], { mint: s(d.mint), wallet: s(d.wallet), balance: s(d.balance), last_reset: time(d, c) }, c),
  ],
  TenureCredited: (d, c) => [
    ins("tenure_credits", { ...ev(c), mint: s(d.mint), wallet: s(d.wallet), credited: s(d.credited), ts: time(d, c) }),
  ],
  TransferTracked: () => [],
  RewardsDeposited: () => [],
  RewardsHarvested: () => [],
  EpochsAdvanced: () => [],
  HookParamsUpdated: () => [],
  AllowlistUpdated: (d, c) => [
    ins("governance_actions", { ...ev(c), mint: s(d.mint), kind: "allowlist", action_id: null, payload: d, ts: c.blockTime }),
  ],

  // ------------------------------------------------------------- core
  MarketInitialized: (d, c) => [
    ups(
      "markets",
      ["mint"],
      {
        mint: s(d.mint),
        quote_mint: s(d.quoteMint),
        parent: s(d.parent),
        governance: s(d.governance),
        supply: s(d.supply),
        created_at: time(d, c),
      },
      c,
    ),
  ],
  ParamsUpdated: (d, c) => [
    ins("param_changes", { ...ev(c), mint: s(d.mint), param: "all", old_value: null, new_value: null, by: s(d.by), agent: false, ts: c.blockTime }),
  ],
  ParamUpdated: (d, c) => [
    ins("param_changes", {
      ...ev(c),
      mint: s(d.mint),
      param: typeof d.param === "object" && d.param ? Object.keys(d.param)[0]! : s(d.param)!,
      old_value: s(d.oldValue),
      new_value: s(d.newValue),
      by: s(d.by),
      agent: Boolean(d.agent),
      ts: c.blockTime,
    }),
  ],
  PausesUpdated: (d, c) => [
    ins("governance_actions", { ...ev(c), mint: s(d.mint), kind: "pauses", action_id: null, payload: d, ts: c.blockTime }),
  ],
  FeesDistributed: (d, c) => [
    ins("fee_distributions", {
      ...ev(c),
      mint: s(d.mint),
      amount: s(d.amount),
      to_chests: s(d.toChests),
      to_shield: s(d.toShield),
      to_treasury: s(d.toTreasury),
      to_parent: s(d.toParent),
      ts: time(d, c),
    }),
  ],
  FeeSwap: (d, c) => [
    ins("fee_swaps", {
      ...ev(c),
      mint: s(d.mint),
      kind: n(d.kind),
      amount_in: s(d.amountIn),
      amount_out: s(d.amountOut),
      oracle_min_out: s(d.oracleMinOut),
      ts: time(d, c),
    }),
  ],
  Redeemed: (d, c) => [
    ins("redemptions", {
      ...ev(c),
      mint: s(d.mint),
      wallet: s(d.wallet),
      tokens: s(d.tokens),
      gross_lamports: s(d.grossLamports),
      fee_lamports: s(d.feeLamports),
      net_lamports: s(d.netLamports),
      treasury_lamports_after: s(d.treasuryLamportsAfter),
      circulating_before: s(d.circulatingBefore),
      ts: time(d, c),
    }),
  ],
  TreasurySnapshot: (d, c) => [
    ins("treasury", {
      ...ev(c),
      mint: s(d.mint),
      ts: time(d, c),
      treasury_lamports: s(d.treasuryLamports),
      circulating: s(d.circulating),
      floor_price: s(d.floorPrice),
    }),
  ],
  ActionQueued: (d, c) => [
    ins("governance_actions", { ...ev(c), mint: s(d.mint), kind: "queued", action_id: s(d.id), payload: d, ts: c.blockTime }),
  ],
  ActionExecuted: (d, c) => [
    ins("governance_actions", { ...ev(c), mint: s(d.mint), kind: "executed", action_id: s(d.id), payload: d, ts: c.blockTime }),
  ],
  ActionCancelled: (d, c) => [
    ins("governance_actions", { ...ev(c), mint: s(d.mint), kind: "cancelled", action_id: s(d.id), payload: d, ts: c.blockTime }),
  ],
  ExternalRewardsDeposited: () => [],

  // -------------------------------------------------------------- amm
  PoolInitialized: () => [],
  Swapped: (d, c) => [
    ins("prices", {
      ...ev(c),
      mint: s(d.mint),
      ts: time(d, c),
      side: n(d.side),
      trader: s(d.trader),
      base_amount: s(d.baseAmount),
      quote_amount: s(d.quoteAmount),
      fee: s(d.fee),
      base_reserve: s(d.baseReserve),
      quote_reserve: s(d.quoteReserve),
      price: s(d.price),
    }),
  ],

  // ----------------------------------------------------------- offers
  OfferCreated: (d, c) => [
    ups(
      "offers",
      ["offer"],
      {
        offer: s(d.offer),
        mint: s(d.mint),
        id: s(d.id),
        seller: s(d.seller),
        amount: s(d.amount),
        lots: n(d.lots),
        lot_size: s(d.lotSize),
        lot_cost: s(d.lotCost),
        twap: s(d.twap),
        fill_price: s(d.fillPrice),
        discount_bps: n(d.discountBps),
        momentum_bps: s(d.momentumBps),
        seller_lot_tenure: s(d.sellerLotTenure),
        message: s(d.message),
        created_at: tsFromUnix(d.createdAt),
        expires_at: tsFromUnix(d.expiresAt),
        status: "open",
      },
      c,
    ),
  ],
  BidPlaced: (d, c) => [
    ins(
      "bids",
      {
        bid: s(d.bid),
        offer: s(d.offer),
        mint: s(d.mint),
        bidder: s(d.bidder),
        kind: n(d.kind),
        amount: s(d.amount),
        capacity: s(d.capacity),
        prefix: s(d.prefix),
        created_at: time(d, c),
        signature: c.signature,
      },
      ["bid"],
    ),
    patch("offers", { offer: s(d.offer) }, { total_capacity: s(d.totalCapacity) }, c),
  ],
  BiddingClosed: (d, c) => [
    patch("offers", { offer: s(d.offer) }, { status: "closing", rand_slot: s(d.randSlot), closed_early: Boolean(d.early) }, c),
  ],
  OfferSettled: (d, c) => [
    patch(
      "offers",
      { offer: s(d.offer) },
      {
        status: "settled",
        shield_lots: n(d.shieldLots),
        bidder_lots: n(d.bidderLots),
        total_capacity: s(d.totalCapacity),
        random_offset: s(d.randomOffset),
        seed: s(d.seed),
        proceeds: s(d.proceeds),
        fee: s(d.fee),
        seller_net: s(d.sellerNet),
        remainder_tokens: s(d.remainderTokens),
        ticket_amount: s(d.ticketAmount),
        settled_at: time(d, c),
      },
      c,
    ),
  ],
  RemainderSold: (d, c) => [patch("offers", { offer: s(d.offer) }, { remainder_proceeds: s(d.quoteOut) }, c)],
  BidClaimed: (d, c) => [
    ins(
      "fills",
      {
        bid: s(d.bid),
        offer: s(d.offer),
        mint: s(d.mint),
        bidder: s(d.bidder),
        kind: n(d.kind),
        lots: s(d.lots),
        tokens: s(d.tokens),
        cost: s(d.cost),
        refund: s(d.refund),
        tenure_credited: s(d.tenureCreditedRaw),
        ts: time(d, c),
        signature: c.signature,
      },
      ["bid"],
    ),
  ],
  TicketIssued: (d, c) => [
    ups(
      "tickets",
      ["mint", "seller", "offer_id"],
      {
        mint: s(d.mint),
        seller: s(d.seller),
        offer_id: s(d.offerId),
        amount: s(d.amount),
        remaining: s(d.amount),
        expires_at: tsFromUnix(d.expiresAt),
      },
      c,
    ),
  ],
  TicketUsed: (d, c) => [
    patch("tickets", { mint: s(d.mint), seller: s(d.seller), offer_id: s(d.offerId) }, { remaining: s(d.remaining) }, c),
  ],
  OfferClosed: (d, c) => [patch("offers", { offer: s(d.offer) }, { status: "closed", closed_at: c.blockTime }, c)],

  // ------------------------------------------------------------ chest
  ChestEvent: (d, c) => [
    ins("chest_events", {
      ...ev(c),
      mint: s(d.mint),
      owner: s(d.owner),
      kind: n(d.kind),
      assets: s(d.assets),
      shares_delta: s(d.sharesDelta),
      penalty: s(d.penalty),
      balance_after: s(d.balanceAfter),
      lock_until: tsFromUnix(d.lockUntil),
      ts: time(d, c),
    }),
    ups(
      "chests",
      ["mint", "owner"],
      {
        mint: s(d.mint),
        owner: s(d.owner),
        balance: s(d.balanceAfter),
        lock_until: tsFromUnix(d.lockUntil),
        updated_at: time(d, c),
      },
      c,
    ),
  ],
  GrantUpdated: (d, c) => [
    ups(
      "grants",
      ["mint", "owner"],
      {
        mint: s(d.mint),
        owner: s(d.owner),
        enabled: Boolean(d.enabled),
        max_per_offer: s(d.maxPerOffer),
        max_per_day: s(d.maxPerDay),
        min_discount_bps: n(d.minDiscountBps),
        reserve_floor: s(d.reserveFloor),
      },
      c,
    ),
  ],
  AutoBid: () => [],
  ShieldAbsorbed: (d, c) => [
    ins("shield_events", {
      ...ev(c),
      mint: s(d.mint),
      kind: "absorbed",
      offer: s(d.offer),
      lots: s(d.lots),
      quote: s(d.quoteSpent),
      tokens: s(d.tokensGained),
      total_deposits_after: s(d.totalDepositsAfter),
      ts: time(d, c),
    }),
  ],
  ShieldRewardsSynced: (d, c) => [
    ins("shield_events", {
      ...ev(c),
      mint: s(d.mint),
      kind: "rewards",
      offer: null,
      lots: null,
      quote: s(d.amount),
      tokens: null,
      total_deposits_after: null,
      ts: time(d, c),
    }),
  ],
  ShieldPositionEvent: (d, c) => {
    const kind = n(d.kind);
    const row: Row = {
      mint: s(d.mint),
      owner: s(d.owner),
      id: n(d.id),
      principal: s(d.principal),
      multiplier_bps: n(d.multiplierBps),
      lock_end: tsFromUnix(d.lockEnd),
      status: kind === 2 ? "withdrawn" : "locked",
    };
    return [
      ups("shield_positions", ["mint", "owner", "id"], row, c),
      ins("shield_events", {
        ...ev(c),
        mint: s(d.mint),
        kind: ["open", "claim", "withdraw"][kind ?? 0] ?? "position",
        offer: null,
        lots: null,
        quote: s(d.rewards),
        tokens: s(d.tokens),
        total_deposits_after: null,
        ts: time(d, c),
      }),
    ];
  },
  YieldEvent: (d, c) => [
    ins("yield_events", {
      ...ev(c),
      mint: s(d.mint),
      kind: n(d.kind),
      amount: s(d.amount),
      adapter_value: s(d.adapterValue),
      idle_assets: s(d.idleAssets),
      ts: time(d, c),
    }),
  ],

  // -------------------------------------------------------- launchpad
  ChildLaunched: (d, c) => [
    ups(
      "child_tokens",
      ["mint"],
      {
        mint: s(d.mint),
        parent: s(d.parent),
        creator: s(d.creator),
        name: s(d.name),
        symbol: s(d.symbol),
        uri: s(d.uri),
        supply: s(d.supply),
        creator_bps: n(d.creatorBps),
        liquidity: s(d.liquidity),
        vesting_end: tsFromUnix(d.vestingEnd),
        status: "live",
        created_at: time(d, c),
      },
      c,
    ),
  ],
};

export { CHEST_KINDS };

/** Map one decoded event to mutations (+ the raw event row). */
export function eventToMutations(program: string, name: string, data: D, c: EventContext): Mutation[] {
  const raw = ins("raw_events", {
    signature: c.signature,
    event_index: c.eventIndex,
    slot: c.slot,
    block_time: c.blockTime,
    program,
    name,
    data,
  });
  const h = handlers[name];
  return h ? [raw, ...h(data, c)] : [raw];
}
