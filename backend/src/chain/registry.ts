import { createHash } from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { withFailover } from "./connection";
import { KAIROS_ROUTER_PROGRAM_ID } from "./programSwap";

const INLINE_MAX_LEGS = 10;
const MAX_LEGS = 12;
const ITEM_BYTES = 34;
const discriminator = (name: string) => createHash("sha256").update(name).digest().subarray(0, 8);
const instructionDiscriminator = discriminator("global:publish_version");
const versionDiscriminator = discriminator("account:BasketVersion");
const versionExtensionDiscriminator = discriminator("account:BasketVersionExtension");
const globalDiscriminator = discriminator("account:GlobalConfig");
const authoritiesDiscriminator = discriminator("account:PublishAuthorities");
const basketDiscriminator = discriminator("account:BasketConfig");

export const globalConfigPda = () =>
  PublicKey.findProgramAddressSync([Buffer.from("global")], KAIROS_ROUTER_PROGRAM_ID)[0];
export const publishAuthoritiesPda = () =>
  PublicKey.findProgramAddressSync([Buffer.from("publish_authorities")], KAIROS_ROUTER_PROGRAM_ID)[0];
export const basketConfigPda = (basketId: string) =>
  PublicKey.findProgramAddressSync([Buffer.from("basket"), Buffer.from(basketId)], KAIROS_ROUTER_PROGRAM_ID)[0];
export const basketVersionPda = (basketId: string, version: number) => {
  const value = Buffer.alloc(4);
  value.writeUInt32LE(version);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("version"), Buffer.from(basketId), value],
    KAIROS_ROUTER_PROGRAM_ID
  )[0];
};
export const basketVersionExtensionPda = (basketId: string, version: number) => {
  const value = Buffer.alloc(4);
  value.writeUInt32LE(version);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("version_extra"), Buffer.from(basketId), value],
    KAIROS_ROUTER_PROGRAM_ID
  )[0];
};

export interface RegistryLeg {
  mint: string;
  weightBps: number;
}

export interface RegistryPublishBuild {
  transaction: string;
  admin: string;
  approval: string;
  lastValidBlockHeight: number;
}

function borshString(value: string): Buffer {
  const bytes = Buffer.from(value);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

function publicKey(value: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error("REGISTRY_INVALID_PUBLIC_KEY");
  }
}

function canonicalLegs(legs: RegistryLeg[]): { bytes: Buffer; items: Buffer } {
  if (legs.length < 1 || legs.length > MAX_LEGS) throw new Error("INVALID_BASKET_LEG_COUNT");
  const parsed = legs.map(({ mint, weightBps }) => {
    if (!Number.isInteger(weightBps) || weightBps < 1 || weightBps > 10_000) {
      throw new Error("INVALID_WEIGHT_BPS");
    }
    return { mint: publicKey(mint), weightBps };
  });
  if (new Set(parsed.map(({ mint }) => mint.toBase58())).size !== parsed.length) {
    throw new Error("DUPLICATE_BASKET_MINT");
  }
  if (parsed.reduce((sum, leg) => sum + leg.weightBps, 0) !== 10_000) {
    throw new Error("INVALID_BASKET_WEIGHTS");
  }

  const hashBytes = Buffer.concat(parsed
    .slice()
    .sort((a, b) => Buffer.compare(a.mint.toBuffer(), b.mint.toBuffer()))
    .map(({ mint, weightBps }) => {
      const weight = Buffer.alloc(2);
      weight.writeUInt16LE(weightBps);
      return Buffer.concat([mint.toBuffer(), weight]);
    }));
  const items = Buffer.alloc(INLINE_MAX_LEGS * ITEM_BYTES);
  parsed.slice(0, INLINE_MAX_LEGS).forEach(({ mint, weightBps }, index) => {
    const offset = index * ITEM_BYTES;
    mint.toBuffer().copy(items, offset);
    items.writeUInt16LE(weightBps, offset + 32);
  });
  return { bytes: createHash("sha256").update(hashBytes).digest(), items };
}

async function programAccount(address: PublicKey): Promise<Buffer> {
  const account = await withFailover((connection) => connection.getAccountInfo(address, "confirmed"));
  if (!account || !account.owner.equals(KAIROS_ROUTER_PROGRAM_ID)) throw new Error("REGISTRY_NOT_INITIALIZED");
  return account.data;
}

