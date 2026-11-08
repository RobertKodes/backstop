import { AccountMeta, PublicKey } from "@solana/web3.js";
import { INSTRUCTIONS_SYSVAR, PROGRAM_IDS } from "./constants.js";
import { pda } from "./pda.js";

/**
 * Extra accounts Token-2022 needs for a hooked transfer from `srcOwner` to
 * `dstOwner` (order-independent; mirrors `backstop_common::cpi::hook_account_keys`).
 * Pass these as `remainingAccounts` to any protocol instruction that moves
 * the engine token, or append them to a plain `transferChecked`.
 */
export function hookAccounts(mint: PublicKey, srcOwner: PublicKey, dstOwner: PublicKey): AccountMeta[] {
  return [
    { pubkey: PROGRAM_IDS.hook, isSigner: false, isWritable: false },
    { pubkey: pda.extraAccountMetas(mint), isSigner: false, isWritable: false },
    { pubkey: pda.hookConfig(mint), isSigner: false, isWritable: false },
    { pubkey: INSTRUCTIONS_SYSVAR, isSigner: false, isWritable: false },
    { pubkey: pda.holder(mint, srcOwner), isSigner: false, isWritable: true },
    { pubkey: pda.holder(mint, dstOwner), isSigner: false, isWritable: true },
    { pubkey: pda.rewardState(mint), isSigner: false, isWritable: true },
  ];
}
