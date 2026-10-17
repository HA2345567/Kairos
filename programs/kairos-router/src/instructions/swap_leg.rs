use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
};
use anchor_spl::token::{Token, TokenAccount};
use crate::errors::KairosError;
use crate::state::{BasketConfig, GlobalConfig};

pub const RAYDIUM_CPMM_PROGRAM_ID: Pubkey = pubkey!("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb");
pub const MEMO_V2_PROGRAM_ID: Pubkey = pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// Discriminator for Raydium CPMM `swap_base_input`
// SHA256("global:swap_base_input")[..8]
pub const SWAP_BASE_INPUT_DISCRIMINATOR: [u8; 8] = [0x8f, 0xbe, 0x5a, 0xda, 0xc4, 0x1e, 0x33, 0xde];

#[event]
pub struct InvestLegExecuted {
    pub user: Pubkey,
    pub basket_id: String,
    pub target_mint: Pubkey,
    pub amount_in_usdc: u64,
    pub fee_usdc: u64,
    pub amount_out: u64,
}

/// BUY leg: USDC → one basket asset, executed as a Raydium CPMM CPI.
/// Order inside this single atomic instruction:
///   1. pause checks (global + basket) — a paused program never moves funds,
///   2. USDC-mint pinning + pool program check,
///   3. platform fee transfer (input-side) to the treasury,
///   4. CPI swap of the NET amount with slippage guard,
///   5. memo, then event.
/// Any failure reverts the whole instruction, so a failed leg charges no fee.
#[derive(Accounts)]
pub struct SwapAndDistributeLeg<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(seeds = [b"global"], bump = global_config.bump,
        constraint = !global_config.paused @ KairosError::ProgramPaused)]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    #[account(
        mut,
        constraint = user_usdc_ata.owner == user.key() @ KairosError::InvalidUserAta,
        constraint = user_usdc_ata.mint == global_config.usdc_mint @ KairosError::UsdcMintMismatch
    )]
    pub user_usdc_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_dest_ata.owner == user.key() @ KairosError::InvalidUserAta
    )]
    pub user_dest_ata: Account<'info, TokenAccount>,

    /// Treasury USDC ATA: must be owned by the configured treasury and hold
    /// the pinned USDC — fee transfers fail loudly otherwise.
    #[account(
        mut,
        constraint = treasury_usdc_ata.owner == global_config.treasury @ KairosError::InvalidTreasuryAta,
        constraint = treasury_usdc_ata.mint == global_config.usdc_mint @ KairosError::InvalidTreasuryAta
    )]
    pub treasury_usdc_ata: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"basket", basket_config.basket_id.as_bytes()],
        bump = basket_config.bump,
        constraint = basket_config.is_active @ KairosError::BasketNotActive
    )]
    pub basket_config: Box<Account<'info, BasketConfig>>,

    /// CHECK: Validated against Raydium CPMM devnet/mainnet program ID
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

    /// CHECK: The pinned executable SPL Memo program is invoked below.
    #[account(address = MEMO_V2_PROGRAM_ID, executable)]
    pub memo_program: UncheckedAccount<'info>,
}

pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, SwapAndDistributeLeg<'info>>,
    amount_in_usdc: u64,
    min_amount_out: u64,
    memo: String,
) -> Result<()> {
    // 1. Global kill switch (constraint above) + basket active (constraint).
    let global = &ctx.accounts.global_config;
    let basket = &ctx.accounts.basket_config;

    // 2. Pool account sanity: the CPI input mint must be the pinned USDC and
    //    the output mint must match the destination ATA.
    let target_mint = ctx.accounts.user_dest_ata.mint;
    let is_valid_mint = basket
        .items
        .iter()
        .take(basket.leg_count as usize)
        .any(|item| item.mint == target_mint);
    require!(is_valid_mint, KairosError::InvalidUserAta);
    require_keys_eq!(ctx.accounts.output_mint.key(), target_mint, KairosError::InvalidUserAta);
    require_keys_eq!(ctx.accounts.input_mint.key(), global.usdc_mint, KairosError::UsdcMintMismatch);

    // 3. Fee (input-side) + swap the net amount.
    let fee_usdc = u128::from(amount_in_usdc)
        .checked_mul(u128::from(global.fee_bps))
        .and_then(|v| v.checked_div(10_000))
        .and_then(|v| u64::try_from(v).ok())
        .ok_or(KairosError::MathOverflow)?;
    let net_in = amount_in_usdc
        .checked_sub(fee_usdc)
        .ok_or(KairosError::MathOverflow)?;
    require!(net_in > 0, KairosError::MathOverflow);
    require!(
        ctx.accounts.user_usdc_ata.amount >= amount_in_usdc,
        KairosError::InvalidUserAta
    );

    // Fee transfer first (input-side). If the swap below fails, this whole
    // instruction reverts — the user is never charged for a failed leg.
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

    // 4. CPI swap of the NET amount.
    ctx.accounts.user_dest_ata.reload()?;
    let start_balance = ctx.accounts.user_dest_ata.amount;

    let mut data = Vec::with_capacity(24);
    data.extend_from_slice(&SWAP_BASE_INPUT_DISCRIMINATOR);
    data.extend_from_slice(&net_in.to_le_bytes());
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
        ctx.accounts.cpmm_program.to_account_info(),
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

    // 5. Slippage guard on the actual received amount.
    ctx.accounts.user_dest_ata.reload()?;
    let end_balance = ctx.accounts.user_dest_ata.amount;
    let amount_out = end_balance
        .checked_sub(start_balance)
        .ok_or(KairosError::MathOverflow)?;
    require!(amount_out >= min_amount_out, KairosError::SlippageExceeded);

    // 6. Memo (audit trail: basket:version:leg intent).
    if !memo.is_empty() {
        let memo_ix = Instruction {
            program_id: MEMO_V2_PROGRAM_ID,
            accounts: vec![],
            data: memo.as_bytes().to_vec(),
        };
        invoke(&memo_ix, &[ctx.accounts.memo_program.to_account_info()])?;
    }

    emit!(InvestLegExecuted {
        user: ctx.accounts.user.key(),
        basket_id: basket.basket_id.clone(),
        target_mint,
        amount_in_usdc,
        fee_usdc,
        amount_out,
    });

    msg!(
        "Kairos buy leg: {} USDC (fee {}) → {} of {}",
        amount_in_usdc,
        fee_usdc,
        amount_out,
        target_mint
    );

    Ok(())
}
