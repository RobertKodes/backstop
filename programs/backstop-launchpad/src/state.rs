use anchor_lang::prelude::*;
use backstop_core::state::OracleConfig;

pub const MAX_NAME: usize = 32;
pub const MAX_SYMBOL: usize = 10;
pub const MAX_URI: usize = 200;

pub mod status {
    pub const CREATED: u8 = 0;
    pub const HOOKED: u8 = 1;
    pub const MINTED: u8 = 2;
    pub const MARKET: u8 = 3;
    pub const POOL: u8 = 4;
    pub const BOOK: u8 = 5;
    pub const LIVE: u8 = 6;
}

/// Global launchpad settings (`["launchpad"]`). This PDA is also the
/// authority other programs accept for child-market initialisation.
#[account]
#[derive(InitSpace)]
pub struct LaunchpadConfig {
    pub bump: u8,
    pub governance: Pubkey,
    /// BACKSTOP mint: children route their parent share here.
    pub parent_mint: Pubkey,
    /// Governance installed on every child's hook config and market.
    pub child_governance: Pubkey,
    pub child_guardian: Pubkey,
    pub child_keeper: Pubkey,
    pub swap_program: Pubkey,
    pub oracle: OracleConfig,
    pub min_liquidity_lamports: u64,
    pub max_creator_bps: u16,
    pub vesting_secs: i64,
    pub parent_share_bps: u16,
    pub children: u64,
}

/// One child launch (`["child", mint]`).
#[account]
#[derive(InitSpace)]
pub struct ChildLaunch {
    pub bump: u8,
    pub mint_auth_bump: u8,
    pub vesting_bump: u8,
    pub status: u8,
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub name_len: u8,
    pub name: [u8; MAX_NAME],
    pub symbol_len: u8,
    pub symbol: [u8; MAX_SYMBOL],
    pub uri_len: u8,
    pub uri: [u8; MAX_URI],
    pub supply: u64,
    pub creator_bps: u16,
    pub creator_amount: u64,
    pub liquidity_lamports: u64,
    pub created_at: i64,
    pub vesting_start: i64,
    pub vesting_end: i64,
    pub vested_claimed: u64,
}

impl ChildLaunch {
    pub fn name_str(&self) -> String {
        String::from_utf8_lossy(&self.name[..self.name_len as usize]).into_owned()
    }
    pub fn symbol_str(&self) -> String {
        String::from_utf8_lossy(&self.symbol[..self.symbol_len as usize]).into_owned()
    }
    pub fn uri_str(&self) -> String {
        String::from_utf8_lossy(&self.uri[..self.uri_len as usize]).into_owned()
    }

    /// Linearly vested creator allocation at `now`.
    pub fn vested(&self, now: i64) -> u64 {
        if self.creator_amount == 0 || now <= self.vesting_start {
            return 0;
        }
        if now >= self.vesting_end {
            return self.creator_amount;
        }
        let elapsed = (now - self.vesting_start) as u128;
        let dur = (self.vesting_end - self.vesting_start) as u128;
        (self.creator_amount as u128 * elapsed / dur) as u64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linear_vesting() {
        let mut c: ChildLaunch = unsafe { core::mem::zeroed() };
        c.creator_amount = 900;
        c.vesting_start = 100;
        c.vesting_end = 1_000;
        assert_eq!(c.vested(50), 0);
        assert_eq!(c.vested(550), 450);
        assert_eq!(c.vested(5_000), 900);
    }
}
