use anchor_lang::prelude::*;
use crate::errors::KairosError;
use crate::state::{BasketConfig, BasketItem, GlobalConfig, MAX_LEGS};

/// Admin-only basket creation. Up to 10 legs; the weights of the first
/// `leg_count` legs must sum to exactly 10,000 bps and mints must be unique.
#[derive(Accounts)]
#[instruction(basket_id: String, name: String)]
pub struct InitializeBasket<'info> {
    #[account(
        mut,
        constraint = admin.key() == global_config.admin @ KairosError::UnauthorizedAdmin
    )]
    pub admin: Signer<'info>,

    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        init,
        payer = admin,
        space = BasketConfig::LEN,
        seeds = [b"basket", basket_id.as_bytes()],
        bump
    )]
    pub basket_config: Account<'info, BasketConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeBasket>,
    basket_id: String,
    name: String,
    items: [BasketItem; MAX_LEGS],
    leg_count: u8,
) -> Result<()> {
    require!(
        (basket_id.len() as usize) <= BasketConfig::MAX_BASKET_ID_LEN
            && (name.len() as usize) <= BasketConfig::MAX_NAME_LEN,
        KairosError::InvalidLegCount
    );
    require!(
        (leg_count as usize) >= 1 && (leg_count as usize) <= MAX_LEGS,
        KairosError::InvalidLegCount
    );

    // Weights of the active legs must sum to exactly 10,000 bps.
    let mut total: u32 = 0;
    let mut seen: Vec<Pubkey> = Vec::with_capacity(leg_count as usize);
    for i in 0..leg_count as usize {
        let item = items[i];
        require!(item.weight_bps > 0 && item.mint != Pubkey::default(), KairosError::InvalidBasketWeights);
        total = total
            .checked_add(item.weight_bps as u32)
            .ok_or(KairosError::MathOverflow)?;
        require!(!seen.contains(&item.mint), KairosError::DuplicateMint);
        seen.push(item.mint);
    }
    require!(total == 10_000, KairosError::InvalidBasketWeights);

    let basket = &mut ctx.accounts.basket_config;
    basket.admin = ctx.accounts.admin.key();
    basket.basket_id = basket_id.clone();
    basket.name = name;
    basket.is_active = true;
    basket.leg_count = leg_count;
    basket.items = items;
    basket.bump = ctx.bumps.basket_config;

    emit!(BasketInitialized {
        basket_id,
        leg_count,
    });
    Ok(())
}

#[event]
pub struct BasketInitialized {
    pub basket_id: String,
    pub leg_count: u8,
}
