//! Core account layouts and the governable parameter set.

use anchor_lang::prelude::*;
use backstop_common::defaults as d;
use backstop_math::discount::DiscountParams;
use backstop_math::fees::FeeSplitParams;

use crate::errors::CoreError;

pub const ACCOUNT_VERSION: u8 = 1;

/// Pause bit flags (spec: emergency pause only for these three).
pub mod pause {
    pub const NEW_OFFERS: u8 = 1;
    pub const AUTO_ABSORB: u8 = 2;
    pub const LAUNCHPAD: u8 = 4;
    pub const ALL: u8 = NEW_OFFERS | AUTO_ABSORB | LAUNCHPAD;
}

pub mod status {
    pub const LIVE: u8 = 1;
}

/// Every governable parameter of a market (spec §3). Defaults in
/// [`MarketParams::defaults`].
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub struct MarketParams {
    pub trade_fee_bps: u16,
    pub split_chest_bps: u16,
    pub split_shield_bps: u16,
    /// Share of gross fees routed to the parent market (children only).
    pub parent_share_bps: u16,
    pub base_discount_bps: u16,
    pub k_up_bps: u16,
    pub k_down_bps: u16,
    pub min_discount_bps: u16,
    pub max_discount_bps: u16,
    pub offer_window_secs: u32,
    pub bid_epoch_secs: u32,
    pub min_offer_size: u64,
    pub lots_per_offer: u16,
    pub ticket_validity_secs: u32,
    pub chest_lock_secs: u32,
    pub chest_penalty_bps: u16,
    pub redemption_fee_bps: u16,
    pub yield_buffer_bps: u16,
    pub shield_per_offer_cap: u64,
    pub shield_max_share_bps: u16,
    pub shield_min_lock_secs: u32,
    pub shield_max_multiplier_bps: u32,
    /// Shield skips offers whose short TWAP exceeds the hourly TWAP by more
    /// than this (pump-and-dump protection).
    pub shield_max_premium_bps: u16,
    pub price_twap_window_secs: u32,
    pub momentum_lookback_secs: u32,
    /// Global cap on direct (sub-minimum) AMM sells per hour, base units.
    pub direct_sell_hourly_cap: u64,
    /// Max slippage vs. oracle on keeper fee swaps (spec: 0.5 %).
    pub max_swap_slippage_bps: u16,
    /// Max single keeper swap; larger amounts are TWAP-chunked by the keeper.
    pub max_swap_chunk: u64,
}

impl MarketParams {
    pub fn defaults(supply: u64, quote_decimals: u8) -> Self {
        let quote_unit = 10u64.pow(quote_decimals as u32);
        Self {
            trade_fee_bps: d::TRADE_FEE_BPS as u16,
            split_chest_bps: d::SPLIT_CHEST_BPS as u16,
            split_shield_bps: d::SPLIT_SHIELD_BPS as u16,
            parent_share_bps: 0,
            base_discount_bps: d::BASE_DISCOUNT_BPS as u16,
            k_up_bps: d::DISCOUNT_K_UP_BPS as u16,
            k_down_bps: d::DISCOUNT_K_DOWN_BPS as u16,
            min_discount_bps: d::DISCOUNT_MIN_BPS as u16,
            max_discount_bps: d::DISCOUNT_MAX_BPS as u16,
            offer_window_secs: d::OFFER_WINDOW_SECS,
            bid_epoch_secs: d::BID_EPOCH_SECS,
            min_offer_size: d::min_offer_size(supply),
            lots_per_offer: d::LOTS_PER_OFFER as u16,
            ticket_validity_secs: d::TICKET_VALIDITY_SECS,
            chest_lock_secs: d::CHEST_LOCK_SECS,
            chest_penalty_bps: d::CHEST_EARLY_PENALTY_BPS as u16,
            redemption_fee_bps: d::REDEMPTION_FEE_BPS as u16,
            yield_buffer_bps: d::YIELD_BUFFER_BPS as u16,
            shield_per_offer_cap: 10_000 * quote_unit,
            shield_max_share_bps: d::SHIELD_MAX_SHARE_BPS as u16,
            shield_min_lock_secs: d::SHIELD_MIN_LOCK_SECS,
            shield_max_multiplier_bps: d::SHIELD_MAX_MULTIPLIER_BPS,
            shield_max_premium_bps: 2_000,
            price_twap_window_secs: d::PRICE_TWAP_WINDOW_SECS,
            momentum_lookback_secs: d::MOMENTUM_LOOKBACK_SECS,
            direct_sell_hourly_cap: supply / 1_000, // 0.1 % of supply per hour
            max_swap_slippage_bps: 50,
            max_swap_chunk: 50_000 * quote_unit,
        }
    }

