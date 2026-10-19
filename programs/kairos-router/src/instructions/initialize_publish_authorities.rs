use anchor_lang::prelude::*;
use crate::errors::KairosError;
use crate::state::{GlobalConfig, PublishAuthorities};

#[derive(Accounts)]
pub struct InitializePublishAuthorities<'info> {
    #[account(mut, address = global_config.admin @ KairosError::UnauthorizedAdmin)]
    pub admin: Signer<'info>,

    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        init,
        payer = admin,
        space = PublishAuthorities::LEN,
        seeds = [b"publish_authorities"],
        bump
    )]
    pub publish_authorities: Account<'info, PublishAuthorities>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializePublishAuthorities>,
    additional_approvers: [Pubkey; 2],
) -> Result<()> {
    let admin = ctx.accounts.admin.key();
    require!(
        additional_approvers[0] != admin
            && additional_approvers[1] != admin
            && additional_approvers[0] != additional_approvers[1],
        KairosError::UnauthorizedAdmin
    );

    let authorities = &mut ctx.accounts.publish_authorities;
    authorities.approvers = [admin, additional_approvers[0], additional_approvers[1]];
    authorities.bump = ctx.bumps.publish_authorities;
    Ok(())
}
