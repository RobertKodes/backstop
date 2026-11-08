//! Launch flow (one transaction per step, enforced order):
//! `create_child` → `init_child_hook` (+ client calls hook `grow_reward_state`
//! ×4) → `mint_child_supply` → `init_child_market` → `init_child_pool` →
//! `init_child_book` → `init_child_chests` (live). Plus `claim_vested`.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{create_account, CreateAccount};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::spl_token_2022::extension::ExtensionType;
use anchor_spl::token_2022::spl_token_2022::state::Mint as T22Mint;
use anchor_spl::token_2022::{self, InitializeMint2, MintTo, SetAuthority};
use anchor_spl::token_2022_extensions::{
    metadata_pointer_initialize, token_metadata_initialize, token_metadata_update_authority,
    transfer_hook_initialize, MetadataPointerInitialize, TokenMetadataInitialize,
    TokenMetadataUpdateAuthority, TransferHookInitialize,
};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use backstop_amm::program::BackstopAmm;
use backstop_chest::program::BackstopChest;
use backstop_common::cpi::transfer_checked_with_hook;
use backstop_common::{defaults, ids, seeds};
use backstop_core::program::BackstopCore;
use backstop_core::state::{pause, Market, MarketParams, OracleConfig};
use backstop_hook::program::BackstopHook;
use backstop_hook::state::HookConfig;
use backstop_offers::program::BackstopOffers;
use spl_pod::optional_keys::OptionalNonZeroPubkey;

use crate::errors::LaunchpadError;
use crate::events::{ChildCreated, ChildLaunched, ChildStep, VestedClaimed};
use crate::state::{status, ChildLaunch, LaunchpadConfig, MAX_NAME, MAX_SYMBOL, MAX_URI};

fn launchpad_seeds(cfg: &LaunchpadConfig) -> [&[u8]; 2] {
    [seeds::LAUNCHPAD, core::slice::from_ref(&cfg.bump)]
}

fn step(child: &mut ChildLaunch, from: u8, to: u8) -> Result<()> {
    require!(child.status == from, LaunchpadError::WrongStep);
    child.status = to;
    emit!(ChildStep {
        mint: child.mint,
        status: to,
        ts: Clock::get()?.unix_timestamp
    });
    Ok(())
}

// ------------------------------------------------------------- config

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct LaunchpadArgs {
    pub child_guardian: Pubkey,
    pub child_keeper: Pubkey,
    pub swap_program: Pubkey,
    pub oracle: OracleConfig,
}

#[derive(Accounts)]
pub struct InitLaunchpad<'info> {
    #[account(mut)]
    pub governance: Signer<'info>,
    /// BACKSTOP's market; its governance owns the launchpad.
    #[account(
        seeds = [seeds::MARKET, parent_market.mint.as_ref()],
        bump = parent_market.bump,
        seeds::program = ids::CORE,
        has_one = governance @ LaunchpadError::Unauthorized,
    )]
    pub parent_market: Box<Account<'info, Market>>,
    #[account(init, payer = governance, space = 8 + LaunchpadConfig::INIT_SPACE, seeds = [seeds::LAUNCHPAD], bump)]
    pub config: Box<Account<'info, LaunchpadConfig>>,
    pub system_program: Program<'info, System>,
}

pub fn init_launchpad(ctx: Context<InitLaunchpad>, args: LaunchpadArgs) -> Result<()> {
    let c = &mut ctx.accounts.config;
    c.bump = ctx.bumps.config;
    c.governance = ctx.accounts.governance.key();
    c.parent_mint = ctx.accounts.parent_market.mint;
    c.child_governance = ctx.accounts.governance.key();
    c.child_guardian = args.child_guardian;
    c.child_keeper = args.child_keeper;
    c.swap_program = args.swap_program;
    c.oracle = args.oracle;
    c.min_liquidity_lamports = defaults::CHILD_MIN_LIQUIDITY_LAMPORTS;
    c.max_creator_bps = defaults::CHILD_MAX_CREATOR_BPS as u16;
    c.vesting_secs = defaults::CHILD_VESTING_SECS;
    c.parent_share_bps = defaults::LAUNCHPAD_PARENT_BPS as u16;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateLaunchpad<'info> {
    pub governance: Signer<'info>,
    #[account(mut, seeds = [seeds::LAUNCHPAD], bump = config.bump, has_one = governance @ LaunchpadError::Unauthorized)]
    pub config: Box<Account<'info, LaunchpadConfig>>,
}

