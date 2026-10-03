# Data Model & Contracts: Kairos Platform

## 1. On-chain Accounts (Anchor)

### Basket Registry PDA
```rust
#[account]
pub struct Basket {
    pub admin: Pubkey,          // 32 bytes
    pub basket_id: [u8; 32],    // 32 bytes
    pub name: String,           // 4 + len bytes
    pub points_multiplier: u8,  // 1 byte (e.g. 3 for 3x)
    pub token_count: u8,        // 1 byte (e.g. 4)
    pub tokens: Vec<BasketToken>, // Constituent tokens & weights
    pub bump: u8,               // 1 byte
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct BasketToken {
    pub mint: Pubkey,           // 32 bytes
    pub weight_bps: u16,        // 2 bytes (basis points, 10000 = 100%)
}
```

## 2. Off-chain Database Schema (Prisma)

```prisma
model Basket {
  id               String       @id @default(uuid())
  slug             String       @unique
  name             String
  description      String
  category         String
  pointsMultiplier String       @default("3x Pts")
  imageUrl         String
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  tokens           Token[]
  navHistory       NavHistory[]
}

model Token {
  id        String   @id @default(uuid())
  basketId  String
  symbol    String
  name      String
  mint      String
  icon      String
  weightBps Int      // e.g. 4000 = 40%
  basket    Basket   @relation(fields: [basketId], references: [id])
}

model NavHistory {
  id        String   @id @default(uuid())
  basketId  String
  nav       Float
  timestamp DateTime @default(now())
  basket    Basket   @relation(fields: [basketId], references: [id])
}
```

## 3. Frontend Core Interfaces

```typescript
export interface BasketTokenConfig {
  symbol: string;
  name: string;
  mint: string;
  icon: string;
  weightPct: number; // e.g. 40 for 40%
  priceUsd?: number;
}

export interface Basket {
  id: string;
  slug: string;
  name: string;
  category: "Tech & AI" | "DeFi" | "Political Alpha" | "Memes" | "Culture";
  pointsMultiplier: string;
  description: string;
  imageUrl: string;
  tokens: BasketTokenConfig[];
  allTimeReturnPct?: number;
}
```
