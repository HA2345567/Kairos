use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct BasketItem {
    pub mint: Pubkey,
    pub weight_bps: u16,
}

#[account]
pub struct BasketConfig {
    pub admin: Pubkey,
    pub basket_id: String,
    pub name: String,
    pub is_active: bool,
    pub token_count: u8,
    pub items: [BasketItem; 2],
    pub bump: u8,
}

impl BasketConfig {
    pub const MAX_BASKET_ID_LEN: usize = 32;
    pub const MAX_NAME_LEN: usize = 32;

    pub const LEN: usize = 8 + // discriminator
        32 + // admin
        (4 + Self::MAX_BASKET_ID_LEN) + // basket_id
        (4 + Self::MAX_NAME_LEN) + // name
        1 + // is_active
        1 + // token_count
        ((32 + 2) * 2) + // items [BasketItem; 2]
        1 + // bump
        32; // buffer padding for forward compatibility
}