pub fn update_launchpad(
    ctx: Context<UpdateLaunchpad>,
    args: LaunchpadArgs,
    parent_share_bps: u16,
) -> Result<()> {
    require!(parent_share_bps <= 5_000, LaunchpadError::Unauthorized);
    let c = &mut ctx.accounts.config;
    c.child_guardian = args.child_guardian;
    c.child_keeper = args.child_keeper;
    c.swap_program = args.swap_program;
    c.oracle = args.oracle;
    c.parent_share_bps = parent_share_bps;
    Ok(())
}

// ------------------------------------------------------- 1. create child

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ChildParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub supply: u64,
    pub creator_bps: u16,
    pub liquidity_lamports: u64,
}

#[derive(Accounts)]
pub struct CreateChild<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    /// Fresh keypair for the child mint.
    #[account(mut)]
    pub mint: Signer<'info>,
    #[account(seeds = [seeds::LAUNCHPAD], bump = config.bump)]
    pub config: Box<Account<'info, LaunchpadConfig>>,
    #[account(seeds = [seeds::MARKET, config.parent_mint.as_ref()], bump = parent_market.bump, seeds::program = ids::CORE)]
    pub parent_market: Box<Account<'info, Market>>,
    /// CHECK: signer-only PDA holding mint + metadata authority until `mint_child_supply`.
    #[account(seeds = [seeds::CHILD_MINT_AUTHORITY, mint.key().as_ref()], bump)]
    pub mint_authority: UncheckedAccount<'info>,
    #[account(init, payer = creator, space = 8 + ChildLaunch::INIT_SPACE, seeds = [seeds::CHILD, mint.key().as_ref()], bump)]
    pub child: Box<Account<'info, ChildLaunch>>,
    #[account(address = ids::TOKEN_2022)]
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn create_child(ctx: Context<CreateChild>, p: ChildParams) -> Result<()> {
    let cfg = &ctx.accounts.config;
    require!(
        !ctx.accounts.parent_market.is_paused(pause::LAUNCHPAD),
        LaunchpadError::Paused
    );
    require!(
        !p.name.trim().is_empty()
            && p.name.len() <= MAX_NAME
            && !p.symbol.trim().is_empty()
            && p.symbol.len() <= MAX_SYMBOL
            && p.uri.len() <= MAX_URI,
        LaunchpadError::BadMetadata
    );
    require!(p.supply >= 10_000, LaunchpadError::BadSupply);
    require!(
        p.creator_bps <= cfg.max_creator_bps,
        LaunchpadError::CreatorAllocationTooHigh
    );
    require!(
        p.liquidity_lamports >= cfg.min_liquidity_lamports,
        LaunchpadError::LiquidityTooLow
    );

    let mint_key = ctx.accounts.mint.key();
    let token_program = ctx.accounts.token_program.to_account_info();
    let mint_ai = ctx.accounts.mint.to_account_info();
    let auth_ai = ctx.accounts.mint_authority.to_account_info();

    // Fixed extensions now; the variable-length metadata TLV is appended by
    // Token-2022 during `initialize`, so fund rent for it up front.
    let space = ExtensionType::try_calculate_account_len::<T22Mint>(&[
        ExtensionType::TransferHook,
        ExtensionType::MetadataPointer,
    ])
    .map_err(|_| error!(LaunchpadError::MathOverflow))?;
    let meta_len = 4 + 32 + 32 + 4 + p.name.len() + 4 + p.symbol.len() + 4 + p.uri.len() + 4;
    let lamports = Rent::get()?.minimum_balance(space + meta_len);
    create_account(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            CreateAccount {
                from: ctx.accounts.creator.to_account_info(),
                to: mint_ai.clone(),
            },
        ),
        lamports,
        space as u64,
        &ids::TOKEN_2022,
    )?;
    transfer_hook_initialize(
        CpiContext::new(
            ids::TOKEN_2022,
            TransferHookInitialize {
                token_program_id: token_program.clone(),
                mint: mint_ai.clone(),
            },
        ),
        None,
        Some(ids::HOOK),
    )?;
    metadata_pointer_initialize(
        CpiContext::new(
            ids::TOKEN_2022,
            MetadataPointerInitialize {
                token_program_id: token_program.clone(),
                mint: mint_ai.clone(),
            },
        ),
        None,
        Some(mint_key),
    )?;
    token_2022::initialize_mint2(
        CpiContext::new(
            ids::TOKEN_2022,
            InitializeMint2 {
                mint: mint_ai.clone(),
            },
        ),
        defaults::DECIMALS,
        &auth_ai.key(),
        None,
    )?;
    let abump = [ctx.bumps.mint_authority];
    let auth_seeds: [&[u8]; 3] = [seeds::CHILD_MINT_AUTHORITY, mint_key.as_ref(), &abump];
    token_metadata_initialize(
        CpiContext::new_with_signer(
            ids::TOKEN_2022,
            TokenMetadataInitialize {
                program_id: token_program.clone(),
                metadata: mint_ai.clone(),
                update_authority: auth_ai.clone(),
                mint_authority: auth_ai.clone(),
                mint: mint_ai.clone(),
            },
            &[&auth_seeds],
        ),
        p.name.clone(),
        p.symbol.clone(),
        p.uri.clone(),
    )?;

    let now = Clock::get()?.unix_timestamp;
    let creator_amount = (p.supply as u128 * p.creator_bps as u128 / 10_000) as u64;
    let c = &mut ctx.accounts.child;
    c.bump = ctx.bumps.child;
    c.mint_auth_bump = ctx.bumps.mint_authority;
    c.status = status::CREATED;
    c.mint = mint_key;
    c.creator = ctx.accounts.creator.key();
    c.name_len = p.name.len() as u8;
    c.name[..p.name.len()].copy_from_slice(p.name.as_bytes());
    c.symbol_len = p.symbol.len() as u8;
    c.symbol[..p.symbol.len()].copy_from_slice(p.symbol.as_bytes());
    c.uri_len = p.uri.len() as u8;
    c.uri[..p.uri.len()].copy_from_slice(p.uri.as_bytes());
    c.supply = p.supply;
    c.creator_bps = p.creator_bps;
    c.creator_amount = creator_amount;
    c.liquidity_lamports = p.liquidity_lamports;
    c.created_at = now;
    emit!(ChildCreated {
        mint: mint_key,
        creator: c.creator,
        name: p.name,
        symbol: p.symbol,
        supply: p.supply,
        creator_bps: p.creator_bps,
        liquidity: p.liquidity_lamports,
        ts: now,
    });
    Ok(())
}

