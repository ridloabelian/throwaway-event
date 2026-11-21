import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { attendees, events, itineraryItems, photos } from "@/db/schema";
import { hashSecret } from "@/lib/auth";
import { computeExpiresAt, isEventExpired, purgeExpiredEvents } from "@/lib/expiry";

describe("ephemeral expiry lifecycle and disk purging", () => {
  let tempDir: string;
  let origDbPath: string | undefined;
  let origStorageDir: string | undefined;
  let origSkipSeed: string | undefined;

  beforeEach(() => {
    closeDb();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "throwaway-expiry-test-"));
    origDbPath = process.env.DATABASE_PATH;
    origStorageDir = process.env.STORAGE_DIR;
    origSkipSeed = process.env.SKIP_AUTO_SEED;

    process.env.DATABASE_PATH = path.join(tempDir, "test.db");
    process.env.STORAGE_DIR = path.join(tempDir, "uploads");
    process.env.SKIP_AUTO_SEED = "true";
  });

  afterEach(() => {
    closeDb();
    if (origDbPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = origDbPath;

    if (origStorageDir === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = origStorageDir;

    if (origSkipSeed === undefined) delete process.env.SKIP_AUTO_SEED;
    else process.env.SKIP_AUTO_SEED = origSkipSeed;

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("computes UTC end-of-day + expiry window and rejects invalid dates", () => {
    const exp = computeExpiresAt("2026-11-20", 7);
    expect(new Date(exp).toISOString()).toBe("2026-11-27T23:59:59.999Z");
    expect(isEventExpired({ expiresAt: exp }, exp - 1)).toBe(false);
    expect(isEventExpired({ expiresAt: exp }, exp)).toBe(true);

    expect(() => computeExpiresAt("2026-02-30", 7)).toThrow();
    expect(() => computeExpiresAt("not-a-date", 7)).toThrow();
  });

  it("purges expired events, cascaded child rows, local photo files, and orphan dirs while keeping active events", () => {
    const db = getDb();
    const storageDir = process.env.STORAGE_DIR!;
    const now = 1_800_000_000_000;

    // 1. Expired event
    const expiredId = "evt_expired_1";
    const expiredPhotoPath = path.join(storageDir, expiredId, "old.png");
    fs.mkdirSync(path.dirname(expiredPhotoPath), { recursive: true });
    fs.writeFileSync(expiredPhotoPath, Buffer.from("old-photo-bytes"));

    db.insert(events)
      .values({
        id: expiredId,
        slug: "expired-weekend-111111",
        title: "Expired Trip",
        tagline: "",
        location: "",
        startDate: "2026-01-01",
        endDate: "2026-01-03",
        pinHash: null,
        hostKeyHash: hashSecret("PASS-1234"),
        offlinePact: true,
        expiryWindowDays: 7,
        expiresAt: now - 10_000,
        isDemo: false,
        createdAt: now - 1_000_000,
      })
      .run();

    db.insert(attendees)
      .values({
        id: "att_exp_1",
        eventId: expiredId,
        name: "Maya",
        isHost: true,
        avatarColor: "#1E4635",
        createdAt: now - 1_000_000,
      })
      .run();

    db.insert(itineraryItems)
      .values({
        id: "it_exp_1",
        eventId: expiredId,
        dayDate: "2026-01-02",
        timeLabel: "10:00 AM",
        title: "Brunch",
        description: "",
        locationName: "",
        locationUrl: "",
        createdById: "att_exp_1",
        sortOrder: 1,
        createdAt: now - 1_000_000,
      })
      .run();

    db.insert(photos)
      .values({
        id: "ph_exp_1",
        eventId: expiredId,
        uploadedById: "att_exp_1",
        uploaderName: "Maya",
        storageKey: `${expiredId}/old.png`,
        originalName: "old.png",
        mimeType: "image/png",
        sizeBytes: 15,
        caption: "",
        takenAtLabel: "",
        createdAt: now - 900_000,
      })
      .run();

    // 2. Active event
    const activeId = "evt_active_1";
    const activePhotoPath = path.join(storageDir, activeId, "keep.png");
    fs.mkdirSync(path.dirname(activePhotoPath), { recursive: true });
    fs.writeFileSync(activePhotoPath, Buffer.from("active-photo-bytes"));

    db.insert(events)
      .values({
        id: activeId,
        slug: "active-weekend-222222",
        title: "Active Trip",
        tagline: "",
        location: "",
        startDate: "2026-12-01",
        endDate: "2026-12-03",
        pinHash: null,
        hostKeyHash: hashSecret("PASS-5678"),
        offlinePact: true,
        expiryWindowDays: 7,
        expiresAt: now + 86_400_000,
        isDemo: false,
        createdAt: now,
      })
      .run();

    // 3. Orphan folder on disk
    const orphanFile = path.join(storageDir, "evt_deleted_orphan", "ghost.png");
    fs.mkdirSync(path.dirname(orphanFile), { recursive: true });
    fs.writeFileSync(orphanFile, Buffer.from("orphan"));

    const result = purgeExpiredEvents(now);

    expect(result.purgedEventCount).toBe(1);
    expect(result.purgedSlugs).toEqual(["expired-weekend-111111"]);
    expect(result.removedPhotoFiles).toBeGreaterThanOrEqual(2);
    expect(result.freedBytes).toBeGreaterThanOrEqual(21);

    // Expired event & cascaded records gone
    expect(db.select().from(events).where(eq(events.id, expiredId)).all()).toHaveLength(0);
    expect(db.select().from(attendees).where(eq(attendees.eventId, expiredId)).all()).toHaveLength(0);
    expect(
      db.select().from(itineraryItems).where(eq(itineraryItems.eventId, expiredId)).all(),
    ).toHaveLength(0);
    expect(db.select().from(photos).where(eq(photos.eventId, expiredId)).all()).toHaveLength(0);
    expect(fs.existsSync(path.join(storageDir, expiredId))).toBe(false);
    expect(fs.existsSync(path.join(storageDir, "evt_deleted_orphan"))).toBe(false);

    // Active event & its photo preserved
    expect(db.select().from(events).where(eq(events.id, activeId)).all()).toHaveLength(1);
    expect(fs.existsSync(activePhotoPath)).toBe(true);
  });
});
