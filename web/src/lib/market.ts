"use client";

import "./polyfills";

import { MarketClient, WSOL, ata2022, ataClassic } from "@backstop/sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";

import { type MarketRow, paths } from "./api";
import { config } from "./config";
import { type UiParams, defaultParams } from "./estimates";
import { USDC_DECIMALS, toBig } from "./format";
import { useApi } from "./use-api";

const DEFAULT_PUBKEY = "11111111111111111111111111111111";

export interface MarketInfo {
  mint: string;
  quoteMint: string;
  quoteDecimals: number;
  quoteSymbol: string;
  supply: bigint;
}

export function quoteInfo(quoteMint: string | null | undefined): { decimals: number; symbol: string } {
  return quoteMint === WSOL.toBase58() ? { decimals: 9, symbol: "SOL" } : { decimals: USDC_DECIMALS, symbol: "USDC" };
}

export function isValidAddress(v: string | null | undefined): v is string {
  if (!v) return false;
  try {
    new PublicKey(v);
    return true;
  } catch {
    return false;
  }
}

function toInfo(mint: string, row: MarketRow | undefined, quoteOverride?: string): MarketInfo {
  const quoteMint = quoteOverride || row?.quote_mint || "";
  const q = quoteInfo(quoteMint);
  return {
    mint,
    quoteMint,
    quoteDecimals: q.decimals,
    quoteSymbol: q.symbol,
    supply: row?.supply ? toBig(row.supply) : 1_000_000_000n * 10n ** 9n,
  };
}

/** The BACKSTOP market: NEXT_PUBLIC_MINT, or the root market listed by the API. */
export function useRootMarket(): {
  market: MarketInfo | null;
  loading: boolean;
  error: Error | undefined;
  refresh: () => void;
} {
  const markets = useApi<MarketRow[]>(paths.markets(), { refreshMs: 120_000 });
  const refresh = markets.refresh;
  const state = useMemo(() => {
    const rows = markets.data ?? [];
    if (config.mint) {
      const row = rows.find((r) => r.mint === config.mint);
      return { market: toInfo(config.mint, row, config.quoteMint), loading: false, error: undefined };
    }
    const root = rows.find((r) => !r.parent || r.parent === DEFAULT_PUBKEY) ?? rows[0];
    if (root) return { market: toInfo(root.mint, root), loading: false, error: undefined };
    return {
      market: null,
      loading: markets.loading,
      error: markets.error ?? (markets.data ? new Error("No market is indexed yet.") : undefined),
    };
  }, [markets.data, markets.error, markets.loading]);
  return { ...state, refresh: () => void refresh() };
}

/** Any market by mint (children use SOL as quote). */
export function useMarketInfo(mint: string | null): MarketInfo | null {
  const markets = useApi<MarketRow[]>(paths.markets(), { refreshMs: 120_000 });
  return useMemo(() => {
    if (!mint) return null;
    const row = markets.data?.find((r) => r.mint === mint);
    return toInfo(mint, row, mint === config.mint ? config.quoteMint : undefined);
  }, [mint, markets.data]);
}

// ------------------------------------------------------- on-chain params

const paramCache = new Map<string, Promise<UiParams | null>>();

function loadParams(mint: string, quoteMint: string): Promise<UiParams | null> {
  const key = mint;
  let p = paramCache.get(key);
  if (!p) {
    p = (async () => {
      if (!isValidAddress(mint) || !isValidAddress(quoteMint)) return null;
      const client = new MarketClient(new Connection(config.rpcUrl, "confirmed"), {
        mint: new PublicKey(mint),
        quoteMint: new PublicKey(quoteMint),
      });
      const m = await client.fetchMarket();
      const x = m.params as unknown as Record<string, { toString(): string } | number>;
      const num = (k: string) => Number(x[k]?.toString() ?? 0);
      const big = (k: string) => BigInt(x[k]?.toString() ?? "0");
      return {
        tradeFeeBps: num("tradeFeeBps"),
        splitChestBps: num("splitChestBps"),
        splitShieldBps: num("splitShieldBps"),
        baseDiscountBps: num("baseDiscountBps"),
        kUpBps: num("kUpBps"),
        kDownBps: num("kDownBps"),
        minDiscountBps: num("minDiscountBps"),
        maxDiscountBps: num("maxDiscountBps"),
        offerWindowSecs: num("offerWindowSecs"),
        bidEpochSecs: num("bidEpochSecs"),
        minOfferSize: big("minOfferSize"),
        lotsPerOffer: num("lotsPerOffer"),
        ticketValiditySecs: num("ticketValiditySecs"),
        chestLockSecs: num("chestLockSecs"),
        chestPenaltyBps: num("chestPenaltyBps"),
        redemptionFeeBps: num("redemptionFeeBps"),
        shieldPerOfferCap: big("shieldPerOfferCap"),
        shieldMaxShareBps: num("shieldMaxShareBps"),
        shieldMinLockSecs: num("shieldMinLockSecs"),
        shieldMaxMultiplierBps: num("shieldMaxMultiplierBps"),
        priceTwapWindowSecs: num("priceTwapWindowSecs"),
        momentumLookbackSecs: num("momentumLookbackSecs"),
        directSellHourlyCap: big("directSellHourlyCap"),
      } satisfies UiParams;
    })().catch(() => {
      // Retry on the next mount after a failure (RPC may come back).
      window.setTimeout(() => paramCache.delete(key), 30_000);
      return null;
    });
    paramCache.set(key, p);
  }
  return p;
}

