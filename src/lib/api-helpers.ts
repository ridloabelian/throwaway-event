import { NextResponse } from "next/server";
import type { AttendeeRow, EventRow } from "@/db/schema";
import { loadEventAccess } from "./event-access";

export interface AuthorizedWriteContext {
  event: EventRow;
  attendee: AttendeeRow;
  isHost: boolean;
}

export function expiredEventResponse() {
  return NextResponse.json(
    {
      error: "This throwaway event has expired and its private room has self-destructed.",
      expired: true,
    },
    { status: 410 },
  );
}

export function notFoundEventResponse() {
  return NextResponse.json({ error: "Event room not found" }, { status: 404 });
}

/**
 * Verifies that an event exists, is active (unexpired), and the request carries
 * a valid signed event-scoped attendee cookie.
 */
export function requireWriteAccess(
  req: Request,
  slug: string,
): { ok: true; ctx: AuthorizedWriteContext } | { ok: false; response: NextResponse } {
  const access = loadEventAccess(req, slug);

  if (access.status === "not_found") {
    return { ok: false, response: notFoundEventResponse() };
  }
  if (access.status === "expired") {
    return { ok: false, response: expiredEventResponse() };
  }
  if (!access.canWriteRoom || !access.attendee) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: access.hasPin
            ? "Room PIN and your first name are required."
            : "Enter your first name to participate in this room.",
          locked: access.hasPin,
        },
        { status: 401 },
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      event: access.event,
      attendee: access.attendee,
      isHost: access.isHost,
    },
  };
}
