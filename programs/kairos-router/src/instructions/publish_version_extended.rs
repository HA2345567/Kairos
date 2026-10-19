use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

use crate::errors::KairosError;
use crate::state::{
    BasketConfig, BasketItem, BasketVersion, BasketVersionExtension, GlobalConfig,
    PublishAuthorities, MAX_BASKET_LEGS, MAX_EXTRA_LEGS, MAX_LEGS,
};

/// Publishes 11–12-leg versions while leaving the original account layouts intact.
#[derive(Accounts)]
#[instruction(basket_id: String, version: u32, items: Vec<BasketItem>)]
pub struct PublishVersionExtended<'info> {
    #[account(
        mut,
        constraint = admin.key() == basket_config.admin @ KairosError::UnauthorizedAdmin,
        constraint = publish_authorities.approvers.contains(&admin.key()) @ KairosError::UnauthorizedAdmin
    )]
    pub admin: Signer<'info>,
    #[account(
        constraint = approval.key() != admin.key() @ KairosError::UnauthorizedAdmin,
        constraint = publish_authorities.approvers.contains(&approval.key()) @ KairosError::UnauthorizedAdmin
    )]
    pub approval: Signer<'info>,
    pub global_config: Account<'info, GlobalConfig>,
    #[account(seeds = [b"publish_authorities"], bump = publish_authorities.bump)]
    pub publish_authorities: Account<'info, PublishAuthorities>,
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
        seeds = [b"version", basket_config.basket_id.as_bytes(), &version.to_le_bytes()],
        bump
    )]
    pub basket_version: Account<'info, BasketVersion>,
    #[account(
        init,
        payer = admin,
        space = BasketVersionExtension::LEN,
        seeds = [b"version_extra", basket_config.basket_id.as_bytes(), &version.to_le_bytes()],
        bump
    )]
    pub basket_version_extension: Account<'info, BasketVersionExtension>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<PublishVersionExtended>,
    basket_id: String,
    version: u32,
    items: Vec<BasketItem>,
    legs_hash: [u8; 32],
) -> Result<()> {
    require!(
        items.len() > MAX_LEGS && items.len() <= MAX_BASKET_LEGS,
        KairosError::InvalidLegCount
    );

    let mut total = 0u32;
    let mut seen = Vec::with_capacity(items.len());
    for item in &items {
        require!(item.weight_bps > 0 && item.mint != Pubkey::default(), KairosError::InvalidBasketWeights);
        total = total.checked_add(item.weight_bps as u32).ok_or(KairosError::MathOverflow)?;
        require!(!seen.contains(&item.mint), KairosError::DuplicateMint);
        seen.push(item.mint);
    }
    require!(total == 10_000, KairosError::InvalidBasketWeights);

    let mut order: Vec<usize> = (0..items.len()).collect();
    order.sort_by_key(|index| items[*index].mint.to_bytes());
    let mut canonical_legs = Vec::with_capacity(items.len() * 34);
    for index in order {
        canonical_legs.extend_from_slice(items[index].mint.as_ref());
        canonical_legs.extend_from_slice(&items[index].weight_bps.to_le_bytes());
    }
    require!(hash(&canonical_legs).to_bytes() == legs_hash, KairosError::LegsHashMismatch);

    let mut inline = [BasketItem { mint: Pubkey::default(), weight_bps: 0 }; MAX_LEGS];
    inline.copy_from_slice(&items[..MAX_LEGS]);
    let extra_count = items.len() - MAX_LEGS;
    let mut extra = [BasketItem { mint: Pubkey::default(), weight_bps: 0 }; MAX_EXTRA_LEGS];
    extra[..extra_count].copy_from_slice(&items[MAX_LEGS..]);

    let entry = &mut ctx.accounts.basket_version;
    entry.admin = ctx.accounts.admin.key();
    entry.basket_id = basket_id.clone();
    entry.version = version;
    entry.leg_count = items.len() as u8;
    entry.items = inline;
    entry.legs_hash = legs_hash;
    entry.published_at = Clock::get()?.unix_timestamp;
    entry.bump = ctx.bumps.basket_version;

    let extension = &mut ctx.accounts.basket_version_extension;
    extension.version = entry.key();
    extension.extra_count = extra_count as u8;
    extension.items = extra;
    extension.bump = ctx.bumps.basket_version_extension;

    emit!(VersionPublishedExtended { basket_id, version, leg_count: items.len() as u8, legs_hash });
    Ok(())
}

#[event]
pub struct VersionPublishedExtended {
    pub basket_id: String,
    pub version: u32,
    pub leg_count: u8,
    pub legs_hash: [u8; 32],
}