    pub fn validate(&self) -> Result<()> {
        let ok = self.trade_fee_bps <= 1_000
            && (self.split_chest_bps as u32 + self.split_shield_bps as u32) <= 10_000
            && self.parent_share_bps <= 10_000
            && self.min_discount_bps <= self.base_discount_bps
            && self.base_discount_bps <= self.max_discount_bps
            && self.max_discount_bps < 5_000
            && self.offer_window_secs >= 60
            && self.offer_window_secs <= 86_400
            && self.bid_epoch_secs > 0
            && self.bid_epoch_secs <= self.offer_window_secs
            && self.min_offer_size > 0
            && self.lots_per_offer >= 1
            && self.lots_per_offer <= 1_000
            && self.ticket_validity_secs <= 90 * 86_400
            && self.chest_lock_secs <= 365 * 86_400
            && self.chest_penalty_bps <= 5_000
            && self.redemption_fee_bps <= 1_000
            && self.yield_buffer_bps <= 10_000
            && self.shield_max_share_bps <= 10_000
            && self.shield_min_lock_secs >= 86_400
            && self.shield_max_multiplier_bps >= 10_000
            && self.price_twap_window_secs >= 60
            && self.momentum_lookback_secs >= self.price_twap_window_secs
            && self.max_swap_slippage_bps <= 500
            && self.max_swap_chunk > 0;
        require!(ok, CoreError::InvalidParameter);
        Ok(())
    }

    pub fn fee_split(&self) -> FeeSplitParams {
        FeeSplitParams {
            chest_bps: self.split_chest_bps as u32,
            shield_bps: self.split_shield_bps as u32,
            parent_bps: self.parent_share_bps as u32,
        }
    }

    pub fn discount(&self) -> DiscountParams {
        DiscountParams {
            base_bps: self.base_discount_bps as u32,
            k_up_bps: self.k_up_bps as u32,
            k_down_bps: self.k_down_bps as u32,
            min_bps: self.min_discount_bps as u32,
            max_bps: self.max_discount_bps as u32,
        }
    }

    /// Generic single-parameter update used by governance and the agent.
    pub fn set(&mut self, id: ParamId, v: u64) -> Result<()> {
        let u16v = || u16::try_from(v).map_err(|_| error!(CoreError::InvalidParameter));
        let u32v = || u32::try_from(v).map_err(|_| error!(CoreError::InvalidParameter));
        match id {
            ParamId::TradeFeeBps => self.trade_fee_bps = u16v()?,
            ParamId::SplitChestBps => self.split_chest_bps = u16v()?,
            ParamId::SplitShieldBps => self.split_shield_bps = u16v()?,
            ParamId::ParentShareBps => self.parent_share_bps = u16v()?,
            ParamId::BaseDiscountBps => self.base_discount_bps = u16v()?,
            ParamId::KUpBps => self.k_up_bps = u16v()?,
            ParamId::KDownBps => self.k_down_bps = u16v()?,
            ParamId::MinDiscountBps => self.min_discount_bps = u16v()?,
            ParamId::MaxDiscountBps => self.max_discount_bps = u16v()?,
            ParamId::OfferWindowSecs => self.offer_window_secs = u32v()?,
            ParamId::BidEpochSecs => self.bid_epoch_secs = u32v()?,
            ParamId::MinOfferSize => self.min_offer_size = v,
            ParamId::LotsPerOffer => self.lots_per_offer = u16v()?,
            ParamId::TicketValiditySecs => self.ticket_validity_secs = u32v()?,
            ParamId::ChestLockSecs => self.chest_lock_secs = u32v()?,
            ParamId::ChestPenaltyBps => self.chest_penalty_bps = u16v()?,
            ParamId::RedemptionFeeBps => self.redemption_fee_bps = u16v()?,
            ParamId::YieldBufferBps => self.yield_buffer_bps = u16v()?,
            ParamId::ShieldPerOfferCap => self.shield_per_offer_cap = v,
            ParamId::ShieldMaxShareBps => self.shield_max_share_bps = u16v()?,
            ParamId::ShieldMinLockSecs => self.shield_min_lock_secs = u32v()?,
            ParamId::ShieldMaxMultiplierBps => self.shield_max_multiplier_bps = u32v()?,
            ParamId::ShieldMaxPremiumBps => self.shield_max_premium_bps = u16v()?,
            ParamId::PriceTwapWindowSecs => self.price_twap_window_secs = u32v()?,
            ParamId::MomentumLookbackSecs => self.momentum_lookback_secs = u32v()?,
            ParamId::DirectSellHourlyCap => self.direct_sell_hourly_cap = v,
            ParamId::MaxSwapSlippageBps => self.max_swap_slippage_bps = u16v()?,
            ParamId::MaxSwapChunk => self.max_swap_chunk = v,
        }
        self.validate()
    }

