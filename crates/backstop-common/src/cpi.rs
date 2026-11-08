//! CPI helpers shared by the protocol programs.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;

/// Token-2022 `TransferChecked` that forwards the transfer-hook extra
/// accounts.
///
/// `hook_accounts` must contain (any order) the hook program, the
/// extra-account-metas PDA and every resolved extra account: hook config,
/// instructions sysvar, source holder, destination holder and reward state.
/// Their writability is taken from the account infos as passed by the client,
/// which must match the extra-meta list (holders and reward state writable).
#[allow(clippy::too_many_arguments)]
pub fn transfer_checked_with_hook<'info>(
    token_program: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    hook_accounts: &[AccountInfo<'info>],
    amount: u64,
    decimals: u8,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mut data = Vec::with_capacity(10);
    data.push(12u8); // TokenInstruction::TransferChecked
    data.extend_from_slice(&amount.to_le_bytes());
    data.push(decimals);

    let mut metas = Vec::with_capacity(4 + hook_accounts.len());
    metas.push(AccountMeta::new(from.key(), false));
    metas.push(AccountMeta::new_readonly(mint.key(), false));
    metas.push(AccountMeta::new(to.key(), false));
    metas.push(AccountMeta::new_readonly(authority.key(), true));
    let mut infos = Vec::with_capacity(5 + hook_accounts.len());
    infos.extend([from.clone(), mint.clone(), to.clone(), authority.clone()]);
    for ai in hook_accounts {
        metas.push(if ai.is_writable {
            AccountMeta::new(ai.key(), false)
        } else {
            AccountMeta::new_readonly(ai.key(), false)
        });
        infos.push(ai.clone());
    }
    infos.push(token_program.clone());
    invoke_signed(
        &Instruction {
            program_id: token_program.key(),
            accounts: metas,
            data,
        },
        &infos,
        signer_seeds,
    )?;
    Ok(())
}

/// Client-side description of the extra accounts a hooked transfer needs,
/// in the order expected by [`transfer_checked_with_hook`] callers.
pub fn hook_account_keys(
    mint: &Pubkey,
    src_owner: &Pubkey,
    dst_owner: &Pubkey,
) -> [(Pubkey, bool); 7] {
    use crate::{ids, pda};
    [
        (ids::HOOK, false),
        (pda::extra_account_metas(mint).0, false),
        (pda::hook_config(mint).0, false),
        (INSTRUCTIONS_SYSVAR, false),
        (pda::holder(mint, src_owner).0, true),
        (pda::holder(mint, dst_owner).0, true),
        (pda::reward_state(mint).0, true),
    ]
}

/// `Sysvar1nstructions1111111111111111111111111`
pub const INSTRUCTIONS_SYSVAR: Pubkey =
    Pubkey::from_str_const("Sysvar1nstructions1111111111111111111111111");
