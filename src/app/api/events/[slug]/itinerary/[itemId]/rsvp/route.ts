import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { itineraryItems, itineraryRsvps } from "@/db/schema";
import { requireWriteAccess } from "@/lib/api-helpers";

export async function POST(
  req: Request,
  context: { params: Promise<{ slug: string; itemId: string }> },
) {
  const { slug, itemId } = await context.params;
  const auth = requireWriteAccess(req, slug);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const status = typeof body.status === "string" ? body.status : "";
  if (status !== "in" && status !== "maybe" && status !== "out" && status !== "clear") {
    return NextResponse.json(
      { error: "RSVP status must be 'in', 'maybe', 'out', or 'clear'." },
      { status: 400 },
    );
  }

  const db = getDb();
  const item = db
    .select()
    .from(itineraryItems)
    .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.eventId, auth.ctx.event.id)))
    .get();

  if (!item) {
    return NextResponse.json({ error: "Itinerary item not found" }, { status: 404 });
  }

  if (status === "clear") {
    db.delete(itineraryRsvps)
      .where(
        and(
          eq(itineraryRsvps.itemId, item.id),
          eq(itineraryRsvps.attendeeId, auth.ctx.attendee.id),
        ),
      )
      .run();
    return NextResponse.json({ ok: true, status: null });
  }

  const now = Date.now();
  db.insert(itineraryRsvps)
    .values({
      id: `rsvp_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      itemId: item.id,
      attendeeId: auth.ctx.attendee.id,
      status,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [itineraryRsvps.itemId, itineraryRsvps.attendeeId],
      set: { status, updatedAt: now },
    })
    .run();

  return NextResponse.json({ ok: true, status });
}
