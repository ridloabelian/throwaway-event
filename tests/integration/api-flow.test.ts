import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import { events } from "@/db/schema";
import { generateScenePng } from "@/lib/demo-images";
import { purgeExpiredEvents } from "@/lib/expiry";
import { POST as createEvent } from "@/app/api/events/route";
import { GET as getRoom } from "@/app/api/events/[slug]/route";
import { POST as joinRoom } from "@/app/api/events/[slug]/join/route";
import { POST as createItinerary } from "@/app/api/events/[slug]/itinerary/route";
import { POST as rsvpItinerary } from "@/app/api/events/[slug]/itinerary/[itemId]/rsvp/route";
import { POST as createPoll } from "@/app/api/events/[slug]/polls/route";
import { POST as votePoll } from "@/app/api/events/[slug]/polls/[pollId]/vote/route";
import { POST as createExpense } from "@/app/api/events/[slug]/expenses/route";
import { POST as uploadPhoto } from "@/app/api/events/[slug]/photos/route";
import { GET as getPhoto } from "@/app/api/events/[slug]/photos/[photoId]/route";
import { GET as downloadArchive } from "@/app/api/events/[slug]/photos/archive/route";

function extractCookiePair(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("Expected Set-Cookie header");
  return setCookie.split(";")[0];
}