async function registryAuthorities(basketId: string) {
  const [globalData, authoritiesData, basketData] = await Promise.all([
    programAccount(globalConfigPda()),
    programAccount(publishAuthoritiesPda()),
    programAccount(basketConfigPda(basketId)),
  ]);
  if (
    globalData.length < 40 || !globalData.subarray(0, 8).equals(globalDiscriminator) ||
    authoritiesData.length < 105 || !authoritiesData.subarray(0, 8).equals(authoritiesDiscriminator) ||
    basketData.length < 44 || !basketData.subarray(0, 8).equals(basketDiscriminator)
  ) {
    throw new Error("REGISTRY_ACCOUNT_INVALID");
  }
  const admin = new PublicKey(globalData.subarray(8, 40));
  if (!new PublicKey(basketData.subarray(8, 40)).equals(admin)) {
    throw new Error("REGISTRY_BASKET_ADMIN_MISMATCH");
  }
  const idLength = basketData.readUInt32LE(40);
  if (idLength > 32 || basketData.length < 44 + idLength) throw new Error("REGISTRY_ACCOUNT_INVALID");
  const onchainBasketId = basketData.toString("utf8", 44, 44 + idLength);
  if (onchainBasketId !== basketId) throw new Error("REGISTRY_BASKET_ID_MISMATCH");
  const approvers = [0, 1, 2].map((index) =>
    new PublicKey(authoritiesData.subarray(8 + index * 32, 40 + index * 32))
  );
  if (!approvers.some((key) => key.equals(admin))) throw new Error("REGISTRY_ADMIN_NOT_AUTHORIZED");
  return { admin, approvers };
}

