const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Encode wallet-adapter signature bytes without adding a second crypto package. */
export function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const value = digits[index] * 256 + carry;
      digits[index] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let encoded = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded += "1";
  }
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    if (index === digits.length - 1 && digits[index] === 0) continue;
    encoded += ALPHABET[digits[index]];
  }
  return encoded;
}