// ------------------------------------------------------------ 2. hook

#[derive(Accounts)]
pub struct InitChildHook<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [seeds::LAUNCHPAD], bump = config.bump)]
    pub config: Box<Account<'info, LaunchpadConfig>>,
    #[account(mut, seeds = [seeds::CHILD, mint.key().as_ref()], bump = child.bump, has_one = creator, has_one = mint)]
    pub child: Box<Account<'info, ChildLaunch>>,
    /// CHECK: the child mint (validated by the hook program).
    pub mint: UncheckedAccount<'info>,
    /// CHECK: mint-authority PDA (signs the hook initialisation).
    #[account(seeds = [seeds::CHILD_MINT_AUTHORITY, mint.key().as_ref()], bump = child.mint_auth_bump)]
    pub mint_authority: UncheckedAccount<'info>,
    /// CHECK: created by the hook program.
    #[account(mut)]
    pub hook_config: UncheckedAccount<'info>,
    /// CHECK: created by the hook program.
    #[account(mut)]
    pub extra_metas: UncheckedAccount<'info>,
    /// CHECK: created by the hook program.
    #[account(mut)]
    pub reward_state: UncheckedAccount<'info>,
    pub hook_program: Program<'info, BackstopHook>,
    pub system_program: Program<'info, System>,
}

