// Deterministic API fixtures shaped exactly like api/src/repo.ts rows.
// Amounts are raw base units: token 9 decimals, USDC 6, SOL 9; prices are
// quote base units per token base unit × 1e18.

export const A = {
  mint: "LmHQDLm9kZWsakph1wvavr1ukikBGQaThTPSPyK9Bof",
  quote: "3qmDhMa92nYu2w1bq51vMKQEwdW7FKo9JjWEEbsyJVYa",
  offer1: "6Lm9zVoWupYHCHGNy85v7hxLnUYS273HRKYMWU7bPYju",
  offer2: "8qm6He2tnrXfMdXA7ALrz27zeE8EZVkPYnW2NbhjoXtt",
  offer3: "BLm2anGGftX3WxaBXoay23Cz1XinSrdwBDGf94fAfgGD",
  seller1: "DqkxsvVeR44hUnLUaLkXEvYTHbArFJhgkjEtK5nQCigr",
  seller2: "GLktyQ2Xg5BxLHYBxVvWe8iQ2FfKwCpzNgzf6TQQqu83",
  wallet: "YXAq7jnveTCHrWLzuvgTZAJeEMMCTU38vTMcY77PBmn",
  bidder1: "43X78FyAogSaTCm88xzgDwiXg78iGWrbyxWCQk1mYVWh",
  bidder2: "6YX3RQCYgiRxcZ1uH24fzKj22HDHdi1SfYhabs1MkBN6",
  bidder3: "93WyiYRvZkRLmuGgR4KcreSHNhkqagorE1VzYjqY3Xs1",
  child1: "BYWv1gfJSnQiwEKhqhZitfXGk1MPU3hPrSGdKCnxugEL",
  child2: "E3WrJptgBwxNu45ztEjH7Yrk24oTGVm9RxErVDvAxjNd",
  creator1: "GYWnQJRZSy5dkZHiGPuGWm2gkjHvxPtT3uzdGbYD5u6A",
  creator2: "kH4G28phYLsi8FsJouSLBUbNhyxDeXVp9TKngEudBju",
  holder1: "4FGzZANCaaLFsUWeSryS6a2pQaPzZuGbARcUbMpGnKRv",
  holder2: "6kGvrJbaTcKe2pmRav3Rrx3Jkkqteu4uLmhYn199zBLD",
  holder3: "9FGs9SpxLeK2CB2CixJNjGka7BPSbssJuEVxisyLHXq8",
} as const;

/** Bytes of A.wallet (used by the mock Wallet Standard wallet). */
export const WALLET_BYTES = [
  8, 19, 30, 41, 52, 63, 74, 85, 96, 107, 118, 129, 140, 151, 162, 173, 184, 195, 206, 217, 228, 239, 250, 5, 16, 27,
  38, 49, 60, 71, 82, 93,
];

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** 0.05 USDC per token. */
export const PRICE = "50000000000000";
/** 0.0002 SOL per token. */
export const FLOOR = "200000000000000";
export const SOL_USD = 150;

export function markets() {
  return [
    {
      mint: A.mint,
      quote_mint: A.quote,
      parent: "11111111111111111111111111111111",
      governance: A.holder1,
      supply: "1000000000000000000",
      created_at: iso(Date.now() - 60 * DAY),
    },
    {
      mint: A.child1,
      quote_mint: "So11111111111111111111111111111111111111112",
      parent: A.mint,
      governance: A.creator1,
      supply: "1000000000000000000",
      created_at: iso(Date.now() - 60 * DAY),
    },
  ];
}

export function marketStats() {
  return {
    price: {
      price: PRICE,
      base_reserve: "300000000000000000",
      quote_reserve: "15000000000000",
      ts: iso(Date.now() - 30_000),
    },
    absorbedToday: {
      holdersTokens: "1250000000000000",
      holdersQuote: "58000000000",
      shieldTokens: "400000000000000",
      shieldQuote: "18500000000",
    },
    volume24h: "820000000000",
    liveOffers: 2,
    floor: {
      treasury_lamports: "120000000000000",
      circulating: "600000000000000000",
      floor_price: FLOOR,
      ts: iso(Date.now() - 3_600_000),
    },
  };
}

export function offer(over: Partial<Record<string, unknown>> & { offer: string; id: string }) {
  const now = Date.now();
  return {
    mint: A.mint,
    seller: A.seller1,
    amount: "500000000000000",
    lots: 100,
    lot_size: "5000000000000",
    lot_cost: "234500000",
    twap: PRICE,
    fill_price: "46900000000000",
    discount_bps: 620,
    momentum_bps: "-800",
    seller_lot_tenure: "0",
    message: null,
    created_at: iso(now - 3 * 60_000),
    expires_at: iso(now + 7 * 60_000),
    status: "open",
    total_capacity: "64",
    bid_count: 5,
    ...over,
  };
}

