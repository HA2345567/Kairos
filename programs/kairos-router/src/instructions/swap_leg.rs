use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
};
use anchor_spl::token::{Token, TokenAccount};
use crate::state::BasketConfig;
use crate::errors::KairosError;

pub const RAYDIUM_CPMM_PROGRAM_ID: Pubkey = pubkey!("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb");

// Discriminator for Raydium CPMM `swap_base_input`
// SHA256("global:swap_base_input")[..8]
pub const SWAP_BASE_INPUT_DISCRIMINATOR: [u8; 8] = [0x8f, 0xbe, 0x5a, 0xda, 0xc4, 0x1e, 0x33, 0xde];

#[event]
pub struct InvestLegExecuted {
    pub user: Pubkey,
    pub basket_id: String,
    pub target_mint: Pubkey,
    pub amount_in_usdc: u64,
    pub amount_out: u64,
}

#[derive(Accounts)]
pub struct SwapAndDistributeLeg<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        constraint = user_usdc_ata.owner == user.key() @ KairosError::InvalidUserAta
    )]
    pub user_usdc_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_dest_ata.owner == user.key() @ KairosError::InvalidUserAta
    )]
    pub user_dest_ata: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"basket", basket_config.basket_id.as_bytes()],
        bump = basket_config.bump,
        constraint = basket_config.is_active @ KairosError::BasketNotActive
    )]
    pub basket_config: Account<'info, BasketConfig>,

    /// CHECK: Validated against Raydium CPMM devnet program ID
    #[account(
        constraint = cpmm_program.key() == RAYDIUM_CPMM_PROGRAM_ID @ KairosError::InvalidCpmmProgram
    )]
    pub cpmm_program: UncheckedAccount<'info>,

    /// CHECK: Raydium authority PDA
    pub authority: UncheckedAccount<'info>,

    /// CHECK: Raydium AMM config
    pub amm_config: UncheckedAccount<'info>,

    /// CHECK: Raydium pool state account
    #[account(mut)]
    pub pool_state: UncheckedAccount<'info>,

    /// CHECK: Pool input vault (USDC vault)
    #[account(mut)]
    pub input_vault: UncheckedAccount<'info>,

    /// CHECK: Pool output vault (target token vault)
    #[account(mut)]
    pub output_vault: UncheckedAccount<'info>,

    /// CHECK: Token program for input token
    pub input_token_program: UncheckedAccount<'info>,

    /// CHECK: Token program for output token
    pub output_token_program: UncheckedAccount<'info>,

    /// CHECK: Input mint (USDC)
    pub input_mint: UncheckedAccount<'info>,

    /// CHECK: Output mint (target token)
    pub output_mint: UncheckedAccount<'info>,

    /// CHECK: Observation state account
    #[account(mut)]
    pub observation_state: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, SwapAndDistributeLeg<'info>>,
    amount_in_usdc: u64,
    min_amount_out: u64,
) -> Result<()> {
    let target_mint = ctx.accounts.user_dest_ata.mint;
    let basket = &ctx.accounts.basket_config;
    let is_valid_mint = basket.items.iter().any(|item| item.mint == target_mint);
    require!(is_valid_mint, KairosError::InvalidUserAta);
    require_keys_eq!(ctx.accounts.output_mint.key(), target_mint, KairosError::InvalidUserAta);
    require_keys_eq!(ctx.accounts.input_mint.key(), ctx.accounts.user_usdc_ata.mint, KairosError::InvalidUserAta);

    // Snapshot destination balance before swap
    ctx.accounts.user_dest_ata.reload()?;
    let start_balance = ctx.accounts.user_dest_ata.amount;

    // Build Raydium CPMM swap_base_input instruction data (24 bytes)
    let mut data = Vec::with_capacity(24);
    data.extend_from_slice(&SWAP_BASE_INPUT_DISCRIMINATOR);
    data.extend_from_slice(&amount_in_usdc.to_le_bytes());
    data.extend_from_slice(&min_amount_out.to_le_bytes());

    let accounts = vec![
        AccountMeta::new_readonly(ctx.accounts.user.key(), true),
        AccountMeta::new_readonly(ctx.accounts.authority.key(), false),
        AccountMeta::new_readonly(ctx.accounts.amm_config.key(), false),
        AccountMeta::new(ctx.accounts.pool_state.key(), false),
        AccountMeta::new(ctx.accounts.user_usdc_ata.key(), false),
        AccountMeta::new(ctx.accounts.user_dest_ata.key(), false),
        AccountMeta::new(ctx.accounts.input_vault.key(), false),
        AccountMeta::new(ctx.accounts.output_vault.key(), false),
        AccountMeta::new_readonly(ctx.accounts.input_token_program.key(), false),
        AccountMeta::new_readonly(ctx.accounts.output_token_program.key(), false),
        AccountMeta::new_readonly(ctx.accounts.input_mint.key(), false),
        AccountMeta::new_readonly(ctx.accounts.output_mint.key(), false),
        AccountMeta::new(ctx.accounts.observation_state.key(), false),
    ];

    let ix = Instruction {
        program_id: *ctx.accounts.cpmm_program.key,
        accounts,
        data,
    };

    let account_infos = [
        ctx.accounts.user.to_account_info(),
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.amm_config.to_account_info(),
        ctx.accounts.pool_state.to_account_info(),
        ctx.accounts.user_usdc_ata.to_account_info(),
        ctx.accounts.user_dest_ata.to_account_info(),
        ctx.accounts.input_vault.to_account_info(),
        ctx.accounts.output_vault.to_account_info(),
        ctx.accounts.input_token_program.to_account_info(),
        ctx.accounts.output_token_program.to_account_info(),
        ctx.accounts.input_mint.to_account_info(),
        ctx.accounts.output_mint.to_account_info(),
        ctx.accounts.observation_state.to_account_info(),
    ];

    invoke(&ix, &account_infos)?;

    // Reload destination ATA and verify min_amount_out slippage check
    ctx.accounts.user_dest_ata.reload()?;
    let end_balance = ctx.accounts.user_dest_ata.amount;

    let amount_out = end_balance
        .checked_sub(start_balance)
        .ok_or(KairosError::MathOverflow)?;

    require!(amount_out >= min_amount_out, KairosError::SlippageExceeded);

    emit!(InvestLegExecuted {
        user: ctx.accounts.user.key(),
        basket_id: basket.basket_id.clone(),
        target_mint,
        amount_in_usdc,
        amount_out,
    });

    msg!(
        "Kairos CPMM Swap Leg Executed: Swapped {} USDC for {} of mint {}",
        amount_in_usdc,
        amount_out,
        target_mint
    );

    Ok(())
}