pub fn init_child_hook(ctx: Context<InitChildHook>) -> Result<()> {
    let a = &ctx.accounts;
    let supply = a.child.supply;
    let mint_key = a.mint.key();
    let abump = [a.child.mint_auth_bump];
    let auth_seeds: [&[u8]; 3] = [seeds::CHILD_MINT_AUTHORITY, mint_key.as_ref(), &abump];
    backstop_hook::cpi::initialize(
        CpiContext::new_with_signer(
            ids::HOOK,
            backstop_hook::cpi::accounts::Initialize {
                payer: a.creator.to_account_info(),
                mint_authority: a.mint_authority.to_account_info(),
                mint: a.mint.to_account_info(),
                config: a.hook_config.to_account_info(),
                extra_metas: a.extra_metas.to_account_info(),
                reward_state: a.reward_state.to_account_info(),
                system_program: a.system_program.to_account_info(),
            },
            &[&auth_seeds],
        ),
        backstop_hook::instructions::InitializeArgs {
            governance: a.config.child_governance,
            genesis_ts: Clock::get()?.unix_timestamp,
            epoch_secs: defaults::EPOCH_SECS,
            tenure_cap_secs: defaults::TENURE_CAP_SECS,
            tenure_extra_bps: defaults::TENURE_EXTRA_BPS,
            absorb_tenure_bps: defaults::ABSORB_TENURE_BPS,
            direct_sell_cap: defaults::min_offer_size(supply),
            link_min_amount: (supply / 1_000_000).max(1),
            link_window_secs: defaults::LINK_WINDOW_SECS,
            direct_sell_window_secs: defaults::DIRECT_SELL_WINDOW_SECS,
        },
    )?;
    step(&mut ctx.accounts.child, status::CREATED, status::HOOKED)
}

// ------------------------------------------------------------ 3. mint