    pub fn get(&self, id: ParamId) -> u64 {
        match id {
            ParamId::TradeFeeBps => self.trade_fee_bps as u64,
            ParamId::SplitChestBps => self.split_chest_bps as u64,
            ParamId::SplitShieldBps => self.split_shield_bps as u64,
            ParamId::ParentShareBps => self.parent_share_bps as u64,
            ParamId::BaseDiscountBps => self.base_discount_bps as u64,
            ParamId::KUpBps => self.k_up_bps as u64,
            ParamId::KDownBps => self.k_down_bps as u64,
            ParamId::MinDiscountBps => self.min_discount_bps as u64,
            ParamId::MaxDiscountBps => self.max_discount_bps as u64,
            ParamId::OfferWindowSecs => self.offer_window_secs as u64,
            ParamId::BidEpochSecs => self.bid_epoch_secs as u64,
            ParamId::MinOfferSize => self.min_offer_size,
            ParamId::LotsPerOffer => self.lots_per_offer as u64,
            ParamId::TicketValiditySecs => self.ticket_validity_secs as u64,
            ParamId::ChestLockSecs => self.chest_lock_secs as u64,
            ParamId::ChestPenaltyBps => self.chest_penalty_bps as u64,
            ParamId::RedemptionFeeBps => self.redemption_fee_bps as u64,
            ParamId::YieldBufferBps => self.yield_buffer_bps as u64,
            ParamId::ShieldPerOfferCap => self.shield_per_offer_cap,
            ParamId::ShieldMaxShareBps => self.shield_max_share_bps as u64,
            ParamId::ShieldMinLockSecs => self.shield_min_lock_secs as u64,
            ParamId::ShieldMaxMultiplierBps => self.shield_max_multiplier_bps as u64,
            ParamId::ShieldMaxPremiumBps => self.shield_max_premium_bps as u64,
            ParamId::PriceTwapWindowSecs => self.price_twap_window_secs as u64,
            ParamId::MomentumLookbackSecs => self.momentum_lookback_secs as u64,
            ParamId::DirectSellHourlyCap => self.direct_sell_hourly_cap,
            ParamId::MaxSwapSlippageBps => self.max_swap_slippage_bps as u64,
            ParamId::MaxSwapChunk => self.max_swap_chunk,
        }
    }
}

/// Identifier of a single governable parameter.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum ParamId {
    TradeFeeBps,
    SplitChestBps,
    SplitShieldBps,
    ParentShareBps,
    BaseDiscountBps,
    KUpBps,
    KDownBps,
    MinDiscountBps,
    MaxDiscountBps,
    OfferWindowSecs,
    BidEpochSecs,
    MinOfferSize,
    LotsPerOffer,
    TicketValiditySecs,
    ChestLockSecs,
    ChestPenaltyBps,
    RedemptionFeeBps,
    YieldBufferBps,
    ShieldPerOfferCap,
    ShieldMaxShareBps,
    ShieldMinLockSecs,
    ShieldMaxMultiplierBps,
    ShieldMaxPremiumBps,
    PriceTwapWindowSecs,
    MomentumLookbackSecs,
    DirectSellHourlyCap,
    MaxSwapSlippageBps,
    MaxSwapChunk,
}

/// Price source used to bound keeper swaps.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub struct OracleConfig {
    /// 0 = governance-set manual price (localnet/devnet), 1 = Pyth PriceUpdateV2.
    pub kind: u8,
    /// Pyth price-update account (kind = 1).
    pub feed: Pubkey,
    /// Manual price: quote base units per 1 SOL (1e9 lamports).
    pub manual_quote_per_sol: u64,
    pub max_staleness_secs: u32,
}

