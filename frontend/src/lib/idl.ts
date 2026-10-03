export const IDL = {
  version: "0.7.0",
  name: "kairos_router",
  address: "By5KbxUEFGs7NrQYLXcjmptft6yX2saVWvoA8sx7HzqT",
  instructions: [
    {
      name: "initializeGlobalConfig",
      accounts: [
        { name: "config", isMut: true, isSigner: false },
        { name: "authority", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "initializeMarket",
      accounts: [
        { name: "market", isMut: true, isSigner: false },
        { name: "authority", isMut: true, isSigner: true },
        { name: "collateralMint", isMut: false, isSigner: false },
        { name: "collateralVault", isMut: true, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
        { name: "rent", isMut: false, isSigner: false },
      ],
      args: [
        { name: "marketId", type: "u32" },
        { name: "question", type: "string" },
        { name: "resolutionCriteria", type: "string" },
        { name: "resolutionSource", type: { defined: { name: "ResolutionSource" } } },
        { name: "settlementDeadline", type: "i64" },
        { name: "outcomesCount", type: "u8" },
        { name: "strikePrice", type: "i64" },
        { name: "pythFeed", type: "pubkey" },
      ],
    },
    {
      name: "swap",
      accounts: [
        { name: "market", isMut: true, isSigner: false },
        { name: "user", isMut: true, isSigner: true },
        { name: "userCollateral", isMut: true, isSigner: false },
        { name: "collateralVault", isMut: true, isSigner: false },
        { name: "userOutcome", isMut: true, isSigner: false },
        { name: "outcomeVault", isMut: true, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "marketId", type: "u32" },
        { name: "outcomeIndex", type: "u8" },
        { name: "amountIn", type: "u64" },
      ],
    },
    {
      name: "addLiquidity",
      accounts: [
        { name: "market", isMut: true, isSigner: false },
        { name: "user", isMut: true, isSigner: true },
        { name: "userCollateral", isMut: true, isSigner: false },
        { name: "collateralVault", isMut: true, isSigner: false },
        { name: "lpMint", isMut: true, isSigner: false },
        { name: "userLp", isMut: true, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "marketId", type: "u32" },
        { name: "amount", type: "u64" },
      ],
    },
    {
      name: "claimRewards",
      accounts: [
        { name: "user", isMut: true, isSigner: true },
        { name: "market", isMut: true, isSigner: false },
        { name: "userCollateral", isMut: true, isSigner: false },
        { name: "collateralVault", isMut: true, isSigner: false },
        { name: "winningOutcomeMint", isMut: false, isSigner: false },
        { name: "userWinningOutcomeAta", isMut: true, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "marketId", type: "u32" }
      ],
    }
  ],
  accounts: [
    { name: "Market", discriminator: [219, 190, 213, 55, 0, 227, 198, 154] },
  ],
  types: [
    {
      name: "Market",
      type: {

        kind: "struct",
        fields: [
          { name: "authority", type: "pubkey" },
          { name: "marketId", type: "u32" },
          { name: "createdAt", type: "i64" },
          { name: "settlementDeadline", type: "i64" },
          { name: "question", type: "string" },
          { name: "resolutionCriteria", type: "string" },
          { name: "resolutionSource", type: { defined: { name: "ResolutionSource" } } },
          { name: "collateralMint", type: "pubkey" },
          { name: "collateralVault", type: "pubkey" },
          { name: "outcomesCount", type: "u8" },
          { name: "outcomeMints", type: { array: ["pubkey", 8] } },
          { name: "isSettled", type: "bool" },
          { name: "winningOutcomeIndex", type: { option: "u8" } },
          { name: "totalCollateralLocked", type: "u64" },
          { name: "poolInitialized", type: "bool" },
          { name: "lpMint", type: "pubkey" },
          { name: "outcomeVaults", type: { array: ["pubkey", 8] } },
          { name: "resolutionVotesCount", type: "u8" },
          { name: "consensusThreshold", type: "u8" },
          { name: "totalConsensusConfidence", type: "u32" },
          { name: "strikePrice", type: "i64" },
          { name: "pythFeed", type: "pubkey" },
          { name: "assignedOracles", type: { array: ["pubkey", 5] } },
          { name: "isDisputed", type: "bool" },
          { name: "disputeDeadline", type: "i64" },
          { name: "bump", type: "u8" }
        ]
      }
    },
    {
      name: "ResolutionSource",
      type: {
        kind: "enum",
        variants: [
          { name: "Authority" },
          { name: "Pyth" },
          { name: "Switchboard" },
          { name: "AI" },
          { name: "DAO" }
        ]
      }
    }
  ],
  errors: [
    { code: 6000, name: "MarketExpired", msg: "The market has expired." },
    { code: 6001, name: "MarketAlreadySettled", msg: "The market is already settled." },
    { code: 6002, name: "InsufficientLiquidity", msg: "Insufficient liquidity in the pool." }
  ]
} as const;

