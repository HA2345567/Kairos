import fs from "fs";
import os from "os";
import path from "path";
import {
  Connection,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
} from "@solana/web3.js";
import {
  buildCreateLookupTableInstruction,
  buildExtendLookupTableInstruction,
  getFixedAltAddresses,
} from "./alt-manager";

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  // Load local keypair
  const keypairPath = path.join(os.homedir(), ".config", "solana", "id.json");
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  console.log(`Using Devnet Payer: ${payer.publicKey.toBase58()}`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Devnet Balance: ${balance / 1e9} SOL`);

  // Mock or placeholder Kairos program ID
  const kairosProgramId = new PublicKey("KairosRouter1111111111111111111111111111111");

  // 1. Get recent slot
  const recentSlot = await connection.getSlot("finalized");

  // 2. Build Create Lookup Table Instruction
  const { instruction: createIx, lookupTableAddress } =
    buildCreateLookupTableInstruction(payer.publicKey, payer.publicKey, recentSlot);

  console.log(`Creating ALT on Devnet at: ${lookupTableAddress.toBase58()} (slot: ${recentSlot})`);

  const createTx = new Transaction().add(createIx);
  const createSig = await sendAndConfirmTransaction(connection, createTx, [payer]);
  console.log(`ALT Created! Signature: ${createSig}`);

  // 3. Extend Lookup Table with fixed router accounts
  const addressesToExtend = getFixedAltAddresses(kairosProgramId);
  const extendIx = buildExtendLookupTableInstruction(
    lookupTableAddress,
    payer.publicKey,
    payer.publicKey,
    addressesToExtend
  );

  const extendTx = new Transaction().add(extendIx);
  const extendSig = await sendAndConfirmTransaction(connection, extendTx, [payer]);
  console.log(`ALT Extended with ${addressesToExtend.length} addresses! Signature: ${extendSig}`);

  // 4. Verify on-chain resolution
  console.log("Awaiting ALT slot warm-up...");
  let tableAccount = null;
  for (let i = 0; i < 10; i++) {
    const res = await connection.getAddressLookupTable(lookupTableAddress);
    if (res.value && res.value.state.addresses.length > 0) {
      tableAccount = res.value;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (tableAccount) {
    console.log(`SUCCESS: Resolved ALT on Devnet with ${tableAccount.state.addresses.length} addresses!`);
    console.log(JSON.stringify({
      lookupTableAddress: lookupTableAddress.toBase58(),
      createTx: createSig,
      extendTx: extendSig,
      addressCount: tableAccount.state.addresses.length,
    }, null, 2));
  } else {
    console.warn("ALT created but warm-up still in progress.");
  }
}

main().catch((err) => {
  console.error("Error deploying Devnet ALT:", err);
  process.exit(1);
});
