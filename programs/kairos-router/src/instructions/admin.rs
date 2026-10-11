use anchor_lang::prelude::*;
use crate::errors::KairosError;
use crate::state::{BasketConfig, GlobalConfig};

/// Per-basket kill switch (was `toggle_basket_status`, explicit flag form).
#[derive(Accounts)]
pub struct SetActive<'info> {
    #[account(
        mut,
        constraint = admin.key() == global_config.admin @ KairosError::UnauthorizedAdmin,
        constraint = admin.key() == basket_config.admin @ KairosError::UnauthorizedAdmin
    )]
    pub admin: Signer<'info>,

    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [b"basket", basket_config.basket_id.as_bytes()],
        bump = basket_config.bump
    )]
    pub basket_config: Account<'info, BasketConfig>,
}

pub fn set_active_handler(ctx: Context<SetActive>, is_active: bool) -> Result<()> {
    let basket = &mut ctx.accounts.basket_config;
    basket.is_active = is_active;
    msg!("Kairos basket {} active={}", basket.basket_id, is_active);
    Ok(())
}

/// GLOBAL kill switch — halts every swap instruction in one transaction
/// (the backend kill switch and this are checked together; either halts).
#[derive(Accounts)]
pub struct SetGlobalPause<'info> {
    #[account(
        mut,
        constraint = admin.key() == global_config.admin @ KairosError::UnauthorizedAdmin
    )]
    pub admin: Signer<'info>,

    #[account(mut, seeds = [b"global"], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn set_global_pause_handler(ctx: Context<SetGlobalPause>, paused: bool) -> Result<()> {
    let cfg = &mut ctx.accounts.global_config;
    cfg.paused = paused;
    emit!(GlobalPauseChanged { paused });
    msg!("Kairos global paused={}", paused);
    Ok(())
}

#[event]
pub struct GlobalPauseChanged {
    pub paused: bool,
}
