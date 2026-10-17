// Auth service (Lane A3 "AUTH") — full rewrite per contracts.md §8.
//
// SIWS-style wallet login:
//   1. generateNonce() persists a 15-min single-use nonce ("kairos-auth-<32hex>")
//   2. the client signs a message embedding that nonce with its Ed25519 key
//   3. verify() consumes the nonce (single-use, race-free via repository),
//      verifies the detached Ed25519 signature (tweetnacl + bs58), then
//      find-or-creates user + wallet and issues an access JWT + refresh token
//   4. refresh() rotates the refresh token (old hash revoked, new one stored)
//
// Tokens:
//   - access JWT: HMAC-SHA256 via node:crypto only, header.payload.sig base64url,
//     payload { sub, wallet, iat, exp }, ttl = config.jwtAccessSec
//   - refresh token: 48-hex crypto random; ONLY sha256(token) is persisted
//
// Keep the export name `authService` (consumed by routes/api.routes.ts).

import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { config } from "../config";
import { repository } from "../db/repository";
import { one } from "../db/postgres";
import type { User, Wallet } from "../db/schema";

// ---------- constants ----------

const NONCE_PREFIX = "kairos-auth-";
const NONCE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const NONCE_PATTERN = /kairos-auth-[0-9a-f]{32}/;
const REFRESH_TOKEN_PATTERN = /^[0-9a-f]{48}$/;
const RESTRICTED_REGIONS = ["KP", "IR", "CU", "SY"];

// ---------- public shapes ----------

/** Wire shape of the authenticated user (verify() response). */
export interface AuthUserView {
  id: string;
  authProvider: User["authProvider"];
  createdAt: string;
  status: User["status"];
  region: string;
}

/** Wire shape of the authenticated wallet (verify() response). */
export interface AuthWalletView {
  id: string;
  address: string;
  type: Wallet["type"];
  delegatedSigning: boolean;
}

export interface AuthVerifyResult {
  token: string;
  refreshToken: string;
  user: AuthUserView;
  wallet: AuthWalletView;
}

export interface AuthRefreshResult {
  token: string;
  refreshToken: string;
}

export interface AuthContext {
  userId: string;
  walletAddress: string;
}

/** Structural stand-in for the custom server's request (server.ts RouteHandler req). */
export interface AuthRequestLike {
  headers: Record<string, string | string[] | undefined>;
}

export interface AuthServiceApi {
  generateNonce(walletAddress: string): Promise<string>;
  verify(
    walletAddress: string,
    signatureBase58: string,
    message: string
  ): Promise<AuthVerifyResult | null>;
  refresh(refreshToken: string): Promise<AuthRefreshResult | null>;
  signJwt(payload: object, ttlSec: number): string;
  verifyJwt(token: string): object | null;
  requireAuth(authHeader: string | AuthRequestLike | undefined): AuthContext | null;
  isRegionEligible(countryCode: string): boolean;
}

// ---------- JWT (HMAC-SHA256, node:crypto only) ----------

function b64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8")).toString("base64url");
}

function hmacSign(data: string): Buffer {
  return createHmac("sha256", config.jwtSecret).update(data, "utf8").digest();
}

function signToken(payload: object, ttlSec: number): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = { iat: nowSec, exp: nowSec + ttlSec, ...payload };
  const head = b64url(JSON.stringify(header));
  const pay = b64url(JSON.stringify(body));
  const sig = hmacSign(`${head}.${pay}`).toString("base64url");
  return `${head}.${pay}.${sig}`;
}

