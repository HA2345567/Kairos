use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
};
use anchor_spl::token::{Token, TokenAccount};
use crate::errors::KairosError;
use crate::state::{BasketConfig, GlobalConfig};
use crate::instructions::swap_leg::{RAYDIUM_CPMM_PROGRAM_ID, MEMO_V2_PROGRAM_ID, SWAP_BASE_INPUT_DISCRIMINATOR};

#[event]
pub struct SellLegExecuted {
    pub user: Pubkey,
    pub basket_id: String,
    pub sold_mint: Pubkey,
    pub amount_in: u64,
    pub usdc_out: u64,
    pub fee_usdc: u64,
}

/// SELL leg (close/rebalance): one basket asset → USDC, then the platform fee
/// is taken OUT of the realized USDC proceeds (output-side). The user has no
/// USDC balance to pre-charge, and "never both sides" (PRD §4.4) still holds.
/// The pool accounts are the SAME Raydium CPMM pool as the buy leg with the
/// input/output roles swapped by the caller (backend).
#[derive(Accounts)]
pub struct SwapAndCollectLeg<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    // Exits remain available during a global pause (PRD X11).
    #[account(seeds = [b"global"], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    #[account(
        mut,
        constraint = user_usdc_ata.owner == user.key() @ KairosError::InvalidUserAta,
        constraint = user_usdc_ata.mint == global_config.usdc_mint @ KairosError::UsdcMintMismatch
    )]
    pub user_usdc_ata: Account<'info, TokenAccount>,

    /// The asset ATA being sold.
    #[account(
        mut,
        constraint = user_src_ata.owner == user.key() @ KairosError::InvalidUserAta
    )]
    pub user_src_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = treasury_usdc_ata.owner == global_config.treasury @ KairosError::InvalidTreasuryAta,
        constraint = treasury_usdc_ata.mint == global_config.usdc_mint @ KairosError::InvalidTreasuryAta
    )]
    pub treasury_usdc_ata: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"basket", basket_config.basket_id.as_bytes()],
        bump = basket_config.bump
    )]
    pub basket_config: Box<Account<'info, BasketConfig>>,

    /// CHECK: Validated against Raydium CPMM program ID
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

    /// CHECK: Pool asset vault (input for the sell)
    #[account(mut)]
    pub input_vault: UncheckedAccount<'info>,

    /// CHECK: Pool USDC vault (output for the sell)
    #[account(mut)]
    pub output_vault: UncheckedAccount<'info>,

    /// CHECK: Token program for input token
    pub input_token_program: UncheckedAccount<'info>,

    /// CHECK: Token program for output token
    pub output_token_program: UncheckedAccount<'info>,

    /// CHECK: Input mint (asset being sold)
    pub input_mint: UncheckedAccount<'info>,

    /// CHECK: Output mint (USDC)
    pub output_mint: UncheckedAccount<'info>,

    /// CHECK: Observation state account
    #[account(mut)]
    pub observation_state: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

    /// CHECK: The pinned executable SPL Memo program is invoked below.
    #[account(address = MEMO_V2_PROGRAM_ID, executable)]
    pub memo_program: UncheckedAccount<'info>,
}

pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, SwapAndCollectLeg<'info>>,
    amount_in_asset: u64,
    min_usdc_out: u64,
    memo: String,
) -> Result<()> {
    let global = &ctx.accounts.global_config;
    let basket = &ctx.accounts.basket_config;

    // The sold mint must be one of the basket legs.
    let sold_mint = ctx.accounts.user_src_ata.mint;
    let is_valid_mint = basket
        .items
        .iter()
        .take(basket.leg_count as usize)
        .any(|item| item.mint == sold_mint);
    require!(is_valid_mint, KairosError::InvalidUserAta);
    require_keys_eq!(ctx.accounts.input_mint.key(), sold_mint, KairosError::InvalidUserAta);
    require_keys_eq!(ctx.accounts.output_mint.key(), global.usdc_mint, KairosError::UsdcMintMismatch);
    require!(ctx.accounts.user_src_ata.amount >= amount_in_asset, KairosError::InvalidUserAta);

    // Snapshot USDC balance, then CPI swap asset → USDC.
    ctx.accounts.user_usdc_ata.reload()?;
    let usdc_before = ctx.accounts.user_usdc_ata.amount;

    let mut data = Vec::with_capacity(24);
    data.extend_from_slice(&SWAP_BASE_INPUT_DISCRIMINATOR);
    data.extend_from_slice(&amount_in_asset.to_le_bytes());
    data.extend_from_slice(&min_usdc_out.to_le_bytes());

    let accounts = vec![
        AccountMeta::new_readonly(ctx.accounts.user.key(), true),
        AccountMeta::new_readonly(ctx.accounts.authority.key(), false),
        AccountMeta::new_readonly(ctx.accounts.amm_config.key(), false),
        AccountMeta::new(ctx.accounts.pool_state.key(), false),
        AccountMeta::new(ctx.accounts.user_src_ata.key(), false),
        AccountMeta::new(ctx.accounts.user_usdc_ata.key(), false),
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
        ctx.accounts.cpmm_program.to_account_info(),
        ctx.accounts.user.to_account_info(),
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.amm_config.to_account_info(),
        ctx.accounts.pool_state.to_account_info(),
        ctx.accounts.user_src_ata.to_account_info(),
        ctx.accounts.user_usdc_ata.to_account_info(),
        ctx.accounts.input_vault.to_account_info(),
        ctx.accounts.output_vault.to_account_info(),
        ctx.accounts.input_token_program.to_account_info(),
        ctx.accounts.output_token_program.to_account_info(),
        ctx.accounts.input_mint.to_account_info(),
        ctx.accounts.output_mint.to_account_info(),
        ctx.accounts.observation_state.to_account_info(),
    ];

    invoke(&ix, &account_infos)?;

    // Slippage guard on gross USDC out, then fee taken from proceeds.
    ctx.accounts.user_usdc_ata.reload()?;
    let usdc_after = ctx.accounts.user_usdc_ata.amount;
    let usdc_out = usdc_after
        .checked_sub(usdc_before)
        .ok_or(KairosError::MathOverflow)?;
    require!(usdc_out >= min_usdc_out, KairosError::SlippageExceeded);

    let fee_usdc = u128::from(usdc_out)
        .checked_mul(u128::from(global.fee_bps))
        .and_then(|v| v.checked_div(10_000))
        .and_then(|v| u64::try_from(v).ok())
        .ok_or(KairosError::MathOverflow)?;
    if fee_usdc > 0 {
        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.user_usdc_ata.to_account_info(),
                    to: ctx.accounts.treasury_usdc_ata.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            fee_usdc,
        )?;
    }

    if !memo.is_empty() {
        let memo_ix = Instruction {
            program_id: MEMO_V2_PROGRAM_ID,
            accounts: vec![],
            data: memo.as_bytes().to_vec(),
        };
        invoke(&memo_ix, &[ctx.accounts.memo_program.to_account_info()])?;
    }

    emit!(SellLegExecuted {
        user: ctx.accounts.user.key(),
        basket_id: basket.basket_id.clone(),
        sold_mint,
        amount_in: amount_in_asset,
        usdc_out,
        fee_usdc,
    });

    msg!(
        "Kairos sell leg: {} of {} → {} USDC (fee {})",
        amount_in_asset,
        sold_mint,
        usdc_out,
        fee_usdc
    );

    Ok(())
}
