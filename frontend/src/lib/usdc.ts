/**
 * FR-16: the authoritative USDC mint comes from `GET /v1/config`
 * (`usdcMint`). This constant is retained ONLY as documentation of the legacy
 * hardcoded value and must not be used for balance or transfer logic.
 */
export const DEVNET_USDC_MINT = "An9DFuHeSDYgVBiybraa7Svn1RHjrDb7Ed8YJZCZ4D1Y";

/** Resolve the USDC mint for wallet operations; null means "not configured yet". */
export function resolveUsdcMint(configMint: string | null | undefined): string | null {
  return configMint && configMint.length > 0 ? configMint : null;
}

export function formatTokenBaseUnits(raw: string, decimals: number): string {
  if (!/^\d+$/.test(raw) || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) return "Unavailable";
  const digits = BigInt(raw).toString().padStart(decimals + 1, "0");
  if (decimals === 0) return digits;
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return digits.slice(0, -decimals) + (fraction ? `.${fraction}` : "");
}

export function parseUsdcBaseUnits(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match) return null;
  const units = BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0") || "0");
  return units > 0n ? units : null;
}