#[derive(Accounts)]
pub struct MintChildSupply<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [seeds::CHILD, mint.key().as_ref()], bump = child.bump, has_one = creator, has_one = mint)]
    pub child: Box<Account<'info, ChildLaunch>>,
    #[account(mut, mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: mint-authority PDA.
    #[account(seeds = [seeds::CHILD_MINT_AUTHORITY, mint.key().as_ref()], bump = child.mint_auth_bump)]
    pub mint_authority: UncheckedAccount<'info>,
    #[account(seeds = [seeds::HOOK_CONFIG, mint.key().as_ref()], bump = hook_config.bump, seeds::program = ids::HOOK)]
    pub hook_config: Box<Account<'info, HookConfig>>,
    /// CHECK: AMM pool PDA (vault authority).
    #[account(seeds = [seeds::POOL, mint.key().as_ref()], bump, seeds::program = ids::AMM)]
    pub pool_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = pool_authority,
        associated_token::token_program = token_program,
    )]
    pub pool_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: vesting PDA (allowlisted hook owner).
    #[account(seeds = [seeds::VESTING, mint.key().as_ref()], bump)]
    pub vesting_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = vesting_authority,
        associated_token::token_program = token_program,
    )]
    pub vesting_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = ids::TOKEN_2022)]
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Mint the fixed supply (pool + vested creator allocation), then revoke the
/// mint authority and freeze the metadata forever.
pub fn mint_child_supply(ctx: Context<MintChildSupply>, vesting_secs: i64) -> Result<()> {
    require!(
        ctx.accounts.hook_config.reward_ready,
        LaunchpadError::HookNotReady
    );
    let a = &ctx.accounts;
    let mint_key = a.mint.key();
    let abump = [a.child.mint_auth_bump];
    let auth_seeds: [&[u8]; 3] = [seeds::CHILD_MINT_AUTHORITY, mint_key.as_ref(), &abump];
    let signer: &[&[&[u8]]] = &[&auth_seeds];
    let to_pool = a.child.supply - a.child.creator_amount;
    let mint_ai = a.mint.to_account_info();
    let auth_ai = a.mint_authority.to_account_info();
    token_2022::mint_to(
        CpiContext::new_with_signer(
            ids::TOKEN_2022,
            MintTo {
                mint: mint_ai.clone(),
                to: a.pool_vault.to_account_info(),
                authority: auth_ai.clone(),
            },
            signer,
        ),
        to_pool,
    )?;
    if a.child.creator_amount > 0 {
        token_2022::mint_to(
            CpiContext::new_with_signer(
                ids::TOKEN_2022,
                MintTo {
                    mint: mint_ai.clone(),
                    to: a.vesting_vault.to_account_info(),
                    authority: auth_ai.clone(),
                },
                signer,
            ),
            a.child.creator_amount,
        )?;
    }
    token_2022::set_authority(
        CpiContext::new_with_signer(
            ids::TOKEN_2022,
            SetAuthority {
                current_authority: auth_ai.clone(),
                account_or_mint: mint_ai.clone(),
            },
            signer,
        ),
        anchor_spl::token_2022::spl_token_2022::instruction::AuthorityType::MintTokens,
        None,
    )?;
    token_metadata_update_authority(
        CpiContext::new_with_signer(
            ids::TOKEN_2022,
            TokenMetadataUpdateAuthority {
                program_id: a.token_program.to_account_info(),
                metadata: mint_ai.clone(),
                current_authority: auth_ai.clone(),
                new_authority: auth_ai.clone(),
            },
            signer,
        ),
        OptionalNonZeroPubkey::default(),
    )?;
    let now = Clock::get()?.unix_timestamp;
    let _ = vesting_secs;
    let c = &mut ctx.accounts.child;
    c.vesting_bump = ctx.bumps.vesting_authority;
    c.vesting_start = now;
    c.vesting_end = now + defaults::CHILD_VESTING_SECS;
    step(c, status::HOOKED, status::MINTED)
}

// ---------------------------------------------------------- 4. market

#[derive(Accounts)]
pub struct InitChildMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [seeds::LAUNCHPAD], bump = config.bump)]
    pub config: Box<Account<'info, LaunchpadConfig>>,
    #[account(mut, seeds = [seeds::CHILD, mint.key().as_ref()], bump = child.bump, has_one = creator, has_one = mint)]
    pub child: Box<Account<'info, ChildLaunch>>,
    /// CHECK: validated by core.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: validated by core.
    pub hook_config: UncheckedAccount<'info>,
    #[account(address = ids::WSOL)]
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: created by core.
    #[account(mut)]
    pub market: UncheckedAccount<'info>,
    /// CHECK: created by core.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: created by core.
    #[account(mut)]
    pub fee_vault: UncheckedAccount<'info>,
    /// CHECK: created by core.
    #[account(mut)]
    pub treasury_quote_vault: UncheckedAccount<'info>,
    /// CHECK: created by core.
    #[account(mut)]
    pub parent_vault: UncheckedAccount<'info>,
    #[account(address = ids::TOKEN)]
    pub quote_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub core_program: Program<'info, BackstopCore>,
}

