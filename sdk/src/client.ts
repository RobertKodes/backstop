// High-level client for one BACKSTOP market (BACKSTOP itself or a child).
import BN from "bn.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getMint,
} from "@solana/spl-token";
import {
  type AccountMeta,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { Wallet } from "@anchor-lang/core";

import {
  ASSOCIATED_TOKEN_PROGRAM,
  INLINE_CATCH_UP,
  PROGRAM_IDS,
  SLOT_HASHES_SYSVAR,
  TOKEN_2022,
  TOKEN_PROGRAM,
} from "./constants.js";
import { hookAccounts } from "./hook.js";
import { ata2022, ataClassic, pda } from "./pda.js";
import { makePrograms, type Programs } from "./programs.js";

const bn = (v: bigint | number) => new BN(v.toString());

export type BidSource = "wallet" | "chest";

export const BID_KIND = { wallet: 0, chest: 1, auto: 2 } as const;

export interface MarketConfig {
  mint: PublicKey;
  quoteMint: PublicKey;
  quoteTokenProgram?: PublicKey;
}

export class MarketClient {
  readonly programs: Programs;
  readonly mint: PublicKey;
  readonly quote: PublicKey;
  readonly quoteProgram: PublicKey;

  constructor(
    readonly connection: Connection,
    cfg: MarketConfig,
    wallet?: Wallet,
  ) {
    this.programs = makePrograms(connection, wallet);
    this.mint = cfg.mint;
    this.quote = cfg.quoteMint;
    this.quoteProgram = cfg.quoteTokenProgram ?? TOKEN_PROGRAM;
  }

  quoteAta(owner: PublicKey) {
    return this.quoteProgram.equals(TOKEN_2022) ? ata2022(owner, this.quote) : ataClassic(owner, this.quote);
  }

  tokenAta(owner: PublicKey) {
    return ata2022(owner, this.mint);
  }

  // ------------------------------------------------------------- fetchers

  fetchMarket() {
    return this.programs.core.account.market.fetch(pda.market(this.mint));
  }
  fetchPool() {
    return this.programs.amm.account.pool.fetch(pda.pool(this.mint));
  }
  fetchBook() {
    return this.programs.offers.account.offerBook.fetch(pda.book(this.mint));
  }
  fetchOffer(id: bigint | number) {
    return this.programs.offers.account.offer.fetch(pda.offer(this.mint, id));
  }
  fetchHolder(wallet: PublicKey) {
    return this.programs.hook.account.holder.fetchNullable(pda.holder(this.mint, wallet));
  }
  fetchRewardState() {
    return this.programs.hook.account.rewardState.fetch(pda.rewardState(this.mint));
  }
  fetchHookConfig() {
    return this.programs.hook.account.hookConfig.fetch(pda.hookConfig(this.mint));
  }
  fetchChestMarket() {
    return this.programs.chest.account.chestMarket.fetch(pda.chestMarket(this.mint));
  }
  fetchChest(owner: PublicKey) {
    return this.programs.chest.account.chest.fetchNullable(pda.chest(this.mint, owner));
  }
  fetchGrant(owner: PublicKey) {
    return this.programs.chest.account.grant.fetchNullable(pda.grant(this.mint, owner));
  }
  fetchShield() {
    return this.programs.chest.account.shield.fetch(pda.shield(this.mint));
  }
  fetchTicket(seller: PublicKey, offerId: bigint | number) {
    return this.programs.offers.account.ticket.fetchNullable(pda.ticket(this.mint, seller, offerId));
  }

  // ------------------------------------------------------------ prelude

  /** Prepend `advance_epochs` when the reward state is beyond the hook's inline catch-up bound. */
  async catchUpIxs(): Promise<TransactionInstruction[]> {
    const [cfg, rs, slot] = await Promise.all([this.fetchHookConfig(), this.fetchRewardState(), this.connection.getSlot()]);
    const now = (await this.connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
    const target = Math.floor((now - cfg.genesisTs.toNumber()) / cfg.epochSecs.toNumber());
    let behind = target - rs.lastEpoch.toNumber();
    const ixs: TransactionInstruction[] = [];
    while (behind > INLINE_CATCH_UP) {
      ixs.push(await this.advanceEpochsIx(300));
      behind -= 300;
    }
    if (ixs.length) ixs.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
    return ixs;
  }

  advanceEpochsIx(maxSteps: number) {
    return this.programs.hook.methods
      .advanceEpochs(bn(maxSteps))
      .accountsStrict({ config: pda.hookConfig(this.mint), rewardState: pda.rewardState(this.mint) })
      .instruction();
  }

  /** Register the wallet's holder account if missing (needed to earn rewards and to sell). */
  async ensureHolderIxs(wallet: PublicKey, payer = wallet): Promise<TransactionInstruction[]> {
    const ixs: TransactionInstruction[] = [];
    const ata = this.tokenAta(wallet);
    if (!(await this.connection.getAccountInfo(ata))) {
      ixs.push(createAssociatedTokenAccountIdempotentInstruction(payer, ata, wallet, this.mint, TOKEN_2022));
    }
    if (!(await this.fetchHolder(wallet))) {
      const hasAta = ixs.length === 0;
      ixs.push(
        await this.programs.hook.methods
          .registerHolder()
          .accountsStrict({
            payer,
            wallet,
            mint: this.mint,
            config: pda.hookConfig(this.mint),
            holder: pda.holder(this.mint, wallet),
            rewardState: pda.rewardState(this.mint),
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(hasAta ? [{ pubkey: ata, isSigner: false, isWritable: false }] : [])
          .instruction(),
      );
    }
    return ixs;
  }

  async ensureQuoteAtaIx(owner: PublicKey, payer = owner): Promise<TransactionInstruction[]> {
    const ata = this.quoteAta(owner);
    if (await this.connection.getAccountInfo(ata)) return [];
    return [createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, this.quote, this.quoteProgram)];
  }

  // ----------------------------------------------------------------- AMM

  private async swapAccounts(user: PublicKey) {
    const market = await this.fetchMarket();
    const pool = pda.pool(this.mint);
    return {
      user,
      market: pda.market(this.mint),
      pool,
      mint: this.mint,
      quoteMint: this.quote,
      baseVault: ata2022(pool, this.mint),
      quoteVault: this.quoteAta(pool),
      feeVault: market.feeVault,
      userBase: this.tokenAta(user),
      userQuote: this.quoteAta(user),
      baseTokenProgram: TOKEN_2022,
      quoteTokenProgram: this.quoteProgram,
    };
  }

  async buyIxs(user: PublicKey, quoteIn: bigint, minBaseOut: bigint): Promise<TransactionInstruction[]> {
    const pre = [...(await this.catchUpIxs()), ...(await this.ensureHolderIxs(user))];
    const ix = await this.programs.amm.methods
      .buy(bn(quoteIn), bn(minBaseOut))
      .accountsStrict(await this.swapAccounts(user))
      .remainingAccounts(hookAccounts(this.mint, pda.pool(this.mint), user))
      .instruction();
    return [...pre, ix];
  }

  async sellIxs(user: PublicKey, baseIn: bigint, minQuoteOut: bigint): Promise<TransactionInstruction[]> {
    const pre = [...(await this.catchUpIxs()), ...(await this.ensureQuoteAtaIx(user))];
    const ix = await this.programs.amm.methods
      .sell(bn(baseIn), bn(minQuoteOut))
      .accountsStrict(await this.swapAccounts(user))
      .remainingAccounts(hookAccounts(this.mint, user, pda.pool(this.mint)))
      .instruction();
    return [...pre, ix];
  }

  // -------------------------------------------------------------- offers

  async createOfferIxs(seller: PublicKey, amount: bigint, message = ""): Promise<{ ixs: TransactionInstruction[]; offerId: bigint }> {
    const book = await this.fetchBook();
    const id = BigInt(book.nextOfferId.toString());
    const offer = pda.offer(this.mint, id);
    const bookPda = pda.book(this.mint);
    const pre = [
      ...(await this.catchUpIxs()),
      ...(await this.ensureHolderIxs(seller)),
      ...(await this.ensureQuoteAtaIx(seller)),
    ];
    const ix = await this.programs.offers.methods
      .createOffer(bn(amount), Buffer.from(message, "utf8"))
      .accountsStrict({
        seller,
        market: pda.market(this.mint),
        book: bookPda,
        pool: pda.pool(this.mint),
        mint: this.mint,
        quoteMint: this.quote,
        offer,
        bidVault: this.quoteAta(offer),
        sellerToken: this.tokenAta(seller),
        sellerQuote: this.quoteAta(seller),
        escrowVault: ata2022(bookPda, this.mint),
        sellerHolder: pda.holder(this.mint, seller),
        baseTokenProgram: TOKEN_2022,
        quoteTokenProgram: this.quoteProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(hookAccounts(this.mint, seller, bookPda))
      .instruction();
    return { ixs: [...pre, ix], offerId: id };
  }

  async walletBidIx(bidder: PublicKey, offerId: bigint, amount: bigint): Promise<TransactionInstruction> {
    const offer = pda.offer(this.mint, offerId);
    const o = await this.fetchOffer(offerId);
    return this.programs.offers.methods
      .placeBid(bn(amount), BID_KIND.wallet)
      .accountsStrict({
        rentPayer: bidder,
        funder: bidder,
        bidder,
        market: pda.market(this.mint),
        offer,
        mint: this.mint,
        quoteMint: this.quote,
        bid: pda.bid(offer, bidder, BID_KIND.wallet),
        funderQuote: this.quoteAta(bidder),
        refundTo: this.quoteAta(bidder),
        bidVault: this.quoteAta(offer),
        sellerHolder: pda.holder(this.mint, o.seller),
        hookConfig: pda.hookConfig(this.mint),
        quoteTokenProgram: this.quoteProgram,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  /** Manual chest bid (owner signs) or keeper Auto-Absorb bid (`auto`). */
  async chestBidIx(owner: PublicKey, offerId: bigint, amount: bigint, auto: boolean, payer = owner) {
    const offer = pda.offer(this.mint, offerId);
    const o = await this.fetchOffer(offerId);
    const cm = pda.chestMarket(this.mint);
    const kind = auto ? BID_KIND.auto : BID_KIND.chest;
    const grant = pda.grant(this.mint, owner);
    const hasGrant = !!(await this.connection.getAccountInfo(grant));
    const accounts = {
      payer,
      owner,
      market: pda.market(this.mint),
      chestMarket: cm,
      chest: pda.chest(this.mint, owner),
      grant: hasGrant ? grant : null,
      offer,
      mint: this.mint,
      quoteMint: this.quote,
      bid: pda.bid(offer, owner, kind),
      vault: this.quoteAta(cm),
      bidVault: this.quoteAta(offer),
      sellerHolder: pda.holder(this.mint, o.seller),
      hookConfig: pda.hookConfig(this.mint),
      offersProgram: PROGRAM_IDS.offers,
      quoteTokenProgram: this.quoteProgram,
      systemProgram: SystemProgram.programId,
    };
    const m = auto ? this.programs.chest.methods.autoBid(bn(amount)) : this.programs.chest.methods.bidFromChest(bn(amount));
    const ix = await m.accountsStrict(accounts as never).instruction();
    if (!auto) for (const k of ix.keys) if (k.pubkey.equals(owner)) k.isSigner = true;
    return ix;
  }

  closeBiddingIx(offerId: bigint) {
    return this.programs.offers.methods
      .closeBidding()
      .accountsStrict({ offer: pda.offer(this.mint, offerId) })
      .instruction();
  }

  async settleIx(offerId: bigint, payer: PublicKey) {
    const o = await this.fetchOffer(offerId);
    const market = await this.fetchMarket();
    const offer = pda.offer(this.mint, offerId);
    const book = pda.book(this.mint);
    const shield = pda.shield(this.mint);
    return this.programs.chest.methods
      .settleOffer()
      .accountsStrict({
        payer,
        market: pda.market(this.mint),
        shield,
        pool: pda.pool(this.mint),
        book,
        offer,
        mint: this.mint,
        quoteMint: this.quote,
        escrowVault: ata2022(book, this.mint),
        bidVault: this.quoteAta(offer),
        sellerQuote: o.sellerQuote,
        feeVault: market.feeVault,
        shieldQuoteVault: this.quoteAta(shield),
        shieldTokenVault: ata2022(shield, this.mint),
        ticket: pda.ticket(this.mint, o.seller, offerId),
        slotHashes: SLOT_HASHES_SYSVAR,
        offersProgram: PROGRAM_IDS.offers,
        baseTokenProgram: TOKEN_2022,
        quoteTokenProgram: this.quoteProgram,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(hookAccounts(this.mint, book, shield))
      .instruction();
  }

  async sellRemainderIx(offerId: bigint, cranker: PublicKey) {
    const o = await this.fetchOffer(offerId);
    const market = await this.fetchMarket();
    const book = pda.book(this.mint);
    const pool = pda.pool(this.mint);
    return this.programs.offers.methods
      .sellRemainder()
      .accountsStrict({
        cranker,
        seller: o.seller,
        market: pda.market(this.mint),
        book,
        offer: pda.offer(this.mint, offerId),
        pool,
        mint: this.mint,
        quoteMint: this.quote,
        baseVault: ata2022(pool, this.mint),
        quoteVault: this.quoteAta(pool),
        feeVault: market.feeVault,
        escrowVault: ata2022(book, this.mint),
        sellerQuote: o.sellerQuote,
        ammProgram: PROGRAM_IDS.amm,
        baseTokenProgram: TOKEN_2022,
        quoteTokenProgram: this.quoteProgram,
      })
      .remainingAccounts(hookAccounts(this.mint, book, pool))
      .instruction();
  }

  /** Claim a bid: wallet bids via the offers program, chest bids via the chest program. */
  async claimIx(offerId: bigint, bidder: PublicKey, kind: number, cranker: PublicKey): Promise<TransactionInstruction> {
    const offer = pda.offer(this.mint, offerId);
    const book = pda.book(this.mint);
    const bid = pda.bid(offer, bidder, kind);
    const b = await this.programs.offers.account.bid.fetch(bid);
    const remaining: AccountMeta[] = hookAccounts(this.mint, book, bidder);
    if (kind === BID_KIND.wallet) {
      return this.programs.offers.methods
        .claim()
        .accountsStrict({
          claimer: cranker,
          refundAuthority: null,
          book,
          offer,
          bid,
          rentPayer: b.rentPayer,
          mint: this.mint,
          quoteMint: this.quote,
          bidderToken: this.tokenAta(bidder),
          refundTo: b.refundTo,
          escrowVault: ata2022(book, this.mint),
          bidVault: this.quoteAta(offer),
          hookConfig: pda.hookConfig(this.mint),
          bidderHolder: pda.holder(this.mint, bidder),
          rewardState: pda.rewardState(this.mint),
          hookProgram: PROGRAM_IDS.hook,
          baseTokenProgram: TOKEN_2022,
          quoteTokenProgram: this.quoteProgram,
        } as never)
        .remainingAccounts(remaining)
        .instruction();
    }
    const cm = pda.chestMarket(this.mint);
    return this.programs.chest.methods
      .claimBid()
      .accountsStrict({
        cranker,
        chestMarket: cm,
        chest: pda.chest(this.mint, bidder),
        book,
        offer,
        bid,
        rentPayer: b.rentPayer,
        mint: this.mint,
        quoteMint: this.quote,
        bidderToken: this.tokenAta(bidder),
        vault: this.quoteAta(cm),
        escrowVault: ata2022(book, this.mint),
        bidVault: this.quoteAta(offer),
        hookConfig: pda.hookConfig(this.mint),
        bidderHolder: pda.holder(this.mint, bidder),
        rewardState: pda.rewardState(this.mint),
        hookProgram: PROGRAM_IDS.hook,
        offersProgram: PROGRAM_IDS.offers,
        baseTokenProgram: TOKEN_2022,
        quoteTokenProgram: this.quoteProgram,
      })
      .remainingAccounts(remaining)
      .instruction();
  }

  async closeOfferIx(offerId: bigint) {
    const o = await this.fetchOffer(offerId);
    const offer = pda.offer(this.mint, offerId);
    return this.programs.offers.methods
      .closeOffer()
      .accountsStrict({
        seller: o.seller,
        book: pda.book(this.mint),
        offer,
        bidVault: this.quoteAta(offer),
        quoteTokenProgram: this.quoteProgram,
      })
      .instruction();
  }

  async ticketBuyIxs(seller: PublicKey, offerId: bigint, quoteIn: bigint, minOut: bigint) {
    const market = await this.fetchMarket();
    const pool = pda.pool(this.mint);
    const ix = await this.programs.offers.methods
      .buyWithTicket(bn(quoteIn), bn(minOut))
      .accountsStrict({
        buyer: seller,
        ticket: pda.ticket(this.mint, seller, offerId),
        book: pda.book(this.mint),
        market: pda.market(this.mint),
        pool,
        mint: this.mint,
        quoteMint: this.quote,
        baseVault: ata2022(pool, this.mint),
        quoteVault: this.quoteAta(pool),
        feeVault: market.feeVault,
        buyerQuote: this.quoteAta(seller),
        buyerBase: this.tokenAta(seller),
        ammProgram: PROGRAM_IDS.amm,
        baseTokenProgram: TOKEN_2022,
        quoteTokenProgram: this.quoteProgram,
      })
      .remainingAccounts(hookAccounts(this.mint, pool, seller))
      .instruction();
    return [...(await this.catchUpIxs()), ix];
  }

  // --------------------------------------------------------------- chests

  async openChestIxs(owner: PublicKey, payer = owner): Promise<TransactionInstruction[]> {
    if (await this.fetchChest(owner)) return [];
    return [
      await this.programs.chest.methods
        .openChest()
        .accountsStrict({
          payer,
          owner,
          chestMarket: pda.chestMarket(this.mint),
          chest: pda.chest(this.mint, owner),
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ];
  }

  private chestTransferAccounts(owner: PublicKey, shieldRewardsVault: PublicKey) {
    const cm = pda.chestMarket(this.mint);
    return {
      owner,
      market: pda.market(this.mint),
      chestMarket: cm,
      chest: pda.chest(this.mint, owner),
      quoteMint: this.quote,
      vault: this.quoteAta(cm),
      ownerQuote: this.quoteAta(owner),
      shieldRewardsVault,
      quoteTokenProgram: this.quoteProgram,
    };
  }

  async depositIxs(owner: PublicKey, amount: bigint) {
    const ix = await this.programs.chest.methods
      .deposit(bn(amount))
      .accountsStrict(this.chestTransferAccounts(owner, pda.shieldRewardsVault(this.mint)))
      .instruction();
    return [...(await this.openChestIxs(owner)), ix];
  }

  withdrawIx(owner: PublicKey, amount: bigint) {
    return this.programs.chest.methods
      .withdraw(bn(amount))
      .accountsStrict(this.chestTransferAccounts(owner, pda.shieldRewardsVault(this.mint)))
      .instruction();
  }

  async harvestIxs(owner: PublicKey) {
    const cm = pda.chestMarket(this.mint);
    const ra = pda.rewardsVaultAuthority(this.mint);
    const ix = await this.programs.chest.methods
      .harvest()
      .accountsStrict({
        owner,
        market: pda.market(this.mint),
        chestMarket: cm,
        chest: pda.chest(this.mint, owner),
        quoteMint: this.quote,
        vault: this.quoteAta(cm),
        holderRewardsVault: this.quoteAta(ra),
        rewardsAuth: ra,
        hookConfig: pda.hookConfig(this.mint),
        holder: pda.holder(this.mint, owner),
        rewardState: pda.rewardState(this.mint),
        hookProgram: PROGRAM_IDS.hook,
        quoteTokenProgram: this.quoteProgram,
      })
      .instruction();
    return [...(await this.catchUpIxs()), ...(await this.openChestIxs(owner)), ix];
  }

  setGrantIx(
    owner: PublicKey,
    args: { enabled: boolean; maxPerOffer: bigint; maxPerDay: bigint; minDiscountBps: number; reserveFloor: bigint; keeper?: PublicKey },
  ) {
    return this.programs.chest.methods
      .setGrant({
        enabled: args.enabled,
        maxPerOffer: bn(args.maxPerOffer),
        maxPerDay: bn(args.maxPerDay),
        minDiscountBps: args.minDiscountBps,
        reserveFloor: bn(args.reserveFloor),
        keeper: args.keeper ?? PublicKey.default,
      })
      .accountsStrict({
        owner,
        chestMarket: pda.chestMarket(this.mint),
        grant: pda.grant(this.mint, owner),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  // --------------------------------------------------------------- shield

  shieldDepositIx(owner: PublicKey, amount: bigint, lockSecs: number, positionId: number) {
    const cm = pda.chestMarket(this.mint);
    const shield = pda.shield(this.mint);
    return this.programs.chest.methods
      .shieldDeposit(bn(amount), lockSecs, positionId)
      .accountsStrict({
        owner,
        market: pda.market(this.mint),
        chestMarket: cm,
        chest: pda.chest(this.mint, owner),
        shield,
        position: pda.shieldPosition(this.mint, owner, positionId),
        quoteMint: this.quote,
        vault: this.quoteAta(cm),
        quoteVault: this.quoteAta(shield),
        rewardsVault: pda.shieldRewardsVault(this.mint),
        quoteTokenProgram: this.quoteProgram,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  shieldClaimIx(owner: PublicKey, positionId: number, withdraw: boolean) {
    const cm = pda.chestMarket(this.mint);
    const shield = pda.shield(this.mint);
    const accounts = {
      owner,
      market: pda.market(this.mint),
      chestMarket: cm,
      chest: pda.chest(this.mint, owner),
      shield,
      position: pda.shieldPosition(this.mint, owner, positionId),
      mint: this.mint,
      quoteMint: this.quote,
      vault: this.quoteAta(cm),
      quoteVault: this.quoteAta(shield),
      tokenVault: ata2022(shield, this.mint),
      rewardsVault: pda.shieldRewardsVault(this.mint),
      ownerToken: this.tokenAta(owner),
      baseTokenProgram: TOKEN_2022,
      quoteTokenProgram: this.quoteProgram,
    };
    const m = withdraw ? this.programs.chest.methods.shieldWithdraw() : this.programs.chest.methods.shieldClaim();
    return m.accountsStrict(accounts).remainingAccounts(hookAccounts(this.mint, shield, owner)).instruction();
  }

  // -------------------------------------------------- treasury / fees / ops

  async distributeFeesIx() {
    const m = await this.fetchMarket();
    return this.programs.core.methods
      .distributeFees()
      .accountsStrict({
        market: pda.market(this.mint),
        quoteMint: this.quote,
        feeVault: m.feeVault,
        holderRewardsVault: m.holderRewardsVault,
        shieldRewardsVault: m.shieldRewardsVault,
        treasuryQuoteVault: m.treasuryQuoteVault,
        parentVault: m.parentVault,
        hookConfig: pda.hookConfig(this.mint),
        rewardState: pda.rewardState(this.mint),
        hookProgram: PROGRAM_IDS.hook,
        quoteTokenProgram: this.quoteProgram,
      })
      .instruction();
  }

  async redeemIxs(user: PublicKey, amount: bigint, minLamportsOut: bigint) {
    const m = await this.fetchMarket();
    const ix = await this.programs.core.methods
      .redeem(bn(amount), bn(minLamportsOut))
      .accountsStrict({
        user,
        market: pda.market(this.mint),
        treasury: pda.treasury(this.mint),
        mint: this.mint,
        userToken: this.tokenAta(user),
        ammBaseVault: m.ammBaseVault,
        hookConfig: pda.hookConfig(this.mint),
        holder: pda.holder(this.mint, user),
        rewardState: pda.rewardState(this.mint),
        hookProgram: PROGRAM_IDS.hook,
        tokenProgram: TOKEN_2022,
      })
      .instruction();
    return [...(await this.catchUpIxs()), ix];
  }

  async snapshotIx() {
    const m = await this.fetchMarket();
    return this.programs.core.methods
      .snapshot()
      .accountsStrict({
        market: pda.market(this.mint),
        treasury: pda.treasury(this.mint),
        mint: this.mint,
        ammBaseVault: m.ammBaseVault,
      })
      .instruction();
  }

  checkpointIx(holders: PublicKey[]) {
    return this.programs.hook.methods
      .checkpoint()
      .accountsStrict({ config: pda.hookConfig(this.mint), rewardState: pda.rewardState(this.mint) })
      .remainingAccounts(holders.map((w) => ({ pubkey: pda.holder(this.mint, w), isSigner: false, isWritable: true })))
      .instruction();
  }

  syncShieldRewardsIx() {
    return this.programs.chest.methods
      .syncShieldRewards()
      .accountsStrict({ shield: pda.shield(this.mint), rewardsVault: pda.shieldRewardsVault(this.mint) })
      .instruction();
  }

  /** `adapterAccounts` are the adapter-specific remaining accounts (see yield_adapter.rs). */
  rebalanceIx(cranker: PublicKey, adapterAccounts: AccountMeta[]) {
    const cm = pda.chestMarket(this.mint);
    return this.programs.chest.methods
      .rebalance()
      .accountsStrict({
        cranker,
        market: pda.market(this.mint),
        chestMarket: cm,
        quoteMint: this.quote,
        vault: this.quoteAta(cm),
        quoteTokenProgram: this.quoteProgram,
      })
      .remainingAccounts(adapterAccounts)
      .instruction();
  }

  /** Quote-token balance helper (0 if the account does not exist). */
  async quoteBalance(owner: PublicKey): Promise<bigint> {
    try {
      return (await getAccount(this.connection, this.quoteAta(owner), "confirmed", this.quoteProgram)).amount;
    } catch {
      return 0n;
    }
  }

  async tokenBalance(owner: PublicKey): Promise<bigint> {
    try {
      return (await getAccount(this.connection, this.tokenAta(owner), "confirmed", TOKEN_2022)).amount;
    } catch {
      return 0n;
    }
  }

  async supply(): Promise<bigint> {
    return (await getMint(this.connection, this.mint, "confirmed", TOKEN_2022)).supply;
  }
}
