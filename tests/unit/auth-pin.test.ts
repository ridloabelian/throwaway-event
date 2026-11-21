import { describe, expect, it } from "vitest";
import {
  generateEventSlug,
  generateHostPasskey,
  getCookieName,
  hashSecret,
  isRequestSecure,
  signEventSession,
  verifyEventSession,
  verifySecret,
} from "@/lib/auth";

const TEST_SECRET = "unit-test-hmac-secret-key-0123456789abcdef";

describe("PIN hashing and signed event-scoped session cookies", () => {
  it("hashes and verifies PINs with unique salts", () => {
    const h1 = hashSecret("4242");
    const h2 = hashSecret("4242");
    expect(h1).not.toBe(h2);
    expect(verifySecret("4242", h1)).toBe(true);
    expect(verifySecret("9999", h1)).toBe(false);
    expect(verifySecret("4242", "malformed")).toBe(false);
    expect(verifySecret("", h1)).toBe(false);
  });

  it("generates readable host passkeys and safe slugs", () => {
    const passkey = generateHostPasskey();
    expect(passkey).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const slug = generateEventSlug("Big Sur Cabin Trip!");
    expect(slug).toMatch(/^big-sur-cabin-trip-[a-z2-9]{6}$/);
    expect(getCookieName(slug)).toBe(`te_session_${slug}`);
  });

  it("verifies signed tokens and rejects tampering, cross-slug replay, and expiry", () => {
    const now = 1_700_000_000_000;
    const payload = {
      eventId: "evt_1",
      slug: "tahoe-trip-abc123",
      attendeeId: "att_1",
      name: "Sam",
      isHost: false,
      exp: now + 60_000,
    };

    const token = signEventSession(payload, TEST_SECRET);
    const verified = verifyEventSession(token, "tahoe-trip-abc123", TEST_SECRET, now);
    expect(verified).toEqual(payload);

    // Cross-event replay check
    expect(verifyEventSession(token, "other-event-xyz999", TEST_SECRET, now)).toBeNull();

    // Expired token check
    expect(verifyEventSession(token, "tahoe-trip-abc123", TEST_SECRET, now + 60_001)).toBeNull();

    // Tampered signature check
    const tamperedSig = token.slice(0, -2) + "XX";
    expect(verifyEventSession(tamperedSig, "tahoe-trip-abc123", TEST_SECRET, now)).toBeNull();

    // Tampered payload check (privilege escalation attempt)
    const [rawBody, sig] = token.split(".");
    const parsed = JSON.parse(Buffer.from(rawBody, "base64url").toString("utf8"));
    parsed.isHost = true;
    const forgedBody = Buffer.from(JSON.stringify(parsed), "utf8").toString("base64url");
    expect(verifyEventSession(`${forgedBody}.${sig}`, "tahoe-trip-abc123", TEST_SECRET, now)).toBeNull();
  });

  it("detects HTTP vs HTTPS requests accurately for localhost compatibility", () => {
    expect(isRequestSecure(new Request("http://localhost:3000/api/events"))).toBe(false);
    expect(isRequestSecure(new Request("https://events.example.com/api/events"))).toBe(true);
    expect(
      isRequestSecure(
        new Request("http://127.0.0.1:3000/api/events", {
          headers: { "x-forwarded-proto": "https" },
        }),
      ),
    ).toBe(true);
  });
});