pub fn init_child_market(ctx: Context<InitChildMarket>) -> Result<()> {
    let a = &ctx.accounts;
    let cfg = &a.config;
    let mut params = MarketParams::defaults(a.child.supply, 9);
    params.parent_share_bps = cfg.parent_share_bps;
    let ls = launchpad_seeds(cfg);
    backstop_core::cpi::init_market(
        CpiContext::new_with_signer(
            ids::CORE,
            backstop_core::cpi::accounts::InitMarket {
                payer: a.creator.to_account_info(),
                authority: a.config.to_account_info(),
                mint: a.mint.to_account_info(),
                hook_config: a.hook_config.to_account_info(),
                quote_mint: a.quote_mint.to_account_info(),
                market: a.market.to_account_info(),
                treasury: a.treasury.to_account_info(),
                fee_vault: a.fee_vault.to_account_info(),
                treasury_quote_vault: a.treasury_quote_vault.to_account_info(),
                parent_vault: a.parent_vault.to_account_info(),
                quote_token_program: a.quote_token_program.to_account_info(),
                associated_token_program: a.associated_token_program.to_account_info(),
                system_program: a.system_program.to_account_info(),
            },
            &[&ls],
        ),
        backstop_core::instructions::InitMarketArgs {
            governance: cfg.child_governance,
            guardian: cfg.child_guardian,
            keeper: cfg.child_keeper,
            swap_program: cfg.swap_program,
            oracle: cfg.oracle,
            params: Some(params),
            parent: cfg.parent_mint,
        },
    )?;
    step(&mut ctx.accounts.child, status::MINTED, status::MARKET)
}

// ------------------------------------------------------------ 5. pool

#[derive(Accounts)]
pub struct InitChildPool<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [seeds::LAUNCHPAD], bump = config.bump)]
    pub config: Box<Account<'info, LaunchpadConfig>>,
    #[account(mut, seeds = [seeds::CHILD, mint.key().as_ref()], bump = child.bump, has_one = creator, has_one = mint)]
    pub child: Box<Account<'info, ChildLaunch>>,
    /// CHECK: validated by the AMM.
    pub market: UncheckedAccount<'info>,
    /// CHECK: validated by the AMM.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: validated by the AMM.
    pub quote_mint: UncheckedAccount<'info>,
    /// CHECK: created by the AMM.
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,
    /// CHECK: validated by the AMM.
    pub amm_base_vault: UncheckedAccount<'info>,
    /// CHECK: created by the AMM.
    #[account(mut)]
    pub quote_vault: UncheckedAccount<'info>,
    /// Creator's wSOL account funding the locked liquidity.
    #[account(mut)]
    pub creator_wsol: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: Token-2022 (validated by the AMM).
    pub base_token_program: UncheckedAccount<'info>,
    /// CHECK: SPL Token (validated by the AMM).
    pub quote_token_program: UncheckedAccount<'info>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub amm_program: Program<'info, BackstopAmm>,
}

pub fn init_child_pool(ctx: Context<InitChildPool>) -> Result<()> {
    let a = &ctx.accounts;
    let ls = launchpad_seeds(&a.config);
    backstop_amm::cpi::init_pool(
        CpiContext::new_with_signer(
            ids::AMM,
            backstop_amm::cpi::accounts::InitPool {
                payer: a.creator.to_account_info(),
                authority: a.config.to_account_info(),
                market: a.market.to_account_info(),
                mint: a.mint.to_account_info(),
                quote_mint: a.quote_mint.to_account_info(),
                pool: a.pool.to_account_info(),
                amm_base_vault: a.amm_base_vault.to_account_info(),
                quote_vault: a.quote_vault.to_account_info(),
                payer_quote: a.creator_wsol.to_account_info(),
                base_token_program: a.base_token_program.to_account_info(),
                quote_token_program: a.quote_token_program.to_account_info(),
                associated_token_program: a.associated_token_program.to_account_info(),
                system_program: a.system_program.to_account_info(),
            },
            &[&ls],
        ),
        a.child.liquidity_lamports,
    )?;
    step(&mut ctx.accounts.child, status::MARKET, status::POOL)
}

