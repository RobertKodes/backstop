use anchor_lang::prelude::*;
use backstop_math::twap::{Observation, Oracle, OBSERVATIONS};

#[zero_copy]
#[derive(Default, Debug, PartialEq, Eq)]
pub struct PodU128 {
    pub bytes: [u8; 16],
}

impl PodU128 {
    pub fn get(&self) -> u128 {
        u128::from_le_bytes(self.bytes)
    }
    pub fn set(&mut self, v: u128) {
        self.bytes = v.to_le_bytes();
    }
}

#[zero_copy]
#[derive(Default, Debug)]
pub struct PodObservation {
    pub ts: i64,
    pub cumulative: PodU128,
}

/// Constant-product pool. Liquidity is protocol-owned and cannot be
/// withdrawn (D-015). Reserves are tracked internally (donations ignored).
#[account(zero_copy)]
pub struct Pool {
    pub mint: Pubkey,
    pub quote_mint: Pubkey,
    pub market: Pubkey,
    pub base_vault: Pubkey,
    pub quote_vault: Pubkey,
    pub fee_vault: Pubkey,
    pub base_reserve: u64,
    pub quote_reserve: u64,
    pub fees_collected: u64,
    pub volume_base: u64,
    pub volume_quote: u64,
    pub swaps: u64,
    pub direct_hour_start: i64,
    pub direct_hour_sold: u64,
    pub created_at: i64,
    pub oracle_last_ts: i64,
    pub oracle_head: u16,
    pub oracle_len: u16,
    pub oracle_min_interval: u32,
    pub bump: u8,
    pub version: u8,
    pub quote_decimals: u8,
    pub _pad: [u8; 5],
    pub oracle_cumulative: PodU128,
    pub oracle_last_price: PodU128,
    pub observations: [PodObservation; OBSERVATIONS],
    pub _reserved: [u8; 64],
}

impl Pool {
    pub const SIZE: usize = 8 + core::mem::size_of::<Pool>();

    pub fn oracle(&self) -> Oracle {
        let mut obs = [Observation::default(); OBSERVATIONS];
        for (o, p) in obs.iter_mut().zip(self.observations.iter()) {
            *o = Observation { ts: p.ts, cumulative: p.cumulative.get() };
        }
        Oracle {
            cumulative: self.oracle_cumulative.get(),
            last_ts: self.oracle_last_ts,
            last_price: self.oracle_last_price.get(),
            obs,
            head: self.oracle_head,
            len: self.oracle_len,
            min_interval: self.oracle_min_interval,
        }
    }

    pub fn set_oracle(&mut self, o: &Oracle) {
        self.oracle_cumulative.set(o.cumulative);
        self.oracle_last_ts = o.last_ts;
        self.oracle_last_price.set(o.last_price);
        self.oracle_head = o.head;
        self.oracle_len = o.len;
        self.oracle_min_interval = o.min_interval;
        for (p, ob) in self.observations.iter_mut().zip(o.obs.iter()) {
            p.ts = ob.ts;
            p.cumulative.set(ob.cumulative);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout() {
        assert_eq!(core::mem::size_of::<PodObservation>(), 24);
        assert_eq!(core::mem::size_of::<Pool>() % 8, 0);
        let mut p: Pool = bytemuck::Zeroable::zeroed();
        let mut o = Oracle::new(5, 77, 60);
        o.update(100);
        p.set_oracle(&o);
        assert_eq!(p.oracle(), o);
    }
}
