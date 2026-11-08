// Keeper jobs. Work is discovered from chain state (getProgramAccounts with
// memcmp filters) so the keeper does not depend on our indexer — anyone can
// run it with the same results.

import { createHash } from "node:crypto";
import {
  ataClassic,
  BID_KIND,
  IDLS,
  INLINE_CATCH_UP,
  JupiterClient,
  type MarketClient,
  PROGRAM_IDS,
  pda,
  podU128,
  TOKEN_2022,
  TOKEN_PROGRAM,
  WSOL,
} from "@backstop/sdk";
import { createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { type AccountMeta, type GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import bs58 from "bs58";
import type { Logger } from "pino";
import type { Config, MarketCfg } from "./config.js";
import { autoBidAmount, chunkPlan, holdersToCheckpoint, nextOfferAction, shuffle } from "./planner.js";
import type { Sender } from "./tx.js";

const disc = (program: keyof typeof IDLS, name: string) => {
  const acc = (IDLS[program] as unknown as { accounts: { name: string; discriminator: number[] }[] }).accounts.find((a) => a.name === name);
  if (!acc) throw new Error(`no account ${name}`);
  return bs58.encode(Buffer.from(acc.discriminator));
};

const memcmp = (offset: number, bytes: string): GetProgramAccountsFilter => ({ memcmp: { offset, bytes } });

export interface JobContext {
  cfg: Config;
  market: MarketCfg;
  client: MarketClient;
  sender: Sender;
  log: Logger;
}

const keeperKey = (c: JobContext) => c.cfg.keeper.publicKey;
const now = () => Math.floor(Date.now() / 1000);

// ------------------------------------------------------------ settlement

export async function settleOffers(c: JobContext): Promise<number> {
  const { client } = c;
  const accounts = await client.connection.getProgramAccounts(PROGRAM_IDS.offers, {
    filters: [memcmp(0, disc("offers", "Offer")), memcmp(18, client.mint.toBase58())],
  });
  const slot = await client.connection.getSlot("confirmed");
  const t = (await client.connection.getBlockTime(slot)) ?? now();
  let done = 0;
  for (const { pubkey, account } of accounts) {
    const o = client.programs.offers.coder.accounts.decode("offer", account.data);
    const id = BigInt(o.id.toString());
    const action = nextOfferAction(
      {
        status: o.status,
        createdAt: o.createdAt.toNumber(),
        expiresAt: o.expiresAt.toNumber(),
        coveredAt: o.coveredAt.toNumber(),
        bidEpochSecs: o.bidEpochSecs,
        randSlot: o.randSlot.toNumber(),
        remainderSold: o.remainderSold,
        bidCount: o.bidCount,
        claimedCount: o.claimedCount,
      },
      t,
      slot,
    );
    const detail = { offer: pubkey.toBase58(), id: id.toString(), action };
    switch (action) {
      case "close":
      case "rearm":
        await c.sender.send([await client.closeBiddingIx(id)], { job: "offers.close", detail });
        break;
      case "settle":
        await c.sender.send([await client.settleIx(id, keeperKey(c))], { job: "offers.settle", detail, computeUnits: 800_000 });
        break;
      case "sellRemainder":
        await c.sender.send([...(await client.catchUpIxs()), await client.sellRemainderIx(id, keeperKey(c))], { job: "offers.remainder", detail });
        break;
      case "claim":
        await claimAll(c, pubkey, id);
        break;
      case "closeOffer":
        await c.sender.send([await client.closeOfferIx(id)], { job: "offers.closeOffer", detail });
        break;
      default:
        continue;
    }
    done++;
  }
  return done;
}

async function claimAll(c: JobContext, offer: PublicKey, id: bigint) {
  const { client } = c;
  const bids = await client.connection.getProgramAccounts(PROGRAM_IDS.offers, {
    filters: [memcmp(0, disc("offers", "Bid")), memcmp(10, offer.toBase58())],
  });
  for (const { account } of bids) {
    const b = client.programs.offers.coder.accounts.decode("bid", account.data);
    const pre = [createAssociatedTokenAccountIdempotentInstruction(keeperKey(c), client.tokenAta(b.bidder), b.bidder, client.mint, TOKEN_2022)];
    const ix = await client.claimIx(id, b.bidder, b.kind, keeperKey(c));
    await c.sender.send([...(await client.catchUpIxs()), ...pre, ix], {
      job: "offers.claim",
      detail: { offer: offer.toBase58(), bidder: b.bidder.toBase58(), kind: b.kind },
    });
  }
}

// ----------------------------------------------------------- auto-absorb

export async function autoAbsorb(c: JobContext): Promise<number> {
  const { client } = c;
  const market = await client.fetchMarket();
  if ((market.pauses & 2) !== 0) return 0;
  const [offers, grants, cm] = await Promise.all([
    client.connection.getProgramAccounts(PROGRAM_IDS.offers, {
      filters: [memcmp(0, disc("offers", "Offer")), memcmp(18, client.mint.toBase58()), memcmp(9, bs58.encode([0]))],
    }),
    client.connection.getProgramAccounts(PROGRAM_IDS.chest, {
      filters: [memcmp(0, disc("chest", "Grant")), memcmp(9, client.mint.toBase58()), memcmp(73, bs58.encode([1]))],
    }),
    client.fetchChestMarket(),
  ]);
  if (!offers.length || !grants.length) return 0;
  const t = now();
  const totalAssets = BigInt(cm.idleAssets.toString()) + BigInt(cm.adapterValue.toString());
  const totalShares = BigInt(cm.totalShares.toString());
  let placed = 0;
  for (const { pubkey: offerKey, account } of offers) {
    const o = client.programs.offers.coder.accounts.decode("offer", account.data);
    if (o.expiresAt.toNumber() <= t + 5) continue;
    const id = BigInt(o.id.toString());
    const order = shuffle([...grants], Number(id % 2_147_483_647n));
    for (const { account: ga } of order) {
      const g = c.client.programs.chest.coder.accounts.decode("grant", ga.data);
      if (g.owner.equals(o.seller)) continue;
      if (await client.connection.getAccountInfo(pda.bid(offerKey, g.owner, BID_KIND.auto))) continue;
      const chest = await client.fetchChest(g.owner);
      if (!chest) continue;
      const shares = BigInt(chest.shares.toString());
      const balance = (shares * (totalAssets + 1n)) / (totalShares + 1_000n);
      const amount = autoBidAmount(
        {
          enabled: g.enabled,
          maxPerOffer: BigInt(g.maxPerOffer.toString()),
          maxPerDay: BigInt(g.maxPerDay.toString()),
          minDiscountBps: g.minDiscountBps,
          reserveFloor: BigInt(g.reserveFloor.toString()),
          keeper: g.keeper.toBase58(),
        },
        { balance, dayStart: chest.dayStart.toNumber(), daySpent: BigInt(chest.daySpent.toString()) },
        { discountBps: o.discountBps, lots: BigInt(o.lots.toString()), lotCost: BigInt(o.lotCost.toString()) },
        t,
        keeperKey(c).toBase58(),
      );
      if (amount === 0n) continue;
      try {
        await c.sender.send([await client.chestBidIx(g.owner, id, amount, true, keeperKey(c))], {
          job: "autoabsorb.bid",
          detail: { offer: offerKey.toBase58(), owner: g.owner.toBase58(), amount: amount.toString() },
        });
        placed++;
      } catch (e) {
        c.log.warn({ err: String(e), owner: g.owner.toBase58() }, "auto-bid skipped");
      }
    }
  }
  return placed;
}

// ------------------------------------------------------------------ fees

const sighash = (name: string) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);

/** Localnet stand-in for a Jupiter route: mock_swap.swap with the PDA as user. */
export function mockSwapRoute(owner: PublicKey, mintIn: PublicKey, mintOut: PublicKey, userIn: PublicKey, userOut: PublicKey, amount: bigint) {
  const pool = PublicKey.findProgramAddressSync([Buffer.from("mock_pool"), mintIn.toBuffer(), mintOut.toBuffer()], PROGRAM_IDS.mockSwap)[0];
  const accounts: AccountMeta[] = [
    { pubkey: owner, isSigner: false, isWritable: false },
    { pubkey: pool, isSigner: false, isWritable: false },
    { pubkey: mintIn, isSigner: false, isWritable: false },
    { pubkey: mintOut, isSigner: false, isWritable: false },
    { pubkey: userIn, isSigner: false, isWritable: true },
    { pubkey: userOut, isSigner: false, isWritable: true },
    { pubkey: ataClassic(pool, mintIn), isSigner: false, isWritable: true },
    { pubkey: ataClassic(pool, mintOut), isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
  ];
  const data = Buffer.concat([sighash("swap"), new BN(amount.toString()).toArrayLike(Buffer, "le", 8), Buffer.alloc(8)]);
  return { accounts, data };
}

export async function fees(c: JobContext): Promise<void> {
  const { client, cfg } = c;
  const market = await client.fetchMarket();
  const feeBal = (await client.connection.getTokenAccountBalance(market.feeVault)).value.amount;
  if (BigInt(feeBal) >= cfg.distributeMin) {
    await c.sender.send([...(await client.catchUpIxs()), await client.distributeFeesIx()], { job: "fees.distribute", detail: { amount: feeBal } });
  }
  await c.sender.send([await client.syncShieldRewardsIx()], { job: "fees.syncShield", retries: 0 }).catch(() => undefined);

  // Treasury share → SOL (TWAP-chunked; on-chain oracle bound enforces ≤ 0.5 % slippage).
  const tBal = BigInt((await client.connection.getTokenAccountBalance(market.treasuryQuoteVault)).value.amount);
  if (tBal < cfg.convertMin) return;
  const [chunk] = chunkPlan(tBal, BigInt(market.params.maxSwapChunk.toString()));
  if (!chunk) return;
  const treasury = pda.treasury(client.mint);
  const tempWsol = ataClassic(treasury, WSOL);
  let route: { accounts: AccountMeta[]; data: Buffer; lookupTables: PublicKey[] };
  if (client.quote.equals(WSOL)) {
    route = { accounts: [], data: Buffer.alloc(0), lookupTables: [] };
  } else if (cfg.jupiterEnabled) {
    const jup = new JupiterClient(cfg.jupiterUrl);
    const q = await jup.quote(client.quote, WSOL, chunk, cfg.slippageBps);
    const r = await jup.route(q, treasury, tempWsol);
    route = { accounts: r.accounts, data: r.data, lookupTables: r.lookupTables };
  } else if (market.swapProgram.equals(PROGRAM_IDS.mockSwap)) {
    route = { ...mockSwapRoute(treasury, client.quote, WSOL, market.treasuryQuoteVault, tempWsol, chunk), lookupTables: [] };
  } else {
    c.log.info("treasury conversion skipped (no swap route configured)");
    return;
  }
  const ix = await client.programs.core.methods
    .convertTreasury(new BN(chunk.toString()), route.data)
    .accountsStrict({
      keeper: keeperKey(c),
      market: pda.market(client.mint),
      treasury,
      quoteMint: client.quote,
      treasuryQuoteVault: market.treasuryQuoteVault,
      wsolMint: WSOL,
      tempWsol,
      oracleFeed: market.oracle.kind === 1 ? market.oracle.feed : null,
      swapProgram: market.swapProgram,
      quoteTokenProgram: client.quoteProgram,
      wsolTokenProgram: TOKEN_PROGRAM,
      associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
      systemProgram: new PublicKey("11111111111111111111111111111111"),
    } as never)
    .remainingAccounts(route.accounts)
    .instruction();
  await c.sender.send([ix], {
    job: "fees.convertTreasury",
    detail: { chunk: chunk.toString() },
    computeUnits: 1_000_000,
    lookupTables: route.lookupTables,
  });
}

// -------------------------------------------------- yield / epochs / snapshot

export async function rebalance(c: JobContext): Promise<void> {
  const cm = await c.client.fetchChestMarket();
  if (cm.adapterKind === 0) return;
  await c.sender.send([await c.client.rebalanceIx(keeperKey(c), c.market.adapterAccounts)], { job: "yield.rebalance" });
}

export async function epochs(c: JobContext): Promise<void> {
  const { client } = c;
  const [cfg, rs] = await Promise.all([client.fetchHookConfig(), client.fetchRewardState()]);
  const current = Math.floor((now() - cfg.genesisTs.toNumber()) / cfg.epochSecs.toNumber());
  if (current - rs.lastEpoch.toNumber() > 0) {
    await c.sender.send([await client.advanceEpochsIx(Math.min(300, current - rs.lastEpoch.toNumber()))], {
      job: "epochs.advance",
      detail: { from: rs.lastEpoch.toString(), to: current },
    });
  }
  // keep idle wallets inside the 512-epoch snapshot ring (D-020)
  const holders = await client.connection.getProgramAccounts(PROGRAM_IDS.hook, {
    filters: [memcmp(0, disc("hook", "Holder")), memcmp(8, client.mint.toBase58())],
    dataSlice: { offset: 40, length: 72 },
  });
  const idle = holdersToCheckpoint(
    holders.map((h) => ({ wallet: new PublicKey(h.account.data.subarray(0, 32)).toBase58(), rewardEpoch: Number(h.account.data.readBigUInt64LE(64)) })),
    current,
  );
  for (let i = 0; i < idle.length; i += 8) {
    const batch = idle.slice(i, i + 8).map((w) => new PublicKey(w));
    await c.sender.send([await client.checkpointIx(batch)], { job: "epochs.checkpoint", detail: { n: batch.length } });
  }
  void INLINE_CATCH_UP;
}

export async function snapshot(c: JobContext): Promise<void> {
  await c.sender.send([await c.client.snapshotIx()], { job: "treasury.snapshot" });
}

export { podU128 };
