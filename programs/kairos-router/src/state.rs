use anchor_lang::prelude::*;

pub const MAX_LEGS: usize = 10;
pub const MAX_BASKET_LEGS: usize = 12;
pub const MAX_EXTRA_LEGS: usize = MAX_BASKET_LEGS - MAX_LEGS;

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
/// BasketVersion entries keep their original ten-item inline layout. Up to two
/// additional legs live in BasketVersionExtension to preserve existing PDAs.
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

/// Overflow legs for versions above the original ten-leg inline capacity.
/// Stored separately so existing BasketConfig and BasketVersion accounts keep
/// their original serialized layouts and remain readable after the upgrade.
#[account]
pub struct BasketVersionExtension {
    pub version: Pubkey,
    pub extra_count: u8,
    pub items: [BasketItem; MAX_EXTRA_LEGS],
    pub bump: u8,
}

impl BasketVersionExtension {
    pub const LEN: usize = 8 + 32 + 1 + (34 * MAX_EXTRA_LEGS) + 1;
}

pub fn version_contains_mint(
    version_key: Pubkey,
    version: &BasketVersion,
    extension: Option<&BasketVersionExtension>,
    mint: Pubkey,
) -> Result<bool> {
    let count = version.leg_count as usize;
    require!(count <= MAX_BASKET_LEGS, crate::errors::KairosError::InvalidBasketVersion);
    let inline_count = count.min(MAX_LEGS);
    if version.items[..inline_count].iter().any(|item| item.mint == mint) {
        return Ok(true);
    }
    let extra_count = count.saturating_sub(MAX_LEGS);
    if extra_count == 0 {
        return Ok(false);
    }
    let extension = extension.ok_or(error!(crate::errors::KairosError::InvalidBasketVersion))?;
    require_keys_eq!(extension.version, version_key, crate::errors::KairosError::InvalidBasketVersion);
    require!(extension.extra_count as usize == extra_count, crate::errors::KairosError::InvalidBasketVersion);
    Ok(extension.items[..extra_count].iter().any(|item| item.mint == mint))
}
