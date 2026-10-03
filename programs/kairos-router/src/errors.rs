use anchor_lang::prelude::*;

#[error_code]
pub enum KairosError {
    #[msg("Basket constituent weights must sum to exactly 10,000 basis points (100%).")]
    InvalidBasketWeights,

    #[msg("Phase 1 supports exactly 2 constituent tokens.")]
    InvalidTokenCount,

    #[msg("Basket is currently paused or inactive.")]
    BasketNotActive,

    #[msg("Output tokens received is less than min_amount_out.")]
    SlippageExceeded,

    #[msg("Invalid Raydium CPMM program passed.")]
    InvalidCpmmProgram,

    #[msg("Invalid user associated token account.")]
    InvalidUserAta,

    #[msg("Arithmetic overflow during calculation.")]
    MathOverflow,
}
