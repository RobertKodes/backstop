// PDA derivations — mirror of `crates/backstop-common/src/lib.rs` (`pda`).
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PROGRAM_IDS, TOKEN_2022, TOKEN_PROGRAM } from "./constants.js";

const enc = (s: string) => Buffer.from(s, "utf8");
const u64le = (n: bigint | number) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};
const u32le = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const find = (seeds: Buffer[], program: PublicKey) => PublicKey.findProgramAddressSync(seeds, program)[0];

export const pda = {
  hookConfig: (mint: PublicKey) => find([enc("hook_config"), mint.toBuffer()], PROGRAM_IDS.hook),
  extraAccountMetas: (mint: PublicKey) => find([enc("extra-account-metas"), mint.toBuffer()], PROGRAM_IDS.hook),
  holder: (mint: PublicKey, wallet: PublicKey) => find([enc("holder"), mint.toBuffer(), wallet.toBuffer()], PROGRAM_IDS.hook),
  rewardState: (mint: PublicKey) => find([enc("reward_state"), mint.toBuffer()], PROGRAM_IDS.hook),
  market: (mint: PublicKey) => find([enc("market"), mint.toBuffer()], PROGRAM_IDS.core),
  treasury: (mint: PublicKey) => find([enc("treasury"), mint.toBuffer()], PROGRAM_IDS.core),
  agent: (mint: PublicKey) => find([enc("agent"), mint.toBuffer()], PROGRAM_IDS.core),
  timelock: (mint: PublicKey, id: bigint | number) => find([enc("timelock"), mint.toBuffer(), u64le(id)], PROGRAM_IDS.core),
  parentVault: (mint: PublicKey) => find([enc("parent_vault"), mint.toBuffer()], PROGRAM_IDS.core),
  pool: (mint: PublicKey) => find([enc("pool"), mint.toBuffer()], PROGRAM_IDS.amm),
  book: (mint: PublicKey) => find([enc("book"), mint.toBuffer()], PROGRAM_IDS.offers),
  offer: (mint: PublicKey, id: bigint | number) => find([enc("offer"), mint.toBuffer(), u64le(id)], PROGRAM_IDS.offers),
  bid: (offer: PublicKey, wallet: PublicKey, kind: number) =>
    find([enc("bid"), offer.toBuffer(), wallet.toBuffer(), Buffer.from([kind])], PROGRAM_IDS.offers),
  ticket: (mint: PublicKey, seller: PublicKey, offerId: bigint | number) =>
    find([enc("ticket"), mint.toBuffer(), seller.toBuffer(), u64le(offerId)], PROGRAM_IDS.offers),
  chestMarket: (mint: PublicKey) => find([enc("chest_market"), mint.toBuffer()], PROGRAM_IDS.chest),
  chest: (mint: PublicKey, owner: PublicKey) => find([enc("chest"), mint.toBuffer(), owner.toBuffer()], PROGRAM_IDS.chest),
  grant: (mint: PublicKey, owner: PublicKey) => find([enc("grant"), mint.toBuffer(), owner.toBuffer()], PROGRAM_IDS.chest),
  shield: (mint: PublicKey) => find([enc("shield"), mint.toBuffer()], PROGRAM_IDS.chest),
  shieldPosition: (mint: PublicKey, owner: PublicKey, id: number) =>
    find([enc("shield_pos"), mint.toBuffer(), owner.toBuffer(), u32le(id)], PROGRAM_IDS.chest),
  rewardsVaultAuthority: (mint: PublicKey) => find([enc("rewards_auth"), mint.toBuffer()], PROGRAM_IDS.chest),
  shieldRewardsVault: (mint: PublicKey) => find([enc("shield_rewards"), mint.toBuffer()], PROGRAM_IDS.chest),
  launchpad: () => find([enc("launchpad")], PROGRAM_IDS.launchpad),
  child: (mint: PublicKey) => find([enc("child"), mint.toBuffer()], PROGRAM_IDS.launchpad),
  vesting: (mint: PublicKey) => find([enc("vesting"), mint.toBuffer()], PROGRAM_IDS.launchpad),
  childMintAuthority: (mint: PublicKey) => find([enc("child_mint_auth"), mint.toBuffer()], PROGRAM_IDS.launchpad),
};

/** Token-2022 ATA (engine mints). */
export const ata2022 = (owner: PublicKey, mint: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022);
/** Classic SPL ATA (quote mints). */
export const ataClassic = (owner: PublicKey, mint: PublicKey) =>
  getAssociatedTokenAddressSync(mint, owner, true, TOKEN_PROGRAM);
