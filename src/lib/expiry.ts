import fs from "node:fs";
import path from "node:path";
import { eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { events, photos } from "@/db/schema";
import { getStorageDir, resolveSafePhotoPath } from "./paths";

const DAY_MS = 86_400_000;

/**
 * Computes the exact UTC expiration epoch timestamp (`endDate` 23:59:59.999Z + `expiryWindowDays`).
 */
export function computeExpiresAt(endDate: string, expiryWindowDays: number): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error(`Invalid endDate format: ${endDate}`);
  }
  if (!Number.isInteger(expiryWindowDays) || expiryWindowDays < 0 || expiryWindowDays > 365) {
    throw new Error(`Invalid expiryWindowDays: ${expiryWindowDays}`);
  }

  const [year, month, day] = endDate.split("-").map(Number);
  const parsed = new Date(`${endDate}T23:59:59.999Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${endDate}`);
  }

  return parsed.getTime() + expiryWindowDays * DAY_MS;
}

/**
 * Returns true once the event's expiration timestamp has elapsed.
 */
export function isEventExpired(event: { expiresAt: number }, now = Date.now()): boolean {
  return event.expiresAt <= now;
}

export interface PurgeResult {
  purgedEventCount: number;
  purgedSlugs: string[];
  removedPhotoFiles: number;
  freedBytes: number;
}

/**
 * Deletes local photo files for a single event directory without deleting the event row itself.
 */
export function wipeEventStorage(eventId: string): { removedFiles: number; freedBytes: number } {
  const eventDir = path.join(getStorageDir(), eventId);
  if (!fs.existsSync(eventDir)) {
    return { removedFiles: 0, freedBytes: 0 };
  }

  let removedFiles = 0;
  let freedBytes = 0;

  try {
    const entries = fs.readdirSync(eventDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        try {
          const stat = fs.statSync(path.join(eventDir, entry.name));
          freedBytes += stat.size;
        } catch {
          // Ignore stat failures during cleanup
        }
        removedFiles += 1;
      }
    }
    fs.rmSync(eventDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }

  return { removedFiles, freedBytes };
}

/**
 * Purges all expired events from SQLite (cascading all child rows) and removes their local
 * photo files as well as any orphaned upload directories on disk.
 */
export function purgeExpiredEvents(now = Date.now()): PurgeResult {
  const db = getDb();
  const expiredEvents = db
    .select()
    .from(events)
    .where(lte(events.expiresAt, now))
    .all();

  let removedPhotoFiles = 0;
  let freedBytes = 0;
  const purgedSlugs: string[] = [];

  for (const ev of expiredEvents) {
    const eventPhotos = db
      .select()
      .from(photos)
      .where(eq(photos.eventId, ev.id))
      .all();

    for (const photo of eventPhotos) {
      try {
        const photoPath = resolveSafePhotoPath(photo.storageKey);
        if (fs.existsSync(photoPath)) {
          const stat = fs.statSync(photoPath);
          freedBytes += stat.size;
          fs.unlinkSync(photoPath);
          removedPhotoFiles += 1;
        }
      } catch {
        // Ignore individual file errors and continue cleaning directory
      }
    }

    const dirCleanup = wipeEventStorage(ev.id);
    removedPhotoFiles += dirCleanup.removedFiles;
    freedBytes += dirCleanup.freedBytes;

    db.delete(events).where(eq(events.id, ev.id)).run();
    purgedSlugs.push(ev.slug);
  }

  // Clean up any orphaned directories under storageDir that no longer have a live event row.
  const storageDir = getStorageDir();
  if (fs.existsSync(storageDir)) {
    const liveIds = new Set(
      db
        .select({ id: events.id })
        .from(events)
        .all()
        .map((row) => row.id),
    );

    for (const entry of fs.readdirSync(storageDir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory() && !liveIds.has(entry.name)) {
        const orphanCleanup = wipeEventStorage(entry.name);
        removedPhotoFiles += orphanCleanup.removedFiles;
        freedBytes += orphanCleanup.freedBytes;
      }
    }
  }

  return {
    purgedEventCount: expiredEvents.length,
    purgedSlugs,
    removedPhotoFiles,
    freedBytes,
  };
}