export function liveOffers() {
  const now = Date.now();
  return [
    offer({
      offer: A.offer2,
      id: "41",
      seller: A.seller2,
      expires_at: iso(now + 3 * 60_000 + 20_000),
      created_at: iso(now - 6 * 60_000),
      total_capacity: "120",
      bid_count: 9,
      message: "Need cash for a house, still holding the rest",
      discount_bps: 480,
      fill_price: "47600000000000",
    }),
    offer({ offer: A.offer1, id: "42", message: "selling this sh1t to pay rent" }),
  ];
}

export function offerDetail(key: string) {
  const o = liveOffers().find((x) => x.offer === key) ?? offer({ offer: key, id: "40", status: "settled" });
  const now = Date.now();
  return {
    offer: o,
    bids: [
      {
        bid: A.offer3,
        offer: key,
        mint: A.mint,
        bidder: A.bidder1,
        kind: 1,
        amount: "7035000000",
        capacity: "30",
        prefix: "0",
        created_at: iso(now - 150_000),
        signature: "sig1",
      },
      {
        bid: A.holder3,
        offer: key,
        mint: A.mint,
        bidder: A.bidder2,
        kind: 0,
        amount: "4690000000",
        capacity: "20",
        prefix: "30",
        created_at: iso(now - 100_000),
        signature: "sig2",
      },
      {
        bid: A.holder2,
        offer: key,
        mint: A.mint,
        bidder: A.bidder3,
        kind: 2,
        amount: "3283000000",
        capacity: "14",
        prefix: "50",
        created_at: iso(now - 60_000),
        signature: "sig3",
      },
    ],
    fills: [],
  };
}

export function absorption() {
  return { shieldDeposits: "450000000000", autoAbsorbPerOffer: "38000000000", activeGrants: 12 };
}

export function candles(bucketSecs: number, hours: number) {
  const n = Math.min(400, Math.floor((hours * 3600) / bucketSecs));
  const end = Math.floor(Date.now() / 1000 / bucketSecs) * bucketSecs;
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = (end - i * bucketSecs) * 1000;
    const k = 1 + 0.03 * Math.sin(i / 17) - 0.01 * Math.cos(i / 5);
    const close = BigInt(Math.round(5e13 * k)).toString();
    out.push({ bucket: iso(t), open: close, high: close, low: close, close, volume: "1200000000" });
  }
  return out;
}

export function chest(owner: string) {
  const now = Date.now();
  return {
    chest: {
      mint: A.mint,
      owner,
      balance: "1500000000",
      lock_until: iso(now + 20 * DAY),
      updated_at: iso(now - 40 * DAY),
    },
    events: [
      {
        signature: "e3",
        event_index: 0,
        mint: A.mint,
        owner,
        kind: 2,
        assets: "12500000",
        shares_delta: "12000000",
        penalty: "0",
        balance_after: "1500000000",
        lock_until: iso(now + 20 * DAY),
        ts: iso(now - 5 * DAY),
      },
      {
        signature: "e2",
        event_index: 0,
        mint: A.mint,
        owner,
        kind: 3,
        assets: "512500000",
        shares_delta: "-500000000",
        penalty: "0",
        balance_after: "1487500000",
        lock_until: iso(now + 20 * DAY),
        ts: iso(now - 20 * DAY),
      },
      {
        signature: "e1",
        event_index: 0,
        mint: A.mint,
        owner,
        kind: 0,
        assets: "2000000000",
        shares_delta: "2000000000",
        penalty: "0",
        balance_after: "2000000000",
        lock_until: iso(now + 20 * DAY),
        ts: iso(now - 40 * DAY),
      },
    ],
    grant: {
      mint: A.mint,
      owner,
      enabled: true,
      max_per_offer: "250000000",
      max_per_day: "1000000000",
      min_discount_bps: 500,
      reserve_floor: "200000000",
    },
    shield: [
      {
        mint: A.mint,
        owner,
        id: 0,
        principal: "1000000000",
        multiplier_bps: 20000,
        lock_end: iso(now + 45 * DAY),
        claimed_tokens: "0",
        claimed_rewards: "3500000",
        status: "locked",
      },
    ],
  };
}

