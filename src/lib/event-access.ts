import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attendees, events, type AttendeeRow, type EventRow } from "@/db/schema";
import {
  getCookieName,
  verifyEventSession,
  type EventSessionPayload,
} from "./auth";
import { isEventExpired, wipeEventStorage } from "./expiry";

export type EventAccessResult =
  | { status: "not_found" }
  | { status: "expired"; event: EventRow }
  | {
      status: "ok";
      event: EventRow;
      attendee: AttendeeRow | null;
      session: EventSessionPayload | null;
      hasPin: boolean;
      canReadRoom: boolean;
      canWriteRoom: boolean;
      isHost: boolean;
    };

/**
 * Parses a raw HTTP `Cookie` header into a decoded key-value map.
 */
export function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) {
    return result;
  }

  for (const part of cookieHeader.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const rawVal = part.slice(eqIdx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }

  return result;
}

export function getTokenFromRequest(req: Request | undefined, slug: string): string | undefined {
  if (!req) return undefined;
  const cookies = parseCookieHeader(req.headers.get("cookie"));
  return cookies[getCookieName(slug)];
}

/**
 * Loads an event room by slug, checks expiry, and validates the event-scoped session cookie.
 */
export function loadEventAccess(
  req: Request | undefined,
  slug: string,
  options?: { cookieToken?: string; now?: number },
): EventAccessResult {
  const now = options?.now ?? Date.now();
  const db = getDb();

  const event = db.select().from(events).where(eq(events.slug, slug)).get();
  if (!event) {
    return { status: "not_found" };
  }

  if (isEventExpired(event, now)) {
    // Wipe local photo files on expired access so nothing remains accessible on disk.
    wipeEventStorage(event.id);
    return { status: "expired", event };
  }

  const token = options?.cookieToken ?? getTokenFromRequest(req, slug);
  const session = verifyEventSession(token, slug, undefined, now);

  let attendee: AttendeeRow | null = null;
  if (session && session.eventId === event.id) {
    attendee =
      db
        .select()
        .from(attendees)
        .where(and(eq(attendees.id, session.attendeeId), eq(attendees.eventId, event.id)))
        .get() ?? null;
  }

  const hasPin = Boolean(event.pinHash);
  const validSession = attendee ? session : null;
  const canReadRoom = !hasPin || Boolean(attendee);
  const canWriteRoom = Boolean(attendee);
  const isHost = Boolean(attendee?.isHost);

  return {
    status: "ok",
    event,
    attendee,
    session: validSession,
    hasPin,
    canReadRoom,
    canWriteRoom,
    isHost,
  };
}