// ------------------------------------------------------------ 6. book

#[derive(Accounts)]
pub struct InitChildBook<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [seeds::LAUNCHPAD], bump = config.bump)]
    pub config: Box<Account<'info, LaunchpadConfig>>,
    #[account(mut, seeds = [seeds::CHILD, mint.key().as_ref()], bump = child.bump, has_one = creator, has_one = mint)]
    pub child: Box<Account<'info, ChildLaunch>>,
    /// CHECK: validated by offers.
    pub market: UncheckedAccount<'info>,
    /// CHECK: validated by offers.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: validated by offers.
    pub quote_mint: UncheckedAccount<'info>,
    /// CHECK: created by offers.
    #[account(mut)]
    pub book: UncheckedAccount<'info>,
    /// CHECK: created by offers.
    #[account(mut)]
    pub escrow_vault: UncheckedAccount<'info>,
    /// CHECK: Token-2022.
    pub base_token_program: UncheckedAccount<'info>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub offers_program: Program<'info, BackstopOffers>,
}

pub fn init_child_book(ctx: Context<InitChildBook>) -> Result<()> {
    let a = &ctx.accounts;
    let ls = launchpad_seeds(&a.config);
    backstop_offers::cpi::init_book(CpiContext::new_with_signer(
        ids::OFFERS,
        backstop_offers::cpi::accounts::InitBook {
            payer: a.creator.to_account_info(),
            authority: a.config.to_account_info(),
            market: a.market.to_account_info(),
            mint: a.mint.to_account_info(),
            quote_mint: a.quote_mint.to_account_info(),
            book: a.book.to_account_info(),
            escrow_vault: a.escrow_vault.to_account_info(),
            base_token_program: a.base_token_program.to_account_info(),
            associated_token_program: a.associated_token_program.to_account_info(),
            system_program: a.system_program.to_account_info(),
        },
        &[&ls],
    ))?;
    step(&mut ctx.accounts.child, status::POOL, status::BOOK)
}

// ---------------------------------------------------------- 7. chests

#[derive(Accounts)]
pub struct InitChildChests<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [seeds::LAUNCHPAD], bump = config.bump)]
    pub config: Box<Account<'info, LaunchpadConfig>>,
    #[account(mut, seeds = [seeds::CHILD, mint.key().as_ref()], bump = child.bump, has_one = creator, has_one = mint)]
    pub child: Box<Account<'info, ChildLaunch>>,
    /// CHECK: validated by chest.
    pub market: UncheckedAccount<'info>,
    /// CHECK: validated by chest.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: validated by chest.
    pub quote_mint: UncheckedAccount<'info>,
    /// CHECK: created by chest.
    #[account(mut)]
    pub chest_market: UncheckedAccount<'info>,
    /// CHECK: created by chest.
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: chest rewards authority PDA.
    pub rewards_auth: UncheckedAccount<'info>,
    /// CHECK: created by chest.
    #[account(mut)]
    pub holder_rewards_vault: UncheckedAccount<'info>,
    /// CHECK: created by chest.
    #[account(mut)]
    pub shield: UncheckedAccount<'info>,
    /// CHECK: created by chest.
    #[account(mut)]
    pub shield_quote_vault: UncheckedAccount<'info>,
    /// CHECK: created by chest.
    #[account(mut)]
    pub shield_token_vault: UncheckedAccount<'info>,
    /// CHECK: created by chest.
    #[account(mut)]
    pub shield_rewards_vault: UncheckedAccount<'info>,
    /// CHECK: Token-2022.
    pub base_token_program: UncheckedAccount<'info>,
    /// CHECK: SPL Token.
    pub quote_token_program: UncheckedAccount<'info>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub chest_program: Program<'info, BackstopChest>,
}

