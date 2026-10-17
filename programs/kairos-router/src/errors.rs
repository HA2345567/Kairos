use anchor_lang::prelude::*;

#[error_code]
pub enum KairosError {
    #[msg("Basket constituent weights must sum to exactly 10,000 basis points (100%).")]
    InvalidBasketWeights,

    #[msg("leg_count must be between 1 and 10.")]
    InvalidLegCount,

    #[msg("Basket contains duplicate mints.")]
    DuplicateMint,

    #[msg("The global kill switch is engaged.")]
    ProgramPaused,

    #[msg("Basket is currently paused or inactive.")]
    BasketNotActive,

    #[msg("fee_bps exceeds the maximum allowed.")]
    InvalidFeeBps,

    #[msg("Input USDC ATA does not match the pinned USDC mint.")]
    UsdcMintMismatch,

    #[msg("Treasury ATA is not owned by the configured treasury or is not USDC.")]
    InvalidTreasuryAta,

    #[msg("Output tokens received is less than min_amount_out.")]
    SlippageExceeded,

    #[msg("Invalid Raydium CPMM program passed.")]
    InvalidCpmmProgram,

    #[msg("Invalid user associated token account.")]
    InvalidUserAta,

    #[msg("Arithmetic overflow during calculation.")]
    MathOverflow,

    #[msg("Signer is not authorized to manage baskets.")]
    UnauthorizedAdmin,

    #[msg("The legs_hash does not match the canonical mint and weight encoding.")]
    LegsHashMismatch,

    #[msg("The supplied basket version is invalid or does not match this basket.")]
    InvalidBasketVersion,
}