describe("throwaway-event API integration lifecycle", () => {
  let tempDir: string;
  let origDbPath: string | undefined;
  let origStorageDir: string | undefined;
  let origSecret: string | undefined;

  beforeEach(() => {
    closeDb();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "throwaway-api-int-"));
    origDbPath = process.env.DATABASE_PATH;
    origStorageDir = process.env.STORAGE_DIR;
    origSecret = process.env.SESSION_SECRET;

    process.env.DATABASE_PATH = path.join(tempDir, "int.db");
    process.env.STORAGE_DIR = path.join(tempDir, "uploads");
    process.env.SESSION_SECRET = "integration-test-secret-0123456789abcdef";
  });

  afterEach(() => {
    closeDb();
    if (origDbPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = origDbPath;

    if (origStorageDir === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = origStorageDir;

    if (origSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = origSecret;

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("enforces PIN gate, runs all 4 modules, exports host-only ZIP, and handles expiration", async () => {
    const startDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const endDate = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

    // 1. Host creates a PIN-protected event
    const createRes = await createEvent(
      new Request("http://localhost:3000/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Joshua Tree Stargaze",
          hostName: "Maya",
          location: "Joshua Tree, CA",
          startDate,
          endDate,
          pin: "8421",
          expiryWindowDays: 5,
          offlinePact: true,
        }),
      }),
    );

    expect(createRes.status).toBe(201);
    const hostCookie = extractCookiePair(createRes);
    const created = (await createRes.json()) as {
      slug: string;
      hostPasskey: string;
      event: { id: string; hasPin: boolean };
    };
    expect(created.event.hasPin).toBe(true);
    expect(created.hostPasskey).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const slug = created.slug;

    // 2. Unauthenticated GET returns 401 locked without leaking data
    const unauthRoomRes = await getRoom(
      new Request(`http://localhost:3000/api/events/${slug}`),
      { params: Promise.resolve({ slug }) },
    );
    expect(unauthRoomRes.status).toBe(401);
    const unauthData = (await unauthRoomRes.json()) as Record<string, unknown>;
    expect(unauthData.locked).toBe(true);
    expect(unauthData.attendees).toBeUndefined();

    // 3. Wrong PIN rejected (401)
    const wrongPinRes = await joinRoom(
      new Request(`http://localhost:3000/api/events/${slug}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alex", pin: "0000" }),
      }),
      { params: Promise.resolve({ slug }) },
    );
    expect(wrongPinRes.status).toBe(401);

    // 4. Host impersonation without host passkey rejected (409)
    const impersonateRes = await joinRoom(
      new Request(`http://localhost:3000/api/events/${slug}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "maya", pin: "8421" }),
      }),
      { params: Promise.resolve({ slug }) },
    );
    expect(impersonateRes.status).toBe(409);

    // 5. Guest joins with First Name + right PIN
    const guestJoinRes = await joinRoom(
      new Request(`http://localhost:3000/api/events/${slug}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alex", pin: "8421" }),
      }),
      { params: Promise.resolve({ slug }) },
    );
    expect(guestJoinRes.status).toBe(200);
    const guestCookie = extractCookiePair(guestJoinRes);
    const guestInfo = (await guestJoinRes.json()) as {
      attendee: { id: string };
      isHost: boolean;
    };
    expect(guestInfo.isHost).toBe(false);

    // 6. Host creates itinerary item, guest RSVPs
    const addItRes = await createItinerary(
      new Request(`http://localhost:3000/api/events/${slug}/itinerary`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: hostCookie },
        body: JSON.stringify({
          title: "Skull Rock Sunset",
          dayDate: startDate,
          timeLabel: "5:30 PM",
          locationName: "Skull Rock Trailhead",
          locationUrl: "https://maps.google.com/?q=Skull+Rock",
        }),
      }),
      { params: Promise.resolve({ slug }) },
    );
    expect(addItRes.status).toBe(201);
    const { id: itemId } = (await addItRes.json()) as { id: string };

    const rsvpRes = await rsvpItinerary(
      new Request(`http://localhost:3000/api/events/${slug}/itinerary/${itemId}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: guestCookie },
        body: JSON.stringify({ status: "in" }),
      }),
      { params: Promise.resolve({ slug, itemId }) },
    );
    expect(rsvpRes.status).toBe(200);

    // 7. Create poll and vote
    const pollRes = await createPoll(
      new Request(`http://localhost:3000/api/events/${slug}/polls`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: hostCookie },
        body: JSON.stringify({
          question: "Telescope spot?",
          options: ["Hidden Valley", "Keys View"],
        }),
      }),
      { params: Promise.resolve({ slug }) },
    );
    expect(pollRes.status).toBe(201);
    const { id: pollId } = (await pollRes.json()) as { id: string };

    // Read room as host to get attendee IDs & poll option IDs
    const hostRoomRes = await getRoom(
      new Request(`http://localhost:3000/api/events/${slug}`, {
        headers: { cookie: hostCookie },
      }),
      { params: Promise.resolve({ slug }) },
    );
    expect(hostRoomRes.status).toBe(200);
    const roomBeforeVote = (await hostRoomRes.json()) as {
      attendees: Array<{ id: string; name: string }>;
      polls: Array<{ id: string; options: Array<{ id: string; label: string }> }>;
    };
    const mayaId = roomBeforeVote.attendees.find((a) => a.name === "Maya")!.id;
    const optionId = roomBeforeVote.polls.find((p) => p.id === pollId)!.options[0].id;

    const voteRes = await votePoll(
      new Request(`http://localhost:3000/api/events/${slug}/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: guestCookie },
        body: JSON.stringify({ optionId }),
      }),
      { params: Promise.resolve({ slug, pollId }) },
    );
    expect(voteRes.status).toBe(200);

    // 8. Log shared expense ($36 paid by Maya, split evenly with Alex -> Alex pays Maya $18)
    const expRes = await createExpense(
      new Request(`http://localhost:3000/api/events/${slug}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: hostCookie },
        body: JSON.stringify({
          description: "Firewood & sparkling water",
          amountCents: 3600,
          paidById: mayaId,
          participantIds: [mayaId, guestInfo.attendee.id],
        }),
      }),
      { params: Promise.resolve({ slug }) },
    );
    expect(expRes.status).toBe(201);

    // 9. Upload photo as guest
    const pngBytes = generateScenePng(64, 64, {
      topRgb: [20, 30, 50],
      bottomRgb: [180, 90, 60],
      accentRgb: [255, 220, 140],
      sunXRatio: 0.5,
      sunYRatio: 0.5,
      horizonRatio: 0.7,
    });
    const formData = new FormData();
    formData.append(
      "file",
      new File([new Uint8Array(pngBytes)], "desert-dusk.png", { type: "image/png" }),
    );
    formData.append("caption", "Milky Way rising");

    const uploadRes = await uploadPhoto(
      new Request(`http://localhost:3000/api/events/${slug}/photos`, {
        method: "POST",
        headers: { cookie: guestCookie },
        body: formData,
      }),
      { params: Promise.resolve({ slug }) },
    );
    expect(uploadRes.status).toBe(201);
    const { id: photoId } = (await uploadRes.json()) as { id: string };

    // Photo read requires PIN cookie
    const unauthPhotoRes = await getPhoto(
      new Request(`http://localhost:3000/api/events/${slug}/photos/${photoId}`),
      { params: Promise.resolve({ slug, photoId }) },
    );
    expect(unauthPhotoRes.status).toBe(401);

    const authPhotoRes = await getPhoto(
      new Request(`http://localhost:3000/api/events/${slug}/photos/${photoId}`, {
        headers: { cookie: guestCookie },
      }),
      { params: Promise.resolve({ slug, photoId }) },
    );
    expect(authPhotoRes.status).toBe(200);
    expect(authPhotoRes.headers.get("content-type")).toBe("image/png");

    // 10. Guest blocked from ZIP export (403); Host receives valid ZIP
    const guestZipRes = await downloadArchive(
      new Request(`http://localhost:3000/api/events/${slug}/photos/archive`, {
        headers: { cookie: guestCookie },
      }),
      { params: Promise.resolve({ slug }) },
    );
    expect(guestZipRes.status).toBe(403);

    const hostZipRes = await downloadArchive(
      new Request(`http://localhost:3000/api/events/${slug}/photos/archive`, {
        headers: { cookie: hostCookie },
      }),
      { params: Promise.resolve({ slug }) },
    );
    expect(hostZipRes.status).toBe(200);
    expect(hostZipRes.headers.get("content-type")).toBe("application/zip");

    const zipBuf = await hostZipRes.arrayBuffer();
    const loadedZip = await JSZip.loadAsync(zipBuf);
    expect(Object.keys(loadedZip.files)).toContain("manifest.json");
    expect(Object.keys(loadedZip.files)).toContain("README.txt");
    expect(Object.keys(loadedZip.files)).toContain("photos/01-desert-dusk.png");

    // Verify final hydrated room settlement state
    const finalRoomRes = await getRoom(
      new Request(`http://localhost:3000/api/events/${slug}`, {
        headers: { cookie: guestCookie },
      }),
      { params: Promise.resolve({ slug }) },
    );
    const finalRoom = (await finalRoomRes.json()) as {
      expenses: { settlements: Array<{ summary: string }> };
      itinerary: Array<{ rsvps: Array<{ name: string; status: string }> }>;
      polls: Array<{ totalVotes: number }>;
    };
    expect(finalRoom.itinerary[0].rsvps).toHaveLength(2);
    expect(finalRoom.polls[0].totalVotes).toBe(1);
    expect(finalRoom.expenses.settlements[0].summary).toBe("Alex pays Maya $18");

    // 11. Simulate expiration -> 410 Gone -> purgeExpiredEvents deletes DB & disk
    const db = getDb();
    db.update(events)
      .set({ expiresAt: Date.now() - 5000 })
      .where(eq(events.slug, slug))
      .run();

    const expiredRoomRes = await getRoom(
      new Request(`http://localhost:3000/api/events/${slug}`, {
        headers: { cookie: hostCookie },
      }),
      { params: Promise.resolve({ slug }) },
    );
    expect(expiredRoomRes.status).toBe(410);

    const purgeRes = purgeExpiredEvents(Date.now());
    expect(purgeRes.purgedSlugs).toContain(slug);
  });
});
