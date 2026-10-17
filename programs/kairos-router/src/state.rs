use anchor_lang::prelude::*;

pub const MAX_LEGS: usize = 10;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct BasketItem {
    pub mint: Pubkey,
    pub weight_bps: u16,
}

/// Program-wide config (PDA "global"): admin authority, pinned USDC mint,
/// treasury ATA owner, platform fee, and the global kill switch.
#[account]
pub struct GlobalConfig {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub paused: bool,
    pub bump: u8,
}

impl GlobalConfig {
    pub const MAX_FEE_BPS: u16 = 75; // PRD cap across platform execution fees

    pub fn fee_bps_is_valid(fee_bps: u16) -> bool {
        fee_bps <= Self::MAX_FEE_BPS
    }

    pub const LEN: usize =
        8 +  // discriminator
        32 + // admin
        32 + // usdc_mint
        32 + // treasury
        2 +  // fee_bps
        1 +  // paused
        1 +  // bump
        16; // buffer
}

#[cfg(test)]
mod tests {
    use super::GlobalConfig;

    #[test]
    fn fee_cap_matches_prd_boundary() {
        assert!(GlobalConfig::fee_bps_is_valid(75));
        assert!(!GlobalConfig::fee_bps_is_valid(76));
    }
}

/// Three distinct keys authorized to publish versions (admin + two approvers).
#[account]
pub struct PublishAuthorities {
    pub approvers: [Pubkey; 3],
    pub bump: u8,
}

impl PublishAuthorities {
    pub const LEN: usize = 8 + (32 * 3) + 1;
}

/// A curated basket. Immutable composition; new compositions are published as
/// BasketVersion entries. Up to 10 legs; the weights of the first `leg_count`
/// legs must sum to exactly 10,000 bps.
#[account]
pub struct BasketConfig {
    pub admin: Pubkey,
    pub basket_id: String,
    pub name: String,
    pub is_active: bool,
    pub leg_count: u8,
    pub items: [BasketItem; MAX_LEGS],
    pub bump: u8,
}

impl BasketConfig {
    pub const MAX_BASKET_ID_LEN: usize = 32;
    pub const MAX_NAME_LEN: usize = 32;

    pub const LEN: usize =
        8 +  // discriminator
        32 + // admin
        (4 + Self::MAX_BASKET_ID_LEN) + // basket_id
        (4 + Self::MAX_NAME_LEN) + // name
        1 +  // is_active
        1 +  // leg_count
        (34 * MAX_LEGS) + // items [BasketItem; 10] = (32 + 2) * 10
        1; // bump
}

/// Published version registry entry (PDA ["version", basket_id, version_le]).
/// `legs_hash` is the SHA-256 of active mint/weight pairs sorted by mint bytes. The
/// program recomputes it before storing the append-only version entry.
#[account]
pub struct BasketVersion {
    pub admin: Pubkey,
    pub basket_id: String,
    pub version: u32,
    pub leg_count: u8,
    pub items: [BasketItem; MAX_LEGS],
    pub legs_hash: [u8; 32],
    pub published_at: i64,
    pub bump: u8,
}

impl BasketVersion {
    pub const MAX_BASKET_ID_LEN: usize = 32;

    pub const LEN: usize =
        8 +  // discriminator
        32 + // admin
        (4 + Self::MAX_BASKET_ID_LEN) + // basket_id
        4 +  // version
        1 +  // leg_count
        (34 * MAX_LEGS) + // items
        32 + // legs_hash
        8 +  // published_at
        1; // bump
}
