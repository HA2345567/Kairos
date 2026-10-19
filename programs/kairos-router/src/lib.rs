use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::*;

declare_id!("3jWJZPdDou1h8UrT871Qi573yqQkFYYW8Jqiug9Pne5w");

// Anchor's #[program] codegen expects each `__client_accounts_<ix>` module to
// be addressable at the crate root, but #[derive(Accounts)] emits it next to
// the struct (inside instructions::*). Re-export so `crate::__client_accounts_*`
// resolves.
pub(crate) use instructions::initialize_global::__client_accounts_initialize_global;
pub(crate) use instructions::initialize_publish_authorities::__client_accounts_initialize_publish_authorities;
pub(crate) use instructions::initialize_basket::__client_accounts_initialize_basket;
pub(crate) use instructions::admin::__client_accounts_set_active;
pub(crate) use instructions::admin::__client_accounts_set_global_pause;
pub(crate) use instructions::publish_version::__client_accounts_publish_version;
pub(crate) use instructions::publish_version_extended::__client_accounts_publish_version_extended;
pub(crate) use instructions::swap_leg::__client_accounts_swap_and_distribute_leg;
pub(crate) use instructions::swap_leg_reverse::__client_accounts_swap_and_collect_leg;

#[program]
pub mod kairos_router {
    use super::*;

    /// One-time program setup: admin (= payer), pinned USDC mint, treasury,
    /// platform fee.
    pub fn initialize_global(
        ctx: Context<InitializeGlobal>,
        usdc_mint: Pubkey,
        treasury: Pubkey,
        fee_bps: u16,
    ) -> Result<()> {
        instructions::initialize_global::handler(ctx, usdc_mint, treasury, fee_bps)
    }

    /// One-time 2-of-3 publish authority setup, preserving existing global PDA layout.
    pub fn initialize_publish_authorities(
        ctx: Context<InitializePublishAuthorities>,
        additional_approvers: [Pubkey; 2],
    ) -> Result<()> {
        instructions::initialize_publish_authorities::handler(ctx, additional_approvers)
    }

    /// Admin-only basket creation (up to 10 legs, weights sum 10,000 bps).
    pub fn initialize_basket(
        ctx: Context<InitializeBasket>,
        basket_id: String,
        name: String,
        items: [BasketItem; MAX_LEGS],
        leg_count: u8,
    ) -> Result<()> {
        instructions::initialize_basket::handler(ctx, basket_id, name, items, leg_count)
    }

    /// Per-basket kill switch.
    pub fn set_active(ctx: Context<SetActive>, is_active: bool) -> Result<()> {
        instructions::admin::set_active_handler(ctx, is_active)
    }

    /// Global kill switch — halts purchases while preserving user exits.
    pub fn set_global_pause(ctx: Context<SetGlobalPause>, paused: bool) -> Result<()> {
        instructions::admin::set_global_pause_handler(ctx, paused)
    }

    /// Admin-only version registry entry with a legs_hash commitment.
    pub fn publish_version(
        ctx: Context<PublishVersion>,
        basket_id: String,
        version: u32,
        items: [BasketItem; MAX_LEGS],
        leg_count: u8,
        legs_hash: [u8; 32],
    ) -> Result<()> {
        instructions::publish_version::handler(ctx, basket_id, version, items, leg_count, legs_hash)
    }

    /// Publishes an 11–12-leg version using an overflow PDA, preserving the
    /// serialized layout of existing basket and version accounts.
    pub fn publish_version_extended(
        ctx: Context<PublishVersionExtended>,
        basket_id: String,
        version: u32,
        items: Vec<BasketItem>,
        legs_hash: [u8; 32],
    ) -> Result<()> {
        instructions::publish_version_extended::handler(ctx, basket_id, version, items, legs_hash)
    }

    /// BUY leg: USDC → asset (fee input-side, memo, atomic).
    pub fn swap_and_distribute_leg<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, SwapAndDistributeLeg<'info>>,
        version: u32,
        fee_bps: u16,
        amount_in_usdc: u64,
        min_amount_out: u64,
        memo: String,
    ) -> Result<()> {
        instructions::swap_leg::handler(ctx, version, fee_bps, amount_in_usdc, min_amount_out, memo)
    }

    /// SELL leg: asset → USDC (fee taken from proceeds, memo, atomic).
    pub fn swap_and_collect_leg<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, SwapAndCollectLeg<'info>>,
        version: u32,
        fee_bps: u16,
        amount_in_asset: u64,
        min_usdc_out: u64,
        memo: String,
    ) -> Result<()> {
        instructions::swap_leg_reverse::handler(ctx, version, fee_bps, amount_in_asset, min_usdc_out, memo)
    }
}
