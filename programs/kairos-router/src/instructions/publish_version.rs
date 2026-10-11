use anchor_lang::prelude::*;
use crate::errors::KairosError;
use crate::state::{BasketConfig, BasketItem, BasketVersion, GlobalConfig, MAX_LEGS};

/// Admin-only version publication (PRD §4.2/§4.6): stores the composition and
/// an admin-computed SHA-256 `legs_hash`. Publishing NEVER moves user funds —
/// positions move only when each user rebalances.
#[derive(Accounts)]
#[instruction(basket_id: String, version: u32)]
pub struct PublishVersion<'info> {
    #[account(
        mut,
        constraint = admin.key() == global_config.admin @ KairosError::UnauthorizedAdmin,
        constraint = admin.key() == basket_config.admin @ KairosError::UnauthorizedAdmin
    )]
    pub admin: Signer<'info>,

    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        seeds = [b"basket", basket_config.basket_id.as_bytes()],
        bump = basket_config.bump,
        constraint = basket_config.basket_id == basket_id @ KairosError::InvalidUserAta
    )]
    pub basket_config: Account<'info, BasketConfig>,

    #[account(
        init,
        payer = admin,
        space = BasketVersion::LEN,
        seeds = [
            b"version",
            basket_config.basket_id.as_bytes(),
            &version.to_le_bytes()
        ],
        bump
    )]
    pub basket_version: Account<'info, BasketVersion>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<PublishVersion>,
    basket_id: String,
    version: u32,
    items: [BasketItem; MAX_LEGS],
    leg_count: u8,
    legs_hash: [u8; 32],
) -> Result<()> {
    require!(
        (leg_count as usize) >= 1 && (leg_count as usize) <= MAX_LEGS,
        KairosError::InvalidLegCount
    );

    let mut total: u32 = 0;
    let mut seen: Vec<Pubkey> = Vec::with_capacity(leg_count as usize);
    for i in 0..leg_count as usize {
        let item = items[i];
        total = total
            .checked_add(item.weight_bps as u32)
            .ok_or(KairosError::MathOverflow)?;
        require!(!seen.contains(&item.mint), KairosError::DuplicateMint);
        seen.push(item.mint);
    }
    require!(total == 10_000, KairosError::InvalidBasketWeights);

    let entry = &mut ctx.accounts.basket_version;
    entry.admin = ctx.accounts.admin.key();
    entry.basket_id = basket_id;
    entry.version = version;
    entry.leg_count = leg_count;
    entry.items = items;
    entry.legs_hash = legs_hash;
    entry.published_at = Clock::get()?.unix_timestamp;
    entry.bump = ctx.bumps.basket_version;

    emit!(VersionPublished {
        basket_id: entry.basket_id.clone(),
        version,
        leg_count,
        legs_hash,
    });
    Ok(())
}

#[event]
pub struct VersionPublished {
    pub basket_id: String,
    pub version: u32,
    pub leg_count: u8,
    pub legs_hash: [u8; 32],
}
