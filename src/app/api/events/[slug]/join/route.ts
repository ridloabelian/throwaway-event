import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attendees } from "@/db/schema";
import { expiredEventResponse, notFoundEventResponse } from "@/lib/api-helpers";
import {
  buildSessionCookieOptions,
  getCookieName,
  signEventSession,
  verifySecret,
} from "@/lib/auth";
import { loadEventAccess } from "@/lib/event-access";
import { pickAvatarColor } from "@/lib/room-data";

export async function POST(
  req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const access = loadEventAccess(req, slug);

  if (access.status === "not_found") {
    return notFoundEventResponse();
  }
  if (access.status === "expired") {
    return expiredEventResponse();
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const event = access.event;
  const db = getDb();
  const existingAttendees = db
    .select()
    .from(attendees)
    .where(eq(attendees.eventId, event.id))
    .all();

  const demoRole =
    body.demoRole === "host" || body.demoRole === "guest" ? body.demoRole : null;

  let chosenAttendee = null as (typeof existingAttendees)[number] | null;

  if (demoRole && event.isDemo) {
    chosenAttendee =
      demoRole === "host"
        ? existingAttendees.find((a) => a.isHost) ?? existingAttendees[0] ?? null
        : existingAttendees.find((a) => !a.isHost && a.name.toLowerCase() === "jordan") ??
          existingAttendees.find((a) => !a.isHost) ??
          null;

    if (!chosenAttendee) {
      return NextResponse.json({ error: "Demo attendee not available" }, { status: 404 });
    }
  } else {
    const rawHostPasskey =
      typeof body.hostPasskey === "string" ? body.hostPasskey.trim().toUpperCase() : "";
    const rawPin = typeof body.pin === "string" ? body.pin.trim() : "";
    const rawName = typeof body.name === "string" ? body.name.trim() : "";

    if (rawHostPasskey) {
      if (!verifySecret(rawHostPasskey, event.hostKeyHash)) {
        return NextResponse.json({ error: "Invalid host passkey." }, { status: 401 });
      }

      chosenAttendee = existingAttendees.find((a) => a.isHost) ?? null;
      if (!chosenAttendee) {
        const hostName = rawName || "Host";
        const newHost = {
          id: `att_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
          eventId: event.id,
          name: hostName,
          isHost: true,
          avatarColor: pickAvatarColor(hostName),
          createdAt: Date.now(),
        };
        db.insert(attendees).values(newHost).run();
        chosenAttendee = newHost;
      }
    } else {
      if (rawName.length < 1 || rawName.length > 40) {
        return NextResponse.json(
          { error: "Please enter your first name (1 to 40 characters)." },
          { status: 400 },
        );
      }

      if (event.pinHash && !verifySecret(rawPin, event.pinHash)) {
        return NextResponse.json(
          { error: "Incorrect room PIN. Check with your event host." },
          { status: 401 },
        );
      }

      const lowerName = rawName.toLowerCase();
      const matched = existingAttendees.find((a) => a.name.toLowerCase() === lowerName);

      if (matched) {
        if (matched.isHost) {
          return NextResponse.json(
            {
              error:
                "That name belongs to the event host. Enter the Host Passkey to claim host access, or add your last initial.",
            },
            { status: 409 },
          );
        }
        chosenAttendee = matched;
      } else {
        const newGuest = {
          id: `att_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
          eventId: event.id,
          name: rawName,
          isHost: false,
          avatarColor: pickAvatarColor(rawName),
          createdAt: Date.now(),
        };
        db.insert(attendees).values(newGuest).run();
        chosenAttendee = newGuest;
      }
    }
  }

  const now = Date.now();
  const token = signEventSession({
    eventId: event.id,
    slug: event.slug,
    attendeeId: chosenAttendee.id,
    name: chosenAttendee.name,
    isHost: chosenAttendee.isHost,
    exp: event.expiresAt,
  });

  const res = NextResponse.json({
    attendee: {
      id: chosenAttendee.id,
      name: chosenAttendee.name,
      isHost: chosenAttendee.isHost,
      avatarColor: chosenAttendee.avatarColor,
    },
    isHost: chosenAttendee.isHost,
  });

  res.cookies.set(
    getCookieName(event.slug),
    token,
    buildSessionCookieOptions(event.expiresAt, req, now),
  );
  return res;
}
