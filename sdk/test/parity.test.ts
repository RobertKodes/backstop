import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { allocateLots, discountBps, multiplierBps, pda, quoteBuy } from "../src/index.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/parity.json", import.meta.url), "utf8")) as {
  mint: string;
  wallet: string;
  pdas: Record<string, string>;
  allocate: number[][];
  discount: number[][];
  buy: string[][];
  multiplier: [string, string, number][];
};

describe("Rust ↔ TS parity", () => {
  const mint = new PublicKey(fx.mint);
  const wallet = new PublicKey(fx.wallet);
  const offer = pda.offer(mint, 7);
  const ours: Record<string, PublicKey> = {
    hookConfig: pda.hookConfig(mint),
    extraAccountMetas: pda.extraAccountMetas(mint),
    holder: pda.holder(mint, wallet),
    rewardState: pda.rewardState(mint),
    market: pda.market(mint),
    treasury: pda.treasury(mint),
    agent: pda.agent(mint),
    timelock: pda.timelock(mint, 3),
    parentVault: pda.parentVault(mint),
    pool: pda.pool(mint),
    book: pda.book(mint),
    offer,
    bid: pda.bid(offer, wallet, 2),
    ticket: pda.ticket(mint, wallet, 7),
    chestMarket: pda.chestMarket(mint),
    chest: pda.chest(mint, wallet),
    grant: pda.grant(mint, wallet),
    shield: pda.shield(mint),
    shieldPosition: pda.shieldPosition(mint, wallet, 5),
    rewardsVaultAuthority: pda.rewardsVaultAuthority(mint),
    shieldRewardsVault: pda.shieldRewardsVault(mint),
    launchpad: pda.launchpad(),
    child: pda.child(mint),
    vesting: pda.vesting(mint),
    childMintAuthority: pda.childMintAuthority(mint),
  };

  it("derives every PDA exactly like backstop-common", () => {
    for (const [k, v] of Object.entries(fx.pdas)) expect(ours[k]?.toBase58(), k).toBe(v);
    expect(Object.keys(ours).sort()).toEqual(Object.keys(fx.pdas).sort());
  });

  it("allocates lots exactly like backstop-math", () => {
    for (const [p, c, t, a, o, n] of fx.allocate) {
      expect(allocateLots(BigInt(p!), BigInt(c!), BigInt(t!), BigInt(a!), BigInt(o!))).toBe(BigInt(n!));
    }
  });

  it("computes the counter-cyclical discount exactly", () => {
    for (const [m, d] of fx.discount) expect(discountBps(m!)).toBe(d);
  });

  it("quotes AMM buys exactly", () => {
    for (const [q, b, r, fee, out] of fx.buy) {
      const x = quoteBuy(BigInt(q!), BigInt(b!), BigInt(r!), 300);
      expect(x.fee).toBe(BigInt(fee!));
      expect(x.out).toBe(BigInt(out!));
    }
  });

  it("computes tenure multipliers exactly", () => {
    for (const [b, t, m] of fx.multiplier) expect(multiplierBps(BigInt(b), BigInt(t), 90 * 86_400, 20_000)).toBe(m);
  });
});
