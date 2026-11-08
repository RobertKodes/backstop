/* eslint-disable no-console -- CLI script: progress output is the interface */
// Seed a non-mainnet cluster with realistic fake activity after genesis:
// wallets buy, open chests, grant Auto-Absorb, create sell offers, bid from
// wallets and chests; optionally crank settlement; launch a child token.
//
//   pnpm seed:devnet [--wallets 8] [--fast] [--crank] [--child]
//
// --fast  : governance shortens the offer window to 60 s (demo clusters only)
// --crank : the script closes, settles, sells remainders and claims itself
//           instead of waiting for the keeper
// --child : launch a child token through the launchpad

import { BID_KIND, LaunchpadClient, MarketClient, TOKEN_2022, TOKEN_PROGRAM, ataClassic, pda } from "@backstop/sdk";
import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction } from "@solana/spl-token";
import { type Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";

import {
  airdropIfNeeded,
  arg,
  cluster,
  connection,
  KeypairWallet,
  loadKeypair,
  persistentKeypair,
  readOut,
  Sender,
  sleep,
} from "./common.js";
import type { GenesisOut } from "./genesis.js";

const USDC = 1_000_000n;
const TOKEN = 1_000_000_000n;
const SOL = 1_000_000_000;

async function main() {
  const c = cluster();
  if (c === "mainnet-beta") throw new Error("seed is for localnet/devnet only");
  const conn = connection(c);
  const g = readOut<GenesisOut>(c);
  const deployer = loadKeypair(arg("deployer", process.env.DEPLOYER_KEYPAIR ?? "~/.config/solana/id.json")!);
  const tx = new Sender(conn, deployer);
  const mint = new PublicKey(g.mint);
  const quote = new PublicKey(g.quoteMint);
  const client = new MarketClient(conn, { mint, quoteMint: quote }, new KeypairWallet(deployer));
  const quoteAuthority = persistentKeypair(c, "test-usdc-authority");
  const n = Number(arg("wallets", "8"));
  const flag = (f: string) => process.argv.includes(`--${f}`);
  const wallets: Keypair[] = Array.from({ length: n }, (_, i) => persistentKeypair(c, `seed-${i}`));
  console.log(`Seeding ${c}: ${n} wallets`);
  // wallets need ~2 SOL each, the child creator 12 SOL (6 SOL locked liquidity + rent)
  await airdropIfNeeded(conn, deployer.publicKey, (2 * n + 16) * SOL, c);

  if (flag("fast")) {
    const setParam = (param: string, value: number) =>
      client.programs.core.methods
        .setParam({ [param]: {} } as never, new BN(value))
        .accountsStrict({ governance: deployer.publicKey, market: pda.market(mint) })
        .instruction();
    await tx.send("demo timing (60 s offer window)", [
      await setParam("bidEpochSecs", 20),
      await setParam("offerWindowSecs", 60),
    ]);
  }

  // fund wallets: SOL for fees (creator gets enough for a child launch) + test USDC
  for (const [i, w] of wallets.entries()) {
    const want = i === 0 && flag("child") ? 12 * SOL : 2 * SOL;
    const bal = await conn.getBalance(w.publicKey);
    const ixs = [];
    if (bal < want)
      ixs.push(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: w.publicKey, lamports: want - bal }));
    const qa = ataClassic(w.publicKey, quote);
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, qa, w.publicKey, quote, TOKEN_PROGRAM),
    );
    ixs.push(createMintToInstruction(quote, qa, quoteAuthority.publicKey, 5_000n * USDC, [], TOKEN_PROGRAM));
    await tx.send(`fund wallet ${i}`, ixs, [quoteAuthority]);
  }

  // buys (registers holder accounts on the way)
  for (const [i, w] of wallets.entries()) {
    const ws = new Sender(conn, w);
    const amount = BigInt(500 + ((i * 377) % 1_000)) * USDC;
    await ws.send(`wallet ${i} buys ${amount / USDC} USDC`, [
      createAssociatedTokenAccountIdempotentInstruction(
        w.publicKey,
        client.tokenAta(w.publicKey),
        w.publicKey,
        mint,
        TOKEN_2022,
      ),
      ...(await client.buyIxs(w.publicKey, amount, 0n)),
    ]);
  }

  // chests + Auto-Absorb grants for the second half
  const absorbers = wallets.slice(Math.floor(n / 2));
  for (const [j, w] of absorbers.entries()) {
    const ws = new Sender(conn, w);
    const ixs = await client.depositIxs(w.publicKey, 1_500n * USDC);
    if (j < 2) {
      ixs.push(
        await client.setGrantIx(w.publicKey, {
          enabled: true,
          maxPerOffer: 300n * USDC,
          maxPerDay: 1_000n * USDC,
          minDiscountBps: 300,
          reserveFloor: 200n * USDC,
          keeper: new PublicKey(g.keeper),
        }),
      );
    }
    await ws.send(`chest deposit${j < 2 ? " + Auto-Absorb grant" : ""} (wallet ${n / 2 + j})`, ixs);
  }
  // one absorber locks part of its chest into the Shield for 30 days
  const shielder = absorbers[absorbers.length - 1];
  if (shielder && !(await conn.getAccountInfo(pda.shieldPosition(mint, shielder.publicKey, 0)))) {
    await new Sender(conn, shielder).send("Shield lock 800 USDC for 30 days", [
      await client.shieldDepositIx(shielder.publicKey, 800n * USDC, 30 * 86_400, 0),
    ]);
  }

  // sell offers from the first wallets, bids from the absorbers
  const sellers = wallets.slice(0, Math.min(3, Math.floor(n / 2)));
  const offers: { id: bigint; bids: { bidder: PublicKey; kind: number }[] }[] = [];
  for (const [i, s] of sellers.entries()) {
    const amount = BigInt(200_000 + i * 150_000) * TOKEN;
    const { ixs, offerId } = await client.createOfferIxs(s.publicKey, amount, "");
    await new Sender(conn, s).send(`offer #${offerId} (${amount / TOKEN} tokens)`, ixs, [], 600_000);
    const o = await client.fetchOffer(offerId);
    const lotCost = BigInt(o.lotCost.toString());
    const bids: { bidder: PublicKey; kind: number }[] = [];
    for (const [j, b] of absorbers.entries()) {
      const lots = BigInt(5 + (((i + j) * 7) % 20));
      const bs = new Sender(conn, b);
      if (j % 2 === 0) {
        await bs.send(`  wallet bid ${lots} lots`, [await client.walletBidIx(b.publicKey, offerId, lots * lotCost)]);
        bids.push({ bidder: b.publicKey, kind: BID_KIND.wallet });
      } else {
        await bs.send(`  chest bid ${lots} lots`, [
          await client.chestBidIx(b.publicKey, offerId, lots * lotCost, false),
        ]);
        bids.push({ bidder: b.publicKey, kind: BID_KIND.chest });
      }
    }
    offers.push({ id: offerId, bids });
  }

  if (flag("crank")) {
    const last = await client.fetchOffer(offers[offers.length - 1]!.id);
    const wait = Math.max(0, last.expiresAt.toNumber() * 1000 - Date.now()) + 3_000;
    console.log(`waiting ${Math.round(wait / 1000)} s for the offer window…`);
    await sleep(wait);
    for (const o of offers) {
      await tx.send(`close bidding #${o.id}`, [await client.closeBiddingIx(o.id)]);
    }
    await sleep(4_000); // rand_slot = close slot + 4
    for (const o of offers) {
      await tx.send(
        `settle #${o.id}`,
        [...(await client.catchUpIxs()), await client.settleIx(o.id, deployer.publicKey)],
        [],
        800_000,
      );
      const st = await client.fetchOffer(o.id);
      if (BigInt(st.remainderTokens.toString()) > 0n && !st.remainderSold) {
        await tx
          .send(
            `sell remainder #${o.id}`,
            [...(await client.catchUpIxs()), await client.sellRemainderIx(o.id, deployer.publicKey)],
            [],
            600_000,
          )
          .catch((e: Error) => console.log(`  (remainder: ${e.message.split("\n")[0]})`));
      }
      for (const b of o.bids) {
        await tx.send(`  claim ${b.bidder.toBase58().slice(0, 6)}… kind ${b.kind}`, [
          createAssociatedTokenAccountIdempotentInstruction(
            deployer.publicKey,
            client.tokenAta(b.bidder),
            b.bidder,
            mint,
            TOKEN_2022,
          ),
          await client.claimIx(o.id, b.bidder, b.kind, deployer.publicKey),
        ]);
      }
    }
    await tx.send("distribute fees", [...(await client.catchUpIxs()), await client.distributeFeesIx()]);
  }

  if (flag("child")) {
    const creator = wallets[0]!;
    const lp = new LaunchpadClient(conn, mint);
    const childMint = persistentKeypair(c, "child-frog-mint");
    const existing = await lp.fetchChild(childMint.publicKey);
    const steps = existing
      ? await lp.resumeSteps(creator.publicKey, childMint.publicKey)
      : await lp.launchSteps(creator.publicKey, childMint, {
          name: "Night Frog",
          symbol: "FROG",
          uri: "https://backstop.example/children/frog.json",
          supply: 100_000_000n * TOKEN,
          creatorBps: 300,
          liquidityLamports: 6n * BigInt(SOL),
        });
    const cs = new Sender(conn, creator);
    for (const s of steps) await cs.send(`child: ${s.label}`, s.ixs, s.signers, 1_000_000);
    console.log(`child FROG live: ${childMint.publicKey.toBase58()}`);
  }

  console.log("\nSeed complete.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
