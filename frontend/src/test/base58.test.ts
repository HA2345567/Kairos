import { describe, expect, it } from "vitest";
import { encodeBase58 } from "@/lib/base58";

describe("wallet signature base58 encoding", () => {
  it("matches the standard encoding for text and leading zero bytes", () => {
    expect(encodeBase58(new TextEncoder().encode("Hello World"))).toBe("JxF12TrwUP45BMd");
    expect(encodeBase58(new Uint8Array())).toBe("");
    expect(encodeBase58(new Uint8Array([0]))).toBe("1");
    expect(encodeBase58(new Uint8Array([0, 0, 1]))).toBe("112");
  });
});
