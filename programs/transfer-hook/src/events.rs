use anchor_lang::prelude::*;

#[event]
pub struct HookInitialized {
    pub mint: Pubkey,
    pub governance: Pubkey,
    pub genesis_ts: i64,
    pub epoch_secs: u64,
}

#[event]
pub struct HolderRegistered {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub balance: u64,
    pub ts: i64,
}

#[event]
pub struct HolderSynced {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub balance: u64,
    pub ts: i64,
}

/// Emitted for every tracked token movement. `kind`: 0 = direct transfer,
/// 1 = protocol-routed (AMM / offers / chest / launchpad).
#[event]
pub struct TransferTracked {
    pub mint: Pubkey,
    pub src_wallet: Pubkey,
    pub dst_wallet: Pubkey,
    pub amount: u64,
    pub kind: u8,
    pub src_tracked: bool,
    pub dst_tracked: bool,
    pub ts: i64,
}

#[event]
pub struct TenureReset {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub balance: u64,
    pub ts: i64,
}

#[event]
pub struct TenureCredited {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub raw_lot_tenure: u128,
    pub credited: u128,
    pub ts: i64,
}

#[event]
pub struct RewardsDeposited {
    pub mint: Pubkey,
    pub amount: u64,
    pub epoch: u64,
}

#[event]
pub struct RewardsHarvested {
    pub mint: Pubkey,
    pub wallet: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EpochsAdvanced {
    pub mint: Pubkey,
    pub from_epoch: u64,
    pub to_epoch: u64,
}

#[event]
pub struct HookParamsUpdated {
    pub mint: Pubkey,
    pub tenure_cap_secs: u64,
    pub tenure_extra_bps: u32,
    pub absorb_tenure_bps: u32,
    pub direct_sell_cap: u64,
    pub link_min_amount: u64,
}

#[event]
pub struct AllowlistUpdated {
    pub mint: Pubkey,
    pub programs: Vec<Pubkey>,
    pub owners: Vec<Pubkey>,
}
