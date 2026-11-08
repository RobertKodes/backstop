//! Allocation randomness (D-023): the hash of a slot committed *before* it is
//! produced. At bid close the offer records `rand_slot = now_slot + 4`;
//! settlement reads that slot's bank hash from the SlotHashes sysvar (kept for
//! 512 slots) and derives the seed. The cranker cannot choose the slot; a
//! leader of `rand_slot` can grind a handful of bank hashes, and a censoring
//! cranker can force at most one re-roll per ~512 slots. Either moves the
//! allocation by at most one lot per bidder (zero-sum between bidders).

use anchor_lang::prelude::*;

use crate::errors::OffersError;

pub const SLOT_HASHES: Pubkey =
    Pubkey::from_str_const("SysvarS1otHashes111111111111111111111111111");
/// Slots after `rand_slot` beyond which its hash may be gone.
pub const SLOT_HASH_RETENTION: u64 = 500;

/// Look up the bank hash of `slot` in the raw SlotHashes sysvar data
/// (`len: u64` followed by `(slot: u64, hash: [u8; 32])` sorted by
/// descending slot). Binary search on the raw bytes — no deserialisation.
pub fn slot_hash(sysvar: &AccountInfo, slot: u64) -> Result<[u8; 32]> {
    require_keys_eq!(
        sysvar.key(),
        SLOT_HASHES,
        OffersError::RandomnessUnavailable
    );
    let d = sysvar.try_borrow_data()?;
    require!(d.len() >= 8, OffersError::RandomnessUnavailable);
    let n = u64::from_le_bytes(d[0..8].try_into().unwrap()) as usize;
    let entry = |i: usize| -> Option<(u64, &[u8])> {
        let off = 8 + i * 40;
        let s = d.get(off..off + 8)?;
        let h = d.get(off + 8..off + 40)?;
        Some((u64::from_le_bytes(s.try_into().ok()?), h))
    };
    let (mut lo, mut hi) = (0usize, n);
    while lo < hi {
        let mid = (lo + hi) / 2;
        let (s, h) = entry(mid).ok_or(OffersError::RandomnessUnavailable)?;
        if s == slot {
            let mut out = [0u8; 32];
            out.copy_from_slice(h);
            return Ok(out);
        }
        // descending order
        if s > slot {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    err!(OffersError::RandomnessUnavailable)
}

/// `sha256("backstop-alloc" ‖ slot_hash ‖ offer ‖ id)`.
pub fn allocation_seed(hash: &[u8; 32], offer: &Pubkey, id: u64) -> [u8; 32] {
    solana_sha256_hasher::hashv(&[b"backstop-alloc", hash, offer.as_ref(), &id.to_le_bytes()])
        .to_bytes()
}
