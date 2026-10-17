import { describe, expect, it } from "vitest";
import { formatTokenBaseUnits, parseUsdcBaseUnits } from "@/lib/usdc";

describe("USDC transfer amount parsing", () => {
  it("formats exact receipt amounts without Number rounding", () => {
    expect(formatTokenBaseUnits("9007199254740993", 6)).toBe("9007199254.740993");
    expect(formatTokenBaseUnits("2400000", 6)).toBe("2.4");
    expect(formatTokenBaseUnits("1", 9)).toBe("0.000000001");
    expect(formatTokenBaseUnits("0", 6)).toBe("0");
    expect(formatTokenBaseUnits("12", 0)).toBe("12");
    expect(formatTokenBaseUnits("-1", 6)).toBe("Unavailable");
  });
  it("converts decimal strings without floating point rounding", () => {
    expect(parseUsdcBaseUnits("12.000001")).toBe(12_000_001n);
    expect(parseUsdcBaseUnits("0.5")).toBe(500_000n);
  });

  it("rejects zero, excess precision, and non-decimal input", () => {
    expect(parseUsdcBaseUnits("0")).toBeNull();
    expect(parseUsdcBaseUnits("1.0000001")).toBeNull();
    expect(parseUsdcBaseUnits("1e2")).toBeNull();
    expect(parseUsdcBaseUnits("-1")).toBeNull();
  });
});