export function leaderboard(kind: string) {
  const now = Date.now();
  if (kind === "tenure")
    return [
      {
        wallet: A.holder1,
        balance: "25000000000000000",
        tenure: String(25_000_000n * 10n ** 9n * 7_776_000n),
        multiplier_bps: 30000,
        ts: iso(now),
      },
      {
        wallet: A.holder2,
        balance: "12000000000000000",
        tenure: String(12_000_000n * 10n ** 9n * 3_888_000n),
        multiplier_bps: 20000,
        ts: iso(now),
      },
      {
        wallet: A.wallet,
        balance: "800000000000000",
        tenure: String(800_000n * 10n ** 9n * 864_000n),
        multiplier_bps: 12222,
        ts: iso(now),
      },
    ];
  if (kind === "absorbers")
    return [
      { wallet: A.bidder1, tokens: "9000000000000000", quote: "410000000000", fills: 37 },
      { wallet: A.bidder2, tokens: "4100000000000000", quote: "190000000000", fills: 18 },
    ];
  return [
    { wallet: A.holder3, principal: "120000000000", weighted: "720000000000", positions: 2 },
    { wallet: A.holder1, principal: "60000000000", weighted: "120000000000", positions: 1 },
  ];
}

export function treasury() {
  const now = Date.now();
  const history = Array.from({ length: 30 }, (_, i) => {
    const lamports = 90_000n * 10n ** 9n + BigInt(i) * 1_000n * 10n ** 9n;
    const circ = 600_000_000n * 10n ** 9n;
    return {
      ts: iso(now - (29 - i) * DAY),
      treasury_lamports: lamports.toString(),
      circulating: circ.toString(),
      floor_price: ((lamports * 10n ** 18n) / circ).toString(),
    };
  });
  history[29] = {
    ts: iso(now - 3_600_000),
    treasury_lamports: "120000000000000",
    circulating: "600000000000000000",
    floor_price: FLOOR,
  };
  return {
    latest: history[29],
    history,
    redemptions: [
      {
        signature: "r1",
        event_index: 0,
        mint: A.mint,
        wallet: A.holder2,
        tokens: "1000000000000",
        gross_lamports: "200000000",
        fee_lamports: "2000000",
        net_lamports: "198000000",
        treasury_lamports_after: "119999800000000",
        circulating_before: "600001000000000000",
        ts: iso(now - 2 * DAY),
      },
    ],
  };
}

export function tickets(seller: string) {
  return [
    {
      mint: A.mint,
      seller,
      offer_id: "37",
      amount: "300000000000000",
      remaining: "300000000000000",
      expires_at: iso(Date.now() + 5 * DAY),
    },
  ];
}

export function children() {
  const now = Date.now();
  return [
    {
      mint: A.child1,
      parent: A.mint,
      creator: A.wallet,
      name: "Harbor",
      symbol: "HRBR",
      uri: "https://example.org/hrbr.json",
      supply: "1000000000000000000",
      creator_bps: 300,
      liquidity: "12000000000",
      vesting_end: iso(now + 30 * DAY),
      status: "live",
      created_at: iso(now - 60 * DAY),
    },
    {
      mint: A.child2,
      parent: A.mint,
      creator: A.creator2,
      name: "Lantern",
      symbol: "LNTN",
      uri: "https://example.org/lntn.json",
      supply: "500000000000000000",
      creator_bps: 0,
      liquidity: "5000000000",
      vesting_end: null,
      status: "live",
      created_at: iso(now - 3 * DAY),
    },
  ];
}

export function agentPosts() {
  const now = Date.now();
  // Shapes follow agent/src/policy.ts (Decision) and agent/src/store.ts (Action).
  return [
    {
      id: 3,
      mint: A.mint,
      created_at: iso(now - 2 * 3_600_000),
      kind: "narration",
      body: "Offers cleared at an average 5.4% discount over the last epoch. The Shield took 31% of absorbed lots.",
      snapshot: { liveOffers: 2, volume24h: "820000000000", shieldDeposits: "450000000000" },
      proposals: [
        {
          kind: "execute",
          param: "shieldPerOfferCap",
          paramIndex: 3,
          current: "10000000000",
          requested: "14000000000",
          value: "12500000000",
          clamped: true,
          reason: "within agent bounds",
          rationale: "Shield deposits grew 30% this week while offers got larger.",
        },
        {
          kind: "governance",
          param: "chestPenaltyBps",
          paramIndex: 9,
          current: "2500",
          requested: "2000",
          value: "2000",
          clamped: false,
          reason: "parameter is not agent-tunable",
          rationale: "Early withdrawals are rare.",
        },
      ],
      actions: [{ param: "shieldPerOfferCap", value: "12500000000", status: "dry_run" }],
    },
    {
      id: 2,
      mint: A.mint,
      created_at: iso(now - 26 * 3_600_000),
      kind: "narration",
      body: "Daily review: 14 offers, 92% absorbed by holders and the Shield, 8% sold on the AMM.",
      snapshot: { offers: 14, absorbedShare: 0.92 },
      proposals: [],
      actions: [],
    },
  ];
}