pub fn init_child_chests(ctx: Context<InitChildChests>) -> Result<()> {
    let a = &ctx.accounts;
    let ls = launchpad_seeds(&a.config);
    backstop_chest::cpi::init_chest_market(CpiContext::new_with_signer(
        ids::CHEST,
        backstop_chest::cpi::accounts::InitChestMarket {
            payer: a.creator.to_account_info(),
            authority: a.config.to_account_info(),
            market: a.market.to_account_info(),
            mint: a.mint.to_account_info(),
            quote_mint: a.quote_mint.to_account_info(),
            chest_market: a.chest_market.to_account_info(),
            vault: a.vault.to_account_info(),
            rewards_auth: a.rewards_auth.to_account_info(),
            holder_rewards_vault: a.holder_rewards_vault.to_account_info(),
            shield: a.shield.to_account_info(),
            shield_quote_vault: a.shield_quote_vault.to_account_info(),
            shield_token_vault: a.shield_token_vault.to_account_info(),
            shield_rewards_vault: a.shield_rewards_vault.to_account_info(),
            base_token_program: a.base_token_program.to_account_info(),
            quote_token_program: a.quote_token_program.to_account_info(),
            associated_token_program: a.associated_token_program.to_account_info(),
            system_program: a.system_program.to_account_info(),
        },
        &[&ls],
    ))?;
    let parent = a.config.parent_mint;
    ctx.accounts.config.children += 1;
    let c = &mut ctx.accounts.child;
    step(c, status::BOOK, status::LIVE)?;
    emit!(ChildLaunched {
        mint: c.mint,
        parent,
        creator: c.creator,
        name: c.name_str(),
        symbol: c.symbol_str(),
        uri: c.uri_str(),
        supply: c.supply,
        creator_bps: c.creator_bps,
        liquidity: c.liquidity_lamports,
        vesting_end: c.vesting_end,
        ts: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

// ----------------------------------------------------------- vesting

#[derive(Accounts)]
pub struct ClaimVested<'info> {
    pub creator: Signer<'info>,
    #[account(mut, seeds = [seeds::CHILD, mint.key().as_ref()], bump = child.bump, has_one = creator, has_one = mint)]
    pub child: Box<Account<'info, ChildLaunch>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: vesting PDA (signs the transfer).
    #[account(seeds = [seeds::VESTING, mint.key().as_ref()], bump = child.vesting_bump)]
    pub vesting_authority: UncheckedAccount<'info>,
    #[account(mut, token::mint = mint, token::authority = vesting_authority, token::token_program = token_program)]
    pub vesting_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = creator, token::token_program = token_program)]
    pub creator_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = ids::TOKEN_2022)]
    pub token_program: Interface<'info, TokenInterface>,
    // remaining accounts: hook accounts for vesting → creator
}

/// Claim the linearly vested part of the creator allocation (90 days).
pub fn claim_vested<'info>(ctx: Context<'info, ClaimVested<'info>>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    require!(a.child.status >= status::MINTED, LaunchpadError::WrongStep);
    let vested = a.child.vested(now);
    let amount = vested.saturating_sub(a.child.vested_claimed);
    require!(amount > 0, LaunchpadError::NothingToClaim);
    let mint_key = a.mint.key();
    let vbump = [a.child.vesting_bump];
    let vseeds: [&[u8]; 3] = [seeds::VESTING, mint_key.as_ref(), &vbump];
    transfer_checked_with_hook(
        &a.token_program.to_account_info(),
        &a.vesting_vault.to_account_info(),
        &a.mint.to_account_info(),
        &a.creator_token.to_account_info(),
        &a.vesting_authority.to_account_info(),
        ctx.remaining_accounts,
        amount,
        defaults::DECIMALS,
        &[&vseeds],
    )?;
    let c = &mut ctx.accounts.child;
    c.vested_claimed += amount;
    emit!(VestedClaimed {
        mint: mint_key,
        creator: c.creator,
        amount,
        total_claimed: c.vested_claimed,
        ts: now
    });
    Ok(())
}
