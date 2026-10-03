import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { PrismaClient } from "@prisma/client";
import { startNavSnapshotCron, runNavSnapshotCycle } from "./services/navSnapshotCron.js";

dotenv.config();

const prisma = new PrismaClient();
const server = Fastify({
  logger: true,
});

await server.register(cors, {
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
});

// Health check endpoint
server.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

// List all baskets with constituent tokens
server.get("/api/baskets", async () => {
  const baskets = await prisma.basket.findMany({
    include: {
      tokens: true,
    },
  });
  return baskets;
});

// Step 5: Fastify endpoint GET /api/baskets/:id/nav-history
// - Query BasketNAVHistory for given basketId, ordered by timestamp ascending
// - If no rows exist, return HTTP 404 with clear error message (frontend depends on 404 for empty state)
// - Return each row as { timestamp: <unix ms>, navValue: <number> }
server.get<{ Params: { id: string } }>("/api/baskets/:id/nav-history", async (request, reply) => {
  const { id } = request.params;

  const rows = await prisma.basketNAVHistory.findMany({
    where: { basketId: id },
    orderBy: { timestamp: "asc" },
  });

  if (!rows || rows.length === 0) {
    return reply.code(404).send({
      statusCode: 404,
      error: "Not Found",
      message: `No NAV history found for basket "${id}". Real data is pending or unavailable.`,
    });
  }

  const payload = rows.map((r) => ({
    timestamp: r.timestamp.getTime(),
    navValue: r.navValue,
  }));

  return reply.code(200).send(payload);
});

// Return the latest NAV snapshot for every basket (single call, powers the markets list)
server.get("/api/baskets/nav-latest", async (_request, reply) => {
  const baskets = await prisma.basket.findMany({ select: { id: true } });

  const results: Record<string, { navValue: number; timestamp: number } | null> = {};

  await Promise.all(
    baskets.map(async (b) => {
      const latest = await prisma.basketNAVHistory.findFirst({
        where: { basketId: b.id },
        orderBy: { timestamp: "desc" },
      });
      results[b.id] = latest
        ? { navValue: latest.navValue, timestamp: latest.timestamp.getTime() }
        : null;
    })
  );

  return reply.code(200).send(results);
});


// In-memory fallback investment store for demo
interface InvestmentRecord {
  wallet: string;
  basketId: string;
  txSignature: string;
  amountUsdc: number;
  createdAt: string;
}
const investmentStore: InvestmentRecord[] = [];

// Record investment after devnet on-chain execution
server.post<{
  Body: {
    wallet: string;
    basketId: string;
    txSignature: string;
    amountUsdc: number;
  };
}>("/api/investments/record", async (request, reply) => {
  const { wallet, basketId, txSignature, amountUsdc } = request.body;
  if (!wallet || !txSignature) {
    return reply.code(400).send({ error: "Missing required fields: wallet, txSignature" });
  }

  const record: InvestmentRecord = {
    wallet,
    basketId: basketId || "solana-infra-governance",
    txSignature,
    amountUsdc: Number(amountUsdc) || 0,
    createdAt: new Date().toISOString(),
  };

  investmentStore.unshift(record);
  server.log.info({ record }, "Investment recorded");
  return reply.code(201).send({ success: true, record });
});

// Get user investment positions and history
server.get<{ Params: { wallet: string } }>("/api/positions/:wallet", async (request, reply) => {
  const { wallet } = request.params;
  const userInvestments = investmentStore.filter(
    (inv) => inv.wallet.toLowerCase() === wallet.toLowerCase()
  );
  return reply.code(200).send({
    wallet,
    investments: userInvestments,
  });
});

// Devnet Faucet endpoint for user wallets (Phantom, Solflare, etc.)
server.post<{
  Body: {
    wallet: string;
    amountUsdc?: number;
  };
}>("/api/faucet", async (request, reply) => {
  const { wallet, amountUsdc = 50 } = request.body || {};
  if (!wallet) {
    return reply.code(400).send({ error: "Missing required field: wallet" });
  }

  try {
    const recipientPubkey = new PublicKey(wallet);
    const candidatePaths = [
      path.resolve(process.cwd(), "scripts/deployer-keypair.json"),
      path.resolve(process.cwd(), "../scripts/deployer-keypair.json"),
    ];
    const keypairPath = candidatePaths.find((p) => fs.existsSync(p));
    if (!keypairPath) {
      return reply.code(500).send({ error: "Deployer keypair not found on server." });
    }

    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")));
    const payer = Keypair.fromSecretKey(secretKey);

    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const usdcMint = new PublicKey("An9DFuHeSDYgVBiybraa7Svn1RHjrDb7Ed8YJZCZ4D1Y");

    // Airdrop SOL if low (<0.05 SOL)
    let airdroppedSol = false;
    const recipientSol = await connection.getBalance(recipientPubkey);
    if (recipientSol < 0.05 * LAMPORTS_PER_SOL) {
      try {
        const airdropSig = await connection.requestAirdrop(recipientPubkey, 1 * LAMPORTS_PER_SOL);
        await connection.confirmTransaction(airdropSig, "confirmed");
        airdroppedSol = true;
      } catch (err: any) {
        server.log.warn({ err: err.message }, "SOL airdrop request failed");
      }
    }

    // Get or create recipient's devnet USDC ATA
    const userAta = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      usdcMint,
      recipientPubkey
    );

    // Mint devnet USDC directly to user's ATA
    const amountLamports = BigInt(Math.floor(amountUsdc * 1_000_000));
    const mintSig = await mintTo(
      connection,
      payer,
      usdcMint,
      userAta.address,
      payer.publicKey,
      amountLamports
    );

    return reply.code(200).send({
      success: true,
      wallet: recipientPubkey.toBase58(),
      mintedUsdc: amountUsdc,
      airdroppedSol,
      mintSignature: mintSig,
    });
  } catch (err: any) {
    server.log.error(err, "Faucet error");
    return reply.code(500).send({ error: err.message || "Failed to mint devnet USDC" });
  }
});

// Manual trigger for testing snapshots
server.post("/api/admin/trigger-snapshot", async () => {
  const result = await runNavSnapshotCycle();
  return { success: true, ...result };
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || "3001", 10);
    const host = process.env.HOST || "0.0.0.0";

    await server.listen({ port, host });
    console.log(`🚀 Kairos Backend Server running on http://${host}:${port}`);

    // Step 4: Live Cron Job for Ongoing Snapshots
    // Runs immediately on startup + hourly schedule
    startNavSnapshotCron(60 * 60 * 1000);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