function verifyToken(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [head, pay, sig] = parts;

    const header = JSON.parse(Buffer.from(head, "base64url").toString("utf8")) as {
      alg?: unknown;
    };
    if (header?.alg !== "HS256") return null;

    const expected = hmacSign(`${head}.${pay}`);
    const received = Buffer.from(sig, "base64url");
    if (received.length !== expected.length) return null;
    if (!timingSafeEqual(received, expected)) return null;

    const payload = JSON.parse(Buffer.from(pay, "base64url").toString("utf8")) as unknown;
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;

    const exp = Number((payload as Record<string, unknown>).exp);
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------- refresh tokens (opaque 48-hex; only sha256 persisted) ----------

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function newRefreshToken(): string {
  return randomBytes(24).toString("hex"); // 48 hex chars
}

async function persistRefreshToken(token: string, userId: string): Promise<void> {
  (await repository.saveRefreshToken(
    "rt-" + randomUUID().slice(0, 12),
    userId,
    sha256Hex(token),
    Date.now() + config.jwtRefreshSec * 1000
  ));
}

/**
 * The repository contract exposes no wallet-by-user lookup, so resolve the
 * wallet address for a refreshed JWT with a read-only query against the frozen
 * `wallets` schema (user_id is UNIQUE-ish per row order; first wallet wins).
 */
async function walletAddressForUser(userId: string): Promise<string> {
  try {
    const row = await one<{ address: string }>("SELECT address FROM wallets WHERE user_id = ? ORDER BY rowid ASC LIMIT 1", userId);
    return row?.address ?? "";
  } catch {
    return "";
  }
}

// ---------- helpers ----------

/** Pull the full nonce string ("kairos-auth-<32hex>") out of a signed message. */
function extractNonce(message: string): string | null {
  const match = NONCE_PATTERN.exec(message);
  return match ? match[0] : null;
}

function projectUser(user: User): AuthUserView {
  return {
    id: user.id,
    authProvider: user.authProvider,
    createdAt: user.createdAt,
    status: user.status,
    region: user.region,
  };
}

function projectWallet(wallet: Wallet): AuthWalletView {
  return {
    id: wallet.id,
    address: wallet.address,
    type: wallet.type,
    delegatedSigning: wallet.delegatedSigning,
  };
}

/**
 * Accept either a raw Authorization header value or a request-like object
 * (contracts.md §8 says requireAuth(req); the lane spec says header string —
 * support both, the string form being the primary typed signature).
 */
function extractAuthorization(input: string | AuthRequestLike | undefined): string | undefined {
  if (typeof input === "string") return input;
  if (input !== null && typeof input === "object" && "headers" in input) {
    const headers = (input as AuthRequestLike).headers ?? {};
    const raw =
      headers["authorization"] ??
      headers["Authorization"] ??
      headers["AUTHORIZATION"];
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  }
  return undefined;
}

const textEncoder = new TextEncoder();

// ---------- service ----------

export const authService: AuthServiceApi = {
  /**
   * Issue and persist a single-use login nonce for `walletAddress`.
   * Format "kairos-auth-<32hex>", 15-minute expiry.
   */
  async generateNonce(walletAddress: string): Promise<string> {
    const nonce = NONCE_PREFIX + randomBytes(16).toString("hex");
    (await repository.createNonce(walletAddress, nonce, Date.now() + NONCE_TTL_MS));
    return nonce;
  },

  /**
   * Verify a wallet signature over a message embedding a previously issued
   * nonce. The nonce is consumed FIRST (unknown/expired/replayed -> null),
   * then the Ed25519 detached signature is checked. On success find-or-create
   * user ("siws"/"active"/"global") + wallet ("external", not delegated) and
   * issue access JWT + refresh token.
   */
  async verify(
    walletAddress: string,
    signatureBase58: string,
    message: string
  ): Promise<AuthVerifyResult | null> {
    if (
      typeof walletAddress !== "string" ||
      typeof signatureBase58 !== "string" ||
      typeof message !== "string"
    ) {
      return null;
    }

    // 1. Single-use nonce consumption (also proves the nonce was issued to
    //    this exact wallet and is unexpired). Consumed even if the signature
    //    below is invalid — a burned nonce cannot be replayed.
    const nonce = extractNonce(message);
    if (!nonce) return null;
    if (!(await repository.consumeNonce(walletAddress, nonce))) return null;

    // 2. Ed25519 detached-signature verification.
    try {
      const messageBytes = textEncoder.encode(message);
      const signatureBytes = bs58.decode(signatureBase58);
      const pubkeyBytes = bs58.decode(walletAddress);
      const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);
      if (!valid) return null;
    } catch {
      return null; // malformed base58 / wrong-length key material
    }

    // 3. Find-or-create user + wallet.
    let wallet = (await repository.getWalletByAddress(walletAddress));
    let user: User | undefined;
    if (wallet) {
      user = (await repository.getUser(wallet.userId)); // orphans impossible (FK ON)
    } else {
      user = (await repository.saveUser({
        id: "usr-" + randomUUID().slice(0, 8),
        authProvider: "siws",
        createdAt: new Date().toISOString(),
        status: "active",
        region: "global",
      }));
      wallet = (await repository.saveWallet({
        id: "wal-" + randomUUID().slice(0, 8),
        userId: user.id,
        address: walletAddress,
        type: "external",
        delegatedSigning: false,
      }));
    }
    if (!wallet || !user) return null;

    // 4. Issue tokens.
    const token = signToken(
      { sub: user.id, wallet: wallet.address },
      config.jwtAccessSec
    );
    const refreshToken = newRefreshToken();
    (await persistRefreshToken(refreshToken, user.id));

    return {
      token,
      refreshToken,
      user: projectUser(user),
      wallet: projectWallet(wallet),
    };
  },

  /**
   * Rotate a refresh token: the presented token's hash is revoked and a fresh
   * pair is returned. Unknown/expired/revoked/reused tokens -> null.
   */
  async refresh(refreshToken: string): Promise<AuthRefreshResult | null> {
    if (typeof refreshToken !== "string" || !REFRESH_TOKEN_PATTERN.test(refreshToken)) {
      return null;
    }
    const hash = sha256Hex(refreshToken);
    const record = (await repository.getRefreshToken(hash));
    if (!record) return null;
    (await repository.revokeRefreshToken(hash));

    const token = signToken(
      { sub: record.userId, wallet: await walletAddressForUser(record.userId) },
      config.jwtAccessSec
    );
    const rotated = newRefreshToken();
    (await persistRefreshToken(rotated, record.userId));
    return { token, refreshToken: rotated };
  },

  /** Sign a JWT with config.jwtSecret. Adds iat/exp unless the payload overrides. */
  signJwt(payload: object, ttlSec: number): string {
    return signToken(payload, ttlSec);
  },

  /** Verify signature (timing-safe) + exp. Returns the payload or null. */
  verifyJwt(token: string): object | null {
    if (typeof token !== "string") return null;
    return verifyToken(token);
  },

  /**
   * Resolve an Authorization: Bearer header (or request-like object carrying
   * one) into an auth context. Invalid/expired/malformed -> null.
   */
  requireAuth(authHeader: string | AuthRequestLike | undefined): AuthContext | null {
    const header = extractAuthorization(authHeader);
    if (!header) return null;
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match) return null;
    const payload = verifyToken(match[1].trim());
    if (!payload) return null;
    const sub = payload.sub;
    if (typeof sub !== "string" || sub.length === 0) return null;
    return {
      userId: sub,
      walletAddress: typeof payload.wallet === "string" ? payload.wallet : "",
    };
  },

  /** Geo eligibility (PRD §10) — also enforced per-request by middleware.geoCheck. */
  isRegionEligible(countryCode: string): boolean {
    if (typeof countryCode !== "string") return true;
    return !RESTRICTED_REGIONS.includes(countryCode.trim().toUpperCase());
  },
};
