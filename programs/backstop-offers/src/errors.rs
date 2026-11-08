use anchor_lang::prelude::*;
use backstop_math::MathResult;

#[error_code]
pub enum OffersError {
    #[msg("Caller is not authorised")]
    Unauthorized,
    #[msg("New offers are paused (emergency)")]
    OffersPaused,
    #[msg("Offer is below the minimum offer size; sell directly on the AMM")]
    BelowMinimumOffer,
    #[msg("Seller must have a registered holder account")]
    HolderRequired,
    #[msg("Offer message exceeds 140 bytes")]
    MessageTooLong,
    #[msg("Offer is not open for bids")]
    NotOpen,
    #[msg("Bidding window has ended")]
    WindowEnded,
    #[msg("Sellers cannot bid on their own offers")]
    SelfBid,
    #[msg("Bidder funded the seller within the self-fill window")]
    LinkedWallet,
    #[msg("Bid is smaller than one lot")]
    BidTooSmall,
    #[msg("Bidding cannot be closed yet")]
    CannotCloseYet,
    #[msg("Offer is not ready to settle")]
    NotClosing,
    #[msg("Randomness slot not reached yet")]
    RandomnessPending,
    #[msg("Randomness unavailable for the committed slot (re-arm with close_bidding)")]
    RandomnessUnavailable,
    #[msg("Shield slice exceeds the maximum share")]
    ShieldSliceTooLarge,
    #[msg("Offer is not settled")]
    NotSettled,
    #[msg("Remainder already sold or nothing to sell")]
    NoRemainder,
    #[msg("Offer still has unclaimed bids or unsold remainder")]
    OfferNotFinished,
    #[msg("Account does not match the offer")]
    AccountMismatch,
    #[msg("Return Ticket expired or exhausted")]
    TicketUnavailable,
    #[msg("Arithmetic error")]
    MathOverflow,
}

pub trait MathExt<T> {
    fn mx(self) -> Result<T>;
}

impl<T> MathExt<T> for MathResult<T> {
    #[inline]
    fn mx(self) -> Result<T> {
        self.map_err(|e| {
            msg!("math error: {}", e);
            error!(OffersError::MathOverflow)
        })
    }
}
