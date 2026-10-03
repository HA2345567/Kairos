import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Raydium,
  DEVNET_PROGRAM_ID,
  CpmmConfigInfoInterface,
} from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🚀 Starting Kairos Devnet Asset & Pool Setup...");

  // 1. Load Deployer Keypair
  const keypairPath = "//wsl.localhost/Ubuntu/home/harshu369/.config/solana/id.json";
  if (!fs.existsSync(keypairPath)) {
    throw new Error(`Keypair not found at ${keypairPath}`);
  }
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const payer = Keypair.fromSecretKey(new Uint8Array(secretKey));
  console.log(`Wallet: ${payer.publicKey.toBase58()}`);

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL`);

  // 2. Initialize Raydium SDK
  const raydium = await Raydium.load({
    owner: payer,
    connection,
    cluster: "devnet",
  });

  const cpmmProgramId = DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM;
  const poolFeeAccount = DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC;
  console.log(`Raydium CPMM Devnet Program: ${cpmmProgramId.toBase58()}`);
  console.log(`Fee Account: ${poolFeeAccount.toBase58()}`);

  // Fetch standard devnet CPMM config
  const configs = await raydium.api.getCpmmConfigs();
  const feeConfig = configs[0] as CpmmConfigInfoInterface;
  console.log(`Using Fee Config: ${feeConfig.id} (Trade Fee: ${feeConfig.tradeFeeRate / 100}%)`);

  // 3. Create or Load Test Mints
  const configPath = path.resolve(process.cwd(), "shared/devnet-config.json");
  let existingConfig: any = {};
  if (fs.existsSync(configPath)) {
    try {
      existingConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {}
  }

  // Mints created in previous run:
  const usdcMint = new PublicKey("An9DFuHeSDYgVBiybraa7Svn1RHjrDb7Ed8YJZCZ4D1Y");
  const jupMint = new PublicKey("atvmDFJj7iGLBqJywzbs1Xo9SBpfp3eYjm268g9pwen");
  const jtoMint = new PublicKey("8YNCULLBG3u4Si2RQpfAidrv84GVifcf5U1wiEXi95Jg");
  console.log(`Using Mints: tUSDC=${usdcMint.toBase58()}, tJUP=${jupMint.toBase58()}, tJTO=${jtoMint.toBase58()}`);

  // 4. Create Raydium CPMM Pool 1: tUSDC / tJUP (~$0.85 per tJUP)
  // 1,000 USDC : 1,176.47 tJUP
  console.log("Creating Raydium CPMM Pool: tUSDC / tJUP...");
  const usdcInfo = await raydium.token.getTokenInfo(usdcMint.toBase58());
  const jupInfo = await raydium.token.getTokenInfo(jupMint.toBase58());
  const jtoInfo = await raydium.token.getTokenInfo(jtoMint.toBase58());

  // Sort mints (Raydium requires mintA < mintB lexicographically)
  const isUsdcFirstJup = usdcMint.toBuffer().compare(jupMint.toBuffer()) < 0;
  const pool1MintA = isUsdcFirstJup ? usdcInfo : jupInfo;
  const pool1MintB = isUsdcFirstJup ? jupInfo : usdcInfo;
  const pool1AmountA = isUsdcFirstJup ? new BN(1_000 * 1e6) : new BN(Math.floor(1_176.470588 * 1e6));
  const pool1AmountB = isUsdcFirstJup ? new BN(Math.floor(1_176.470588 * 1e6)) : new BN(1_000 * 1e6);

  const { execute: executePool1, extInfo: extInfo1 } = await raydium.cpmm.createPool({
    programId: cpmmProgramId,
    poolFeeAccount,
    mintA: pool1MintA,
    mintB: pool1MintB,
    mintAAmount: pool1AmountA,
    mintBAmount: pool1AmountB,
    startTime: new BN(0),
    feeConfig,
    ownerInfo: {
      feePayer: payer.publicKey,
      useSOLBalance: true,
    },
    txVersion: "V0",
  });

  console.log("Broadcasting createPool transaction for tUSDC/tJUP...");
  const { txId: txId1 } = await executePool1({ sendAndConfirm: true });
  console.log(`✅ tUSDC/tJUP Pool Created! Tx: ${txId1}`);
  const pool1Address = extInfo1.address.poolId.toBase58();
  console.log(`Pool 1 ID: ${pool1Address}`);

  // 5. Create Raydium CPMM Pool 2: tUSDC / tJTO (~$2.30 per tJTO)
  // 1,000 USDC : 434.7826 tJTO
  console.log("Creating Raydium CPMM Pool: tUSDC / tJTO...");
  const isUsdcFirstJto = usdcMint.toBuffer().compare(jtoMint.toBuffer()) < 0;
  const pool2MintA = isUsdcFirstJto ? usdcInfo : jtoInfo;
  const pool2MintB = isUsdcFirstJto ? jtoInfo : usdcInfo;
  const pool2AmountA = isUsdcFirstJto ? new BN(1_000 * 1e6) : new BN(Math.floor(434.782608 * 1e9));
  const pool2AmountB = isUsdcFirstJto ? new BN(Math.floor(434.782608 * 1e9)) : new BN(1_000 * 1e6);

  const { execute: executePool2, extInfo: extInfo2 } = await raydium.cpmm.createPool({
    programId: cpmmProgramId,
    poolFeeAccount,
    mintA: pool2MintA,
    mintB: pool2MintB,
    mintAAmount: pool2AmountA,
    mintBAmount: pool2AmountB,
    startTime: new BN(0),
    feeConfig,
    ownerInfo: {
      feePayer: payer.publicKey,
      useSOLBalance: true,
    },
    txVersion: "V0",
  });

  console.log("Broadcasting createPool transaction for tUSDC/tJTO...");
  const { txId: txId2 } = await executePool2({ sendAndConfirm: true });
  console.log(`✅ tUSDC/tJTO Pool Created! Tx: ${txId2}`);
  const pool2Address = extInfo2.address.poolId.toBase58();
  console.log(`Pool 2 ID: ${pool2Address}`);

  // 6. Save Configuration to shared/devnet-config.json
  const finalConfig = {
    cluster: "devnet",
    rpcUrl: "https://api.devnet.solana.com",
    fallbackRpcUrl: "https://devnet.helius-rpc.com/?api-key=15309047-0a65-4466-aa24-4e09d2c08f37",
    raydiumProgramId: cpmmProgramId.toBase58(),
    raydiumAuthority: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_AUTH.toBase58(),
    ammConfig: feeConfig.id,
    programId: "KairosRouter1111111111111111111111111111111", // updated in Task 2
    basketId: "solana-infra-governance",
    mints: {
      usdc: usdcMint.toBase58(),
      tJUP: jupMint.toBase58(),
      tJTO: jtoMint.toBase58(),
    },
    pools: {
      tJUP: {
        poolId: pool1Address,
        ammConfig: feeConfig.id,
        vault0: extInfo1.address.vaultA.toBase58(),
        vault1: extInfo1.address.vaultB.toBase58(),
        observationKey: extInfo1.address.observationId.toBase58(),
        mint0: pool1MintA.address,
        mint1: pool1MintB.address,
        ratio: 0.85,
        creationTx: txId1,
      },
      tJTO: {
        poolId: pool2Address,
        ammConfig: feeConfig.id,
        vault0: extInfo2.address.vaultA.toBase58(),
        vault1: extInfo2.address.vaultB.toBase58(),
        observationKey: extInfo2.address.observationId.toBase58(),
        mint0: pool2MintA.address,
        mint1: pool2MintB.address,
        ratio: 2.3,
        creationTx: txId2,
      },
    },
  };

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(finalConfig, null, 2));
  console.log(`Saved shared devnet configuration to ${configPath}`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
