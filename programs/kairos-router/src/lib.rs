use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::*;

declare_id!("ELfFskTFe9keckQ7yN3hgZ2csq7hUHAR7QuPNoErQqPw");

#[program]
pub mod kairos_router {
    use super::*;

    pub fn initialize_basket(
        ctx: Context<InitializeBasket>,
        basket_id: String,
        name: String,
        items: [BasketItem; 2],
    ) -> Result<()> {
        instructions::initialize_basket::handler(ctx, basket_id, name, items)
    }

    pub fn swap_and_distribute_leg<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, SwapAndDistributeLeg<'info>>,
        amount_in_usdc: u64,
        min_amount_out: u64,
    ) -> Result<()> {
        instructions::swap_leg::handler(ctx, amount_in_usdc, min_amount_out)
    }
}
