import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

interface Diagnostic {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: string;
}

async function runPreflight() {
  console.log("\n========================================================");
  console.log("       KAIROS DEVNET DEMO — PREFLIGHT DIAGNOSTICS      ");
  console.log("========================================================\n");

  const results: Diagnostic[] = [];

  const configPath = path.resolve(process.cwd(), "shared/devnet-config.json");
  if (!fs.existsSync(configPath)) {
    console.error("❌ shared/devnet-config.json missing!");
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  // 1. Primary RPC check
  try {
    const conn = new Connection(config.rpcUrl, "confirmed");
    const genesis = await conn.getGenesisHash();
    const isDevnet = genesis === "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
    results.push({
      name: "Primary RPC (Devnet Cluster)",
      status: isDevnet ? "PASS" : "WARN",
      detail: `${config.rpcUrl} (Genesis: ${genesis.slice(0, 10)}...)`,
    });
  } catch (err: any) {
    results.push({
      name: "Primary RPC (Devnet Cluster)",
      status: "FAIL",
      detail: err.message,
    });
  }

  // 2. Fallback RPC check
  try {
    const connFallback = new Connection(config.fallbackRpcUrl, "confirmed");
    const genesis = await connFallback.getGenesisHash();
    results.push({
      name: "Fallback RPC (Helius Devnet)",
      status: "PASS",
      detail: `Reachable (Genesis: ${genesis.slice(0, 10)}...)`,
    });
  } catch (err: any) {
    results.push({
      name: "Fallback RPC (Helius Devnet)",
      status: "WARN",
      detail: `Unreachable: ${err.message}`,
    });
  }

  const conn = new Connection(config.rpcUrl, "confirmed");

  // 3. Check Mints
  for (const [key, mintStr] of Object.entries(config.mints) as [string, string][]) {
    try {
      const mintPk = new PublicKey(mintStr);
      const acc = await conn.getAccountInfo(mintPk);
      if (acc && acc.data.length >= 82) {
        results.push({
          name: `Mint: ${key}`,
          status: "PASS",
          detail: mintStr,
        });
      } else {
        results.push({
          name: `Mint: ${key}`,
          status: "FAIL",
          detail: `Account info invalid or missing: ${mintStr}`,
        });
      }
    } catch (err: any) {
      results.push({
        name: `Mint: ${key}`,
        status: "FAIL",
        detail: err.message,
      });
    }
  }

  // 4. Check Raydium CPMM Pools
  for (const [token, p] of Object.entries(config.pools) as [string, any][]) {
    try {
      const poolPk = new PublicKey(p.poolId);
      const acc = await conn.getAccountInfo(poolPk);
      if (acc) {
        const vault0Bal = await conn.getTokenAccountBalance(new PublicKey(p.vault0));
        const vault1Bal = await conn.getTokenAccountBalance(new PublicKey(p.vault1));
        results.push({
          name: `Pool ${token}/USDC (${p.poolId.slice(0, 8)}...)`,
          status: "PASS",
          detail: `Reserves: ${vault0Bal.value.uiAmountString} ${token} / ${vault1Bal.value.uiAmountString} USDC`,
        });
      } else {
        results.push({
          name: `Pool ${token}/USDC`,
          status: "FAIL",
          detail: `Pool account not found: ${p.poolId}`,
        });
      }
    } catch (err: any) {
      results.push({
        name: `Pool ${token}/USDC`,
        status: "FAIL",
        detail: err.message,
      });
    }
  }

  // 5. Deployer / Mint Authority Balance
  try {
    const keypairPath = path.resolve(process.cwd(), "scripts/deployer-keypair.json");
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")));
    const deployerPk = new PublicKey(
      "2XHMC76HWGUaW44nrZemwpWcfd3VsKT97nomovge5H5G"
    );
    const bal = await conn.getBalance(deployerPk);
    const sol = bal / LAMPORTS_PER_SOL;
    results.push({
      name: "Deployer SOL Balance",
      status: sol > 0.05 ? "PASS" : "WARN",
      detail: `${sol.toFixed(4)} SOL (${deployerPk.toBase58()})`,
    });
  } catch (err: any) {
    results.push({
      name: "Deployer Keypair",
      status: "WARN",
      detail: err.message,
    });
  }

  // Print results table
  for (const r of results) {
    const symbol = r.status === "PASS" ? "✓ [PASS]" : r.status === "WARN" ? "⚠ [WARN]" : "✗ [FAIL]";
    console.log(`${symbol.padEnd(9)} ${r.name.padEnd(35)} : ${r.detail}`);
  }

  const allPassed = results.every((r) => r.status !== "FAIL");
  console.log("\n--------------------------------------------------------");
  if (allPassed) {
    console.log("🎉 ALL PREFLIGHT CHECKS PASSED — READY FOR DEMO!");
  } else {
    console.log("❌ SOME CHECKS FAILED — REVIEW ABOVE LOGS.");
  }
  console.log("========================================================\n");
}

runPreflight().catch(console.error);
