import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { itineraryItems, itineraryRsvps } from "@/db/schema";
import { requireWriteAccess } from "@/lib/api-helpers";
import { computeExpiresAt } from "@/lib/expiry";
import { sanitizeHttpUrl } from "@/lib/room-data";

export async function POST(
  req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const auth = requireWriteAccess(req, slug);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const dayDate =
    typeof body.dayDate === "string" && body.dayDate.trim()
      ? body.dayDate.trim()
      : auth.ctx.event.startDate;
  const timeLabel =
    typeof body.timeLabel === "string" && body.timeLabel.trim()
      ? body.timeLabel.trim().slice(0, 32)
      : "Anytime";
  const description =
    typeof body.description === "string" ? body.description.trim().slice(0, 400) : "";
  const locationName =
    typeof body.locationName === "string" ? body.locationName.trim().slice(0, 120) : "";
  const rawLocationUrl = typeof body.locationUrl === "string" ? body.locationUrl : "";

  if (title.length < 1 || title.length > 120) {
    return NextResponse.json(
      { error: "Activity title must be between 1 and 120 characters." },
      { status: 400 },
    );
  }

  try {
    computeExpiresAt(dayDate, 0);
  } catch {
    return NextResponse.json({ error: "Day date must be YYYY-MM-DD." }, { status: 400 });
  }

  let locationUrl = "";
  try {
    locationUrl = sanitizeHttpUrl(rawLocationUrl);
  } catch {
    return NextResponse.json(
      { error: "Location link must start with http:// or https://." },
      { status: 400 },
    );
  }

  const db = getDb();
  const existingCount = db
    .select({ id: itineraryItems.id })
    .from(itineraryItems)
    .where(eq(itineraryItems.eventId, auth.ctx.event.id))
    .all().length;

  const now = Date.now();
  const itemId = `it_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

  db.transaction((tx) => {
    tx.insert(itineraryItems)
      .values({
        id: itemId,
        eventId: auth.ctx.event.id,
        dayDate,
        timeLabel,
        title,
        description,
        locationName,
        locationUrl,
        createdById: auth.ctx.attendee.id,
        sortOrder: existingCount + 1,
        createdAt: now,
      })
      .run();

    tx.insert(itineraryRsvps)
      .values({
        id: `rsvp_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        itemId,
        attendeeId: auth.ctx.attendee.id,
        status: "in",
        updatedAt: now,
      })
      .run();
  });

  return NextResponse.json({ id: itemId }, { status: 201 });
}
