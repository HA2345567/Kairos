use anchor_lang::prelude::*;
use crate::state::{BasketConfig, BasketItem};
use crate::errors::KairosError;

#[derive(Accounts)]
#[instruction(basket_id: String)]
pub struct InitializeBasket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

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
    items: [BasketItem; 2],
) -> Result<()> {
    require!(
        basket_id.len() <= BasketConfig::MAX_BASKET_ID_LEN,
        KairosError::InvalidBasketWeights
    );
    require!(
        name.len() <= BasketConfig::MAX_NAME_LEN,
        KairosError::InvalidBasketWeights
    );

    // Validate weights sum to exactly 10,000 basis points (100%)
    let total_weight: u16 = items[0]
        .weight_bps
        .checked_add(items[1].weight_bps)
        .ok_or(KairosError::MathOverflow)?;

    require!(total_weight == 10000, KairosError::InvalidBasketWeights);

    let basket = &mut ctx.accounts.basket_config;
    basket.admin = ctx.accounts.admin.key();
    basket.basket_id = basket_id;
    basket.name = name;
    basket.is_active = true;
    basket.token_count = 2;
    basket.items = items;
    basket.bump = ctx.bumps.basket_config;

    msg!("Initialized basket: {} with 2 constituent tokens", basket.name);
    Ok(())
}
