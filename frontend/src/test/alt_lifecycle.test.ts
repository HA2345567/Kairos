import { describe, it, expect } from "vitest";
import { PublicKey, Keypair, AddressLookupTableProgram } from "@solana/web3.js";
import {
  FIXED_ROUTER_ACCOUNTS,
  getFixedAltAddresses,
  buildCreateLookupTableInstruction,
  buildExtendLookupTableInstruction,
} from "../../../scripts/alt-manager";

describe("Kairos Router - Address Lookup Table (ALT) Lifecycle Unit Tests", () => {
  const authority = Keypair.generate().publicKey;
  const payer = Keypair.generate().publicKey;
  const kairosProgramId = Keypair.generate().publicKey;
  const recentSlot = 280000000;

  it("builds a valid createLookupTable instruction and derives lookupTableAddress", () => {
    const { instruction, lookupTableAddress } = buildCreateLookupTableInstruction(
      authority,
      payer,
      recentSlot
    );

    expect(instruction.programId.equals(AddressLookupTableProgram.programId)).toBe(true);
    expect(lookupTableAddress).toBeInstanceOf(PublicKey);
    expect(instruction.keys.length).toBeGreaterThanOrEqual(4);

    // Verify payer and authority are in the account metas
    const payerMeta = instruction.keys.find((k) => k.pubkey.equals(payer));
    const authorityMeta = instruction.keys.find((k) => k.pubkey.equals(authority));

    expect(payerMeta?.isSigner).toBe(true);
    expect(payerMeta?.isWritable).toBe(true);
    expect(authorityMeta?.isSigner).toBe(true);
  });

  it("compiles the complete fixed address list for Kairos router", () => {
    const fixedAddresses = getFixedAltAddresses(kairosProgramId);

    expect(fixedAddresses.length).toBe(8);
    expect(fixedAddresses).toContainEqual(FIXED_ROUTER_ACCOUNTS.JUPITER_PROGRAM_ID);
    expect(fixedAddresses).toContainEqual(kairosProgramId);
    expect(fixedAddresses).toContainEqual(FIXED_ROUTER_ACCOUNTS.USDC_MINT);
    expect(fixedAddresses).toContainEqual(FIXED_ROUTER_ACCOUNTS.WSOL_MINT);
    expect(fixedAddresses).toContainEqual(FIXED_ROUTER_ACCOUNTS.JTO_MINT);
    expect(fixedAddresses).toContainEqual(FIXED_ROUTER_ACCOUNTS.TOKEN_PROGRAM_ID);
    expect(fixedAddresses).toContainEqual(FIXED_ROUTER_ACCOUNTS.ASSOCIATED_TOKEN_PROGRAM_ID);
    expect(fixedAddresses).toContainEqual(FIXED_ROUTER_ACCOUNTS.SYSTEM_PROGRAM_ID);
  });

  it("builds a valid extendLookupTable instruction with all fixed addresses", () => {
    const { lookupTableAddress } = buildCreateLookupTableInstruction(
      authority,
      payer,
      recentSlot
    );
    const fixedAddresses = getFixedAltAddresses(kairosProgramId);

    const extendInstruction = buildExtendLookupTableInstruction(
      lookupTableAddress,
      payer,
      authority,
      fixedAddresses
    );

    expect(extendInstruction.programId.equals(AddressLookupTableProgram.programId)).toBe(true);

    // Verify lookup table account is writable
    const tableMeta = extendInstruction.keys.find((k) =>
      k.pubkey.equals(lookupTableAddress)
    );
    expect(tableMeta?.isWritable).toBe(true);

    // Verify authority is a signer
    const authorityMeta = extendInstruction.keys.find((k) =>
      k.pubkey.equals(authority)
    );
    expect(authorityMeta?.isSigner).toBe(true);
  });
});