function publishInstruction(
  basketId: string,
  version: number,
  legs: RegistryLeg[],
  admin: PublicKey,
  approval: PublicKey
): TransactionInstruction {
  const { bytes: legsHash, items } = canonicalLegs(legs);
  const versionArg = Buffer.alloc(4);
  versionArg.writeUInt32LE(version);
  const legCount = Buffer.from([legs.length]);
  const extended = legs.length > INLINE_MAX_LEGS;
  const encodedItems = extended
    ? Buffer.concat([Buffer.from([legs.length, 0, 0, 0]), ...legs.map(({ mint, weightBps }) => {
        const item = Buffer.alloc(ITEM_BYTES);
        publicKey(mint).toBuffer().copy(item);
        item.writeUInt16LE(weightBps, 32);
        return item;
      })])
    : items;
  const data = extended
    ? Buffer.concat([
        discriminator("global:publish_version_extended"),
        borshString(basketId), versionArg, encodedItems, legsHash,
      ])
    : Buffer.concat([instructionDiscriminator, borshString(basketId), versionArg, items, legCount, legsHash]);
  const accountKeys = [
    { pubkey: admin, isSigner: true, isWritable: true },
    { pubkey: approval, isSigner: true, isWritable: false },
    { pubkey: globalConfigPda(), isSigner: false, isWritable: false },
    { pubkey: publishAuthoritiesPda(), isSigner: false, isWritable: false },
    { pubkey: basketConfigPda(basketId), isSigner: false, isWritable: false },
    { pubkey: basketVersionPda(basketId, version), isSigner: false, isWritable: true },
    ...(extended ? [{ pubkey: basketVersionExtensionPda(basketId, version), isSigner: false, isWritable: true }] : []),
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({
    programId: KAIROS_ROUTER_PROGRAM_ID,
    keys: accountKeys,
    data,
  });
}

export interface RegistryVerification {
  verified: boolean;
  reason: string | null;
  /** SHA-256 legs hash computed locally from the displayed composition. */
  legsHash: string;
  address: string;
  /** §4.1 “Verified on-chain” badge: compare this with the published row. */
  onchainLegsHash: string | null;
}

/**
 * FR-24 read side: recompute the legs hash for a version and compare it with
 * what `publish_version` stored on-chain. Never throws — a missing program or
 * unpublished version is reported as `verified: false` with a reason so the UI
 * can show an honest badge instead of an error.
 */
export async function verifyRegistryVersion(
  basketId: string,
  version: number,
  legs: RegistryLeg[]
): Promise<RegistryVerification> {
  let legsHash = "";
  const address = basketVersionPda(basketId, version).toBase58();
  try {
    legsHash = canonicalLegs(legs).bytes.toString("hex");
  } catch (err) {
    return {
      verified: false,
      reason: err instanceof Error ? err.message : "INVALID_LEGS",
      legsHash,
      address,
      onchainLegsHash: null,
    };
  }
  try {
    const { admin } = await registryAuthorities(basketId);
    const account = await withFailover((connection) =>
      connection.getAccountInfo(basketVersionPda(basketId, version), "confirmed")
    );
    if (!account || !account.owner.equals(KAIROS_ROUTER_PROGRAM_ID)) {
      return { verified: false, reason: "REGISTRY_VERSION_NOT_PUBLISHED", legsHash, address, onchainLegsHash: null };
    }
    const extension = legs.length > INLINE_MAX_LEGS
      ? await withFailover((connection) =>
          connection.getAccountInfo(basketVersionExtensionPda(basketId, version), "confirmed")
        )
      : null;
    if (legs.length > INLINE_MAX_LEGS && (!extension || !extension.owner.equals(KAIROS_ROUTER_PROGRAM_ID))) {
      return { verified: false, reason: "REGISTRY_EXTENSION_NOT_PUBLISHED", legsHash, address, onchainLegsHash: null };
    }
    if (!versionMatches(account.data, basketId, version, legs, admin, extension?.data ?? null)) {
      return { verified: false, reason: "REGISTRY_HASH_MISMATCH", legsHash, address, onchainLegsHash: null };
    }
    return { verified: true, reason: null, legsHash, address, onchainLegsHash: legsHash };
  } catch (err) {
    return {
      verified: false,
      reason: err instanceof Error ? err.message : "REGISTRY_UNAVAILABLE",
      legsHash,
      address,
      onchainLegsHash: null,
    };
  }
}

export async function buildRegistryPublishTransaction(
  basketId: string,
  version: number,
  legs: RegistryLeg[],
  approvalAddress: string
): Promise<RegistryPublishBuild> {
  const { admin, approvers } = await registryAuthorities(basketId);
  const approval = publicKey(approvalAddress);
  if (approval.equals(admin) || !approvers.some((key) => key.equals(approval))) {
    throw new Error("REGISTRY_APPROVER_NOT_AUTHORIZED");
  }
  const { blockhash, lastValidBlockHeight } = await withFailover((connection) =>
    connection.getLatestBlockhash("confirmed")
  );
  const message = new TransactionMessage({
    payerKey: admin,
    recentBlockhash: blockhash,
    instructions: [publishInstruction(basketId, version, legs, admin, approval)],
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  return {
    transaction: Buffer.from(transaction.serialize()).toString("base64"),
    admin: admin.toBase58(),
    approval: approval.toBase58(),
    lastValidBlockHeight,
  };
}

function versionMatches(
  data: Buffer,
  basketId: string,
  version: number,
  legs: RegistryLeg[],
  admin: PublicKey,
  extensionData?: Buffer | null,
): boolean {
  const { bytes: expectedHash } = canonicalLegs(legs);
  const expectedLength = 8 + 32 + 4 + Buffer.byteLength(basketId) + 4 + 1 + INLINE_MAX_LEGS * ITEM_BYTES + 32 + 8 + 1;
  if (data.length < expectedLength) return false;
  if (!data.subarray(0, 8).equals(versionDiscriminator)) return false;
  let offset = 8;
  if (!new PublicKey(data.subarray(offset, offset + 32)).equals(admin)) return false;
  offset += 32;
  const idLength = data.readUInt32LE(offset);
  offset += 4;
  if (data.toString("utf8", offset, offset + idLength) !== basketId) return false;
  offset += idLength;
  if (data.readUInt32LE(offset) !== version) return false;
  offset += 4;
  if (data[offset++] !== legs.length) return false;
  for (let index = 0; index < INLINE_MAX_LEGS; index++) {
    const itemOffset = offset + index * ITEM_BYTES;
    const expected = legs[index];
    if (!expected) {
      if (data.subarray(itemOffset, itemOffset + ITEM_BYTES).some((byte) => byte !== 0)) return false;
      continue;
    }
    if (!data.subarray(itemOffset, itemOffset + 32).equals(publicKey(expected.mint).toBuffer())) return false;
    if (data.readUInt16LE(itemOffset + 32) !== expected.weightBps) return false;
  }
  offset += INLINE_MAX_LEGS * ITEM_BYTES;
  if (!data.subarray(offset, offset + 32).equals(expectedHash)) return false;
  if (legs.length <= INLINE_MAX_LEGS) return extensionData == null;
  if (!extensionData || extensionData.length < 8 + 32 + 1 + 2 * ITEM_BYTES + 1) return false;
  if (!extensionData.subarray(0, 8).equals(versionExtensionDiscriminator)) return false;
  if (!extensionData.subarray(8, 40).equals(basketVersionPda(basketId, version).toBuffer())) return false;
  const extraCount = legs.length - INLINE_MAX_LEGS;
  if (extensionData[40] !== extraCount) return false;
  for (let index = 0; index < 2; index++) {
    const itemOffset = 41 + index * ITEM_BYTES;
    const expected = legs[INLINE_MAX_LEGS + index];
    if (!expected) {
      if (extensionData.subarray(itemOffset, itemOffset + ITEM_BYTES).some((byte) => byte !== 0)) return false;
      continue;
    }
    if (!extensionData.subarray(itemOffset, itemOffset + 32).equals(publicKey(expected.mint).toBuffer())) return false;
    if (extensionData.readUInt16LE(itemOffset + 32) !== expected.weightBps) return false;
  }
  return true;
}

export async function submitRegistryPublishTransaction(
  serializedTransaction: string,
  basketId: string,
  version: number,
  legs: RegistryLeg[],
  approvalAddress: string
): Promise<{ signature: string; legsHash: string }> {
  const raw = Buffer.from(serializedTransaction, "base64");
  if (!raw.length || raw.toString("base64") !== serializedTransaction) throw new Error("INVALID_SIGNED_TRANSACTION");
  let transaction: VersionedTransaction;
  try {
    transaction = VersionedTransaction.deserialize(raw);
  } catch {
    throw new Error("REGISTRY_TRANSACTION_INVALID");
  }
  const { admin, approvers } = await registryAuthorities(basketId);
  const approval = publicKey(approvalAddress);
  if (approval.equals(admin) || !approvers.some((key) => key.equals(approval))) {
    throw new Error("REGISTRY_APPROVER_NOT_AUTHORIZED");
  }
  const message = transaction.message;
  const signerCount = message.header.numRequiredSignatures;
  if (
    signerCount !== 2 ||
    !message.staticAccountKeys[0].equals(admin) ||
    !message.staticAccountKeys[1].equals(approval)
  ) throw new Error("REGISTRY_SIGNERS_MISMATCH");

  const expectedMessage = new TransactionMessage({
    payerKey: admin,
    recentBlockhash: message.recentBlockhash,
    instructions: [publishInstruction(basketId, version, legs, admin, approval)],
  }).compileToV0Message();
  if (!Buffer.from(message.serialize()).equals(Buffer.from(expectedMessage.serialize()))) {
    throw new Error("REGISTRY_MESSAGE_MISMATCH");
  }
  if (transaction.signatures.length !== 2 || transaction.signatures.some((sig) => sig.every((byte) => byte === 0))) {
    throw new Error("REGISTRY_SIGNATURES_REQUIRED");
  }
  const messageBytes = message.serialize();
  if (transaction.signatures.some((signature, index) =>
    !nacl.sign.detached.verify(messageBytes, signature, message.staticAccountKeys[index].toBytes())
  )) throw new Error("REGISTRY_SIGNATURE_INVALID");
  const signature = bs58.encode(transaction.signatures[0]);
  const prior = await withFailover((conn) =>
    conn.getSignatureStatuses([signature], { searchTransactionHistory: true })
  );
  if (prior.value[0]?.err) throw new Error("REGISTRY_TRANSACTION_FAILED");
  if (!prior.value[0]) {
    const blockhashValid = await withFailover((conn) => conn.isBlockhashValid(message.recentBlockhash, { commitment: "confirmed" }));
    if (!blockhashValid.value) throw new Error("REGISTRY_TRANSACTION_EXPIRED");
    const sentSignature = await withFailover((conn) =>
      conn.sendRawTransaction(transaction.serialize(), { skipPreflight: false })
    );
    if (sentSignature !== signature) throw new Error("REGISTRY_SIGNATURE_MISMATCH");
  }
  const confirmation = await withFailover((conn) => conn.confirmTransaction(signature, "confirmed"));
  if (confirmation.value.err) throw new Error("REGISTRY_TRANSACTION_FAILED");
  const versionAddress = basketVersionPda(basketId, version);
  const account = await withFailover((conn) => conn.getAccountInfo(versionAddress, "confirmed"));
  if (!account || !account.owner.equals(KAIROS_ROUTER_PROGRAM_ID) || !versionMatches(account.data, basketId, version, legs, admin)) {
    throw new Error("REGISTRY_VERSION_VERIFICATION_FAILED");
  }
  const { bytes } = canonicalLegs(legs);
  return { signature, legsHash: bytes.toString("hex") };
}