/**
 * Market parameters from chain, falling back to protocol defaults while
 * loading or when the RPC is unavailable (`onChain` tells which).
 */
export function useMarketParams(market: MarketInfo | null): { params: UiParams; onChain: boolean } {
  const fallback = useMemo(
    () => defaultParams(market?.supply, market?.quoteDecimals ?? USDC_DECIMALS),
    [market?.supply, market?.quoteDecimals],
  );
  const [loaded, setLoaded] = useState<UiParams | null>(null);
  useEffect(() => {
    let alive = true;
    if (!market) return;
    void loadParams(market.mint, market.quoteMint).then((p) => {
      if (alive) setLoaded(p);
    });
    return () => {
      alive = false;
    };
  }, [market]);
  return loaded ? { params: loaded, onChain: true } : { params: fallback, onChain: false };
}

// ------------------------------------------------------------ SOL / USD

let solUsdCache: { at: number; value: number | null } | null = null;
let solUsdInflight: Promise<number | null> | null = null;

async function fetchSolUsd(): Promise<number | null> {
  if (!config.solPriceUrl) return null;
  if (solUsdCache && Date.now() - solUsdCache.at < 60_000) return solUsdCache.value;
  if (solUsdInflight) return solUsdInflight;
  solUsdInflight = (async () => {
    try {
      const res = await fetch(config.solPriceUrl);
      if (!res.ok) return null;
      const body = (await res.json()) as Record<string, unknown>;
      const id = WSOL.toBase58();
      const v3 = body[id] as { usdPrice?: number } | undefined;
      const v2 = (body.data as Record<string, { price?: string | number }> | undefined)?.[id];
      const n = Number(v3?.usdPrice ?? v2?.price);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    } finally {
      solUsdInflight = null;
    }
  })().then((value) => {
    solUsdCache = { at: Date.now(), value };
    return value;
  });
  return solUsdInflight;
}

/** SOL/USD reference price (used only to draw the floor on USDC charts). */
export function useSolUsd(): number | null {
  const [v, setV] = useState<number | null>(solUsdCache?.value ?? null);
  useEffect(() => {
    let alive = true;
    void fetchSolUsd().then((n) => alive && setV(n));
    return () => {
      alive = false;
    };
  }, []);
  return v;
}

// --------------------------------------------------------- wallet balances

export interface Balances {
  sol: bigint | null;
  token: bigint | null;
  quote: bigint | null;
}

export function useWalletBalances(market: MarketInfo | null): Balances & { refresh: () => void } {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [state, setState] = useState<{ key: string; b: Balances } | null>(null);
  const [n, setN] = useState(0);
  const refresh = useCallback(() => setN((x) => x + 1), []);
  const key = publicKey && market && isValidAddress(market.mint) ? `${publicKey.toBase58()}:${market.mint}` : null;

  useEffect(() => {
    let alive = true;
    if (!key || !publicKey || !market) return;
    const tokenBal = async (ata: PublicKey) => {
      try {
        const r = await connection.getTokenAccountBalance(ata, "confirmed");
        return BigInt(r.value.amount);
      } catch (e) {
        // Missing account = zero balance; anything else = unknown.
        return /could not find account|Invalid param/i.test(String(e)) ? 0n : null;
      }
    };
    void (async () => {
      const mint = new PublicKey(market.mint);
      const [sol, token, quote] = await Promise.all([
        connection.getBalance(publicKey, "confirmed").then(BigInt, () => null),
        tokenBal(ata2022(publicKey, mint)),
        isValidAddress(market.quoteMint) ? tokenBal(ataClassic(publicKey, new PublicKey(market.quoteMint))) : null,
      ]);
      if (alive) setState({ key, b: { sol, token, quote } });
    })();
    return () => {
      alive = false;
    };
  }, [connection, publicKey, market, key, n]);

  const b = state && state.key === key ? state.b : { sol: null, token: null, quote: null };
  return { ...b, refresh };
}
