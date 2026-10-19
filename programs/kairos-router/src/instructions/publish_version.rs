use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use crate::errors::KairosError;
use crate::state::{BasketConfig, BasketItem, BasketVersion, GlobalConfig, PublishAuthorities, MAX_LEGS};

/// Two-authority version publication stores the composition and its canonical
/// SHA-256 hash. Publishing never moves user funds.
#[derive(Accounts)]
#[instruction(basket_id: String, version: u32)]
pub struct PublishVersion<'info> {
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
    let mut seen = [Pubkey::default(); MAX_LEGS];
    let mut canonical_legs = [0u8; MAX_LEGS * 34];
    let mut order = [0usize; MAX_LEGS];
    for i in 0..leg_count as usize {
        let item = items[i];
        require!(item.weight_bps > 0 && item.mint != Pubkey::default(), KairosError::InvalidBasketWeights);
        total = total
            .checked_add(item.weight_bps as u32)
            .ok_or(KairosError::MathOverflow)?;
        require!(!seen[..i].contains(&item.mint), KairosError::DuplicateMint);
        seen[i] = item.mint;
        order[i] = i;
    }
    require!(total == 10_000, KairosError::InvalidBasketWeights);
    order[..leg_count as usize].sort_by_key(|index| items[*index].mint.to_bytes());
    for (position, index) in order[..leg_count as usize].iter().enumerate() {
        let item = items[*index];
        let offset = position * 34;
        canonical_legs[offset..offset + 32].copy_from_slice(item.mint.as_ref());
        canonical_legs[offset + 32..offset + 34].copy_from_slice(&item.weight_bps.to_le_bytes());
    }
    require!(
        hash(&canonical_legs[..leg_count as usize * 34]).to_bytes() == legs_hash,
        KairosError::LegsHashMismatch
    );

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
