use anchor_lang::prelude::*;
use crate::errors::KairosError;
use crate::state::GlobalConfig;

/// One-time setup of program-wide config. The payer becomes the admin.
#[derive(Accounts)]
pub struct InitializeGlobal<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = GlobalConfig::LEN,
        seeds = [b"global"],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeGlobal>,
    usdc_mint: Pubkey,
    treasury: Pubkey,
    fee_bps: u16,
) -> Result<()> {
    require!(fee_bps <= GlobalConfig::MAX_FEE_BPS, KairosError::InvalidFeeBps);

    let cfg = &mut ctx.accounts.global_config;
    cfg.admin = ctx.accounts.payer.key();
    cfg.usdc_mint = usdc_mint;
    cfg.treasury = treasury;
    cfg.fee_bps = fee_bps;
    cfg.paused = false;
    cfg.bump = ctx.bumps.global_config;

    msg!("Kairos global config initialized: fee {} bps", cfg.fee_bps);
    Ok(())
}