/// Lifetime fee accounting (invariant: collected == Σ components).
#[derive(
    AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq, InitSpace,
)]
pub struct FeeStats {
    pub distributed: u64,
    pub to_chests: u64,
    pub to_shield: u64,
    pub to_treasury: u64,
    pub to_parent: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub version: u8,
    pub bump: u8,
    pub treasury_bump: u8,
    pub status: u8,
    pub mint: Pubkey,
    pub quote_mint: Pubkey,
    pub quote_token_program: Pubkey,
    pub quote_decimals: u8,
    /// Parent market for launchpad children (default for BACKSTOP itself).
    pub parent: Pubkey,
    pub governance: Pubkey,
    pub pending_governance: Pubkey,
    /// May only *set* pause flags (immediate emergency stop).
    pub guardian: Pubkey,
    /// Executes fee swaps (bounded by the oracle and slippage cap).
    pub keeper: Pubkey,
    /// Swap program allowed for fee conversion (Jupiter v6 on mainnet).
    pub swap_program: Pubkey,
    pub pauses: u8,
    /// Redemption can only be paused through the 48 h timelock.
    pub redemption_paused: bool,
    pub params: MarketParams,
    pub oracle: OracleConfig,
    /// Quote ATA of this market PDA receiving all trade fees.
    pub fee_vault: Pubkey,
    /// Quote ATA of the treasury PDA (treasury share awaiting conversion).
    pub treasury_quote_vault: Pubkey,
    /// Chest program vault receiving holder rewards.
    pub holder_rewards_vault: Pubkey,
    /// Chest program vault receiving Shield rewards.
    pub shield_rewards_vault: Pubkey,
    /// Quote ATA of this market PDA holding the parent's share (children).
    pub parent_vault: Pubkey,
    /// AMM base vault (protocol-held supply excluded from circulation).
    pub amm_base_vault: Pubkey,
    pub fees: FeeStats,
    /// Lamports received from fee conversion.
    pub treasury_sol_in: u64,
    pub redeemed_tokens: u64,
    pub redeemed_lamports: u64,
    /// Redemption fees (lamports) awaiting conversion to Shield rewards.
    pub shield_lamports_pending: u64,
    pub created_at: i64,
    pub _reserved: [u8; 64],
}

/// SOL treasury PDA. Treasury SOL = lamports − rent − pending Shield fees.
#[account]
#[derive(InitSpace)]
pub struct Treasury {
    pub bump: u8,
    pub market: Pubkey,
}

/// Bounds for one agent-tunable parameter.
#[derive(
    AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq, InitSpace,
)]
pub struct ParamBound {
    pub enabled: bool,
    pub min: u64,
    pub max: u64,
    pub last_update: i64,
}

pub const PARAM_COUNT: usize = 28;

#[account]
#[derive(InitSpace)]
pub struct AgentAuthority {
    pub bump: u8,
    pub market: Pubkey,
    /// Hot key of the AI treasury agent service.
    pub agent: Pubkey,
    pub cooldown_secs: i64,
    /// Indexed by `ParamId as usize`.
    pub bounds: [ParamBound; PARAM_COUNT],
    pub updates: u64,
}

/// Actions that require the 48 h on-chain timelock.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum TimelockAction {
    /// Move lamports out of the treasury (emergency only).
    TreasuryWithdraw {
        to: Pubkey,
        lamports: u64,
    },
    SetRedemptionPaused {
        paused: bool,
    },
}

#[account]
#[derive(InitSpace)]
pub struct QueuedAction {
    pub bump: u8,
    pub market: Pubkey,
    pub id: u64,
    pub action: TimelockAction,
    pub eta: i64,
    pub queued_at: i64,
}

impl Market {
    pub fn is_paused(&self, flag: u8) -> bool {
        self.pauses & flag != 0
    }
}

impl Default for OracleConfig {
    fn default() -> Self {
        Self {
            kind: 0,
            feed: Pubkey::default(),
            manual_quote_per_sol: 0,
            max_staleness_secs: 120,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid() {
        let p = MarketParams::defaults(d::TOTAL_SUPPLY, 6);
        p.validate().unwrap();
        assert_eq!(p.min_offer_size, 100_000 * 1_000_000_000);
    }

    #[test]
    fn param_ids_round_trip() {
        let mut p = MarketParams::defaults(d::TOTAL_SUPPLY, 6);
        p.set(ParamId::YieldBufferBps, 2_500).unwrap();
        assert_eq!(p.get(ParamId::YieldBufferBps), 2_500);
        assert!(p.set(ParamId::TradeFeeBps, 5_000).is_err());
        assert!(p.set(ParamId::BaseDiscountBps, 100).is_err()); // below min
    }

    #[test]
    fn param_count_matches_enum() {
        assert_eq!(ParamId::MaxSwapChunk as usize + 1, PARAM_COUNT);
    }
}
