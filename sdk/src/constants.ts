import { PublicKey } from "@solana/web3.js";

/** Program IDs — must match `declare_id!` in each program (and backstop-common). */
export const PROGRAM_IDS = {
  hook: new PublicKey("g86T56A9yM46y5cyVCVzB1K6MtV5cx89DsFiapy59eP"),
  core: new PublicKey("AstnKdypNsaRAxX88cTCDCit11mCqeRRnQ2x6cfZJFzK"),
  amm: new PublicKey("8m9GWYsGaqmGECJnN6kipQXiaJfk8t2MhS8U5LugUw8b"),
  offers: new PublicKey("DW1bgui9AwKGmBxRryjGn6CtKYfo2aXuyeHXLxzewGj"),
  chest: new PublicKey("5Hwrxz9JJoGxcZNSzP7TTAju2C2KMPtNBHtdifnU3tB5"),
  launchpad: new PublicKey("ZzoHe1DMEHWDVnHQs7UnHJF8p6pdRVpk7629ygyLEXU"),
  mockSwap: new PublicKey("6Z91SCsTwG12QF5A52G2TcvWXSrzToVe4d574TX3CHVg"),
  mockLending: new PublicKey("CFjsjWmeiniEPZoqm7sfRZErbTdAk5sHmQ2HTdBYyCwu"),
} as const;

export const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const INSTRUCTIONS_SYSVAR = new PublicKey("Sysvar1nstructions1111111111111111111111111");
export const SLOT_HASHES_SYSVAR = new PublicKey("SysvarS1otHashes111111111111111111111111111");
export const USDC_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
export const WSOL = new PublicKey("So11111111111111111111111111111111111111112");
export const JUPITER_V6 = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

export const DECIMALS = 9;
export const TOKEN_UNIT = 10n ** 9n;
export const PRICE_SCALE = 10n ** 18n;
export const BPS = 10_000n;

/** Default parameters (spec §3) — informational; on-chain values are authoritative. */
export const DEFAULTS = {
  totalSupply: 1_000_000_000n * TOKEN_UNIT,
  tradeFeeBps: 300,
  splitChestBps: 7_000,
  splitShieldBps: 1_000,
  baseDiscountBps: 500,
  offerWindowSecs: 600,
  bidEpochSecs: 60,
  tenureCapSecs: 90 * 86_400,
  tenureExtraBps: 20_000,
  absorbTenureBps: 4_000,
  ticketValiditySecs: 7 * 86_400,
  chestLockSecs: 60 * 86_400,
  chestPenaltyBps: 2_500,
  redemptionFeeBps: 100,
  launchpadParentBps: 3_000,
  epochSecs: 6 * 3_600,
  yieldBufferBps: 2_000,
  shieldMaxShareBps: 5_000,
  shieldMinLockSecs: 30 * 86_400,
} as const;

/** Inline epoch catch-up bound of the hook (D-033). */
export const INLINE_CATCH_UP = 32;
