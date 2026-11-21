import crypto from "node:crypto";
import { getSessionSecret } from "./paths";

export interface EventSessionPayload {
  eventId: string;
  slug: string;
  attendeeId: string;
  name: string;
  isHost: boolean;
  exp: number;
}

const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const PASSKEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Hashes a PIN or host passkey using scrypt with a random 16-byte salt.
 */
export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(secret, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

/**
 * Verifies a plaintext PIN or host passkey against a stored `salt:hash` string in constant time.
 */
export function verifySecret(secret: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !secret) {
    return false;
  }

  const parts = storedHash.split(":");
  if (parts.length !== 2) {
    return false;
  }

  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) {
    return false;
  }

  try {
    const expected = Buffer.from(expectedHex, "hex");
    const derived = crypto.scryptSync(secret, salt, 64);
    if (expected.length === 0 || expected.length !== derived.length) {
      return false;
    }
    return crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

/**
 * Returns the event-scoped HTTP-only cookie name for a given room slug.
 */
export function getCookieName(slug: string): string {
  return `te_session_${slug.replace(/[^a-z0-9_-]/gi, "_")}`;
}

/**
 * Signs an event-scoped attendee session payload using HMAC-SHA256.
 */
export function signEventSession(payload: EventSessionPayload, secret?: string): string {
  const key = secret ?? getSessionSecret();
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${signature}`;
}

/**
 * Verifies an event-scoped session token, checking HMAC signature, target slug, and expiration.
 */
export function verifyEventSession(
  token: string | undefined,
  expectedSlug: string,
  secret?: string,
  now = Date.now(),
): EventSessionPayload | null {
  if (!token) {
    return null;
  }

  const dotIdx = token.indexOf(".");
  if (dotIdx <= 0 || dotIdx === token.length - 1) {
    return null;
  }

  const body = token.slice(0, dotIdx);
  const providedSig = token.slice(dotIdx + 1);
  if (!body || !providedSig || providedSig.includes(".")) {
    return null;
  }

  const key = secret ?? getSessionSecret();
  const expectedSig = crypto.createHmac("sha256", key).update(body).digest("base64url");

  const providedBuf = Buffer.from(providedSig, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as EventSessionPayload;
    if (
      !parsed ||
      typeof parsed.eventId !== "string" ||
      typeof parsed.slug !== "string" ||
      typeof parsed.attendeeId !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.isHost !== "boolean" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }

    if (parsed.slug !== expectedSlug || parsed.exp <= now) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Determines whether the incoming request uses HTTPS so cookies work over local HTTP
 * even under `npm start` (`NODE_ENV=production`) while securing real HTTPS deployments.
 */
export function isRequestSecure(req?: Request): boolean {
  if (!req) {
    return false;
  }

  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProto) {
    return forwardedProto === "https";
  }

  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function buildSessionCookieOptions(expiresAt: number, req?: Request, now = Date.now()) {
  const maxAge = Math.max(1, Math.floor((expiresAt - now) / 1000));
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: isRequestSecure(req),
    maxAge,
  };
}

function randomChars(alphabet: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return out;
}

/**
 * Generates an unguessable room slug derived from the event title plus random entropy.
 */
export function generateEventSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);

  const prefix = base || "event";
  return `${prefix}-${randomChars(SLUG_ALPHABET, 6)}`;
}

/**
 * Generates a readable 8-character host passkey formatted as `XXXX-XXXX`.
 */
export function generateHostPasskey(): string {
  return `${randomChars(PASSKEY_ALPHABET, 4)}-${randomChars(PASSKEY_ALPHABET, 4)}`;
}
