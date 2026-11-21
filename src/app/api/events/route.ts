import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attendees, events } from "@/db/schema";
import {
  buildSessionCookieOptions,
  generateEventSlug,
  generateHostPasskey,
  getCookieName,
  hashSecret,
  signEventSession,
} from "@/lib/auth";
import { computeExpiresAt } from "@/lib/expiry";
import { pickAvatarColor, toPublicEventMeta } from "@/lib/room-data";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const hostName = typeof body.hostName === "string" ? body.hostName.trim() : "";
  const tagline = typeof body.tagline === "string" ? body.tagline.trim().slice(0, 200) : "";
  const location = typeof body.location === "string" ? body.location.trim().slice(0, 120) : "";
  const startDate = typeof body.startDate === "string" ? body.startDate.trim() : "";
  const endDate = typeof body.endDate === "string" ? body.endDate.trim() : "";
  const rawPin = typeof body.pin === "string" ? body.pin.trim() : "";
  const offlinePact = typeof body.offlinePact === "boolean" ? body.offlinePact : true;
  const expiryWindowDays =
    typeof body.expiryWindowDays === "number"
      ? body.expiryWindowDays
      : Number(body.expiryWindowDays ?? 7);

  if (title.length < 2 || title.length > 100) {
    return NextResponse.json(
      { error: "Event title must be between 2 and 100 characters." },
      { status: 400 },
    );
  }

  if (hostName.length < 1 || hostName.length > 40) {
    return NextResponse.json(
      { error: "Host first name must be between 1 and 40 characters." },
      { status: 400 },
    );
  }

  if (!Number.isInteger(expiryWindowDays) || expiryWindowDays < 1 || expiryWindowDays > 30) {
    return NextResponse.json(
      { error: "Expiry window must be between 1 and 30 days after the event." },
      { status: 400 },
    );
  }

  if (rawPin && (rawPin.length < 3 || rawPin.length > 24)) {
    return NextResponse.json(
      { error: "Optional room PIN must be between 3 and 24 characters." },
      { status: 400 },
    );
  }

  let expiresAt: number;
  try {
    // Validate both dates cleanly using computeExpiresAt
    computeExpiresAt(startDate, 0);
    expiresAt = computeExpiresAt(endDate, expiryWindowDays);
  } catch {
    return NextResponse.json(
      { error: "Please provide valid YYYY-MM-DD start and end dates." },
      { status: 400 },
    );
  }

  if (endDate < startDate) {
    return NextResponse.json(
      { error: "End date must be on or after the start date." },
      { status: 400 },
    );
  }

  const db = getDb();
  let slug = generateEventSlug(title);
  for (let i = 0; i < 5; i++) {
    const existing = db.select({ id: events.id }).from(events).where(eq(events.slug, slug)).get();
    if (!existing) break;
    slug = generateEventSlug(title);
  }

  const now = Date.now();
  const eventId = `evt_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const hostAttendeeId = `att_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const hostPasskey = generateHostPasskey();

  const createdEvent = {
    id: eventId,
    slug,
    title,
    tagline,
    location,
    startDate,
    endDate,
    pinHash: rawPin ? hashSecret(rawPin) : null,
    hostKeyHash: hashSecret(hostPasskey),
    offlinePact,
    expiryWindowDays,
    expiresAt,
    isDemo: false,
    createdAt: now,
  };

  db.transaction((tx) => {
    tx.insert(events).values(createdEvent).run();
    tx.insert(attendees)
      .values({
        id: hostAttendeeId,
        eventId,
        name: hostName,
        isHost: true,
        avatarColor: pickAvatarColor(hostName),
        createdAt: now,
      })
      .run();
  });

  const token = signEventSession({
    eventId,
    slug,
    attendeeId: hostAttendeeId,
    name: hostName,
    isHost: true,
    exp: expiresAt,
  });

  const res = NextResponse.json(
    {
      slug,
      url: `/e/${slug}`,
      hostPasskey,
      event: toPublicEventMeta(createdEvent),
    },
    { status: 201 },
  );
  res.cookies.set(getCookieName(slug), token, buildSessionCookieOptions(expiresAt, req, now));
  return res;
}
