import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { itineraryItems } from "@/db/schema";
import { requireWriteAccess } from "@/lib/api-helpers";

export async function DELETE(
  req: Request,
  context: { params: Promise<{ slug: string; itemId: string }> },
) {
  const { slug, itemId } = await context.params;
  const auth = requireWriteAccess(req, slug);
  if (!auth.ok) return auth.response;

  const db = getDb();
  const item = db
    .select()
    .from(itineraryItems)
    .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.eventId, auth.ctx.event.id)))
    .get();

  if (!item) {
    return NextResponse.json({ error: "Itinerary item not found" }, { status: 404 });
  }

  if (!auth.ctx.isHost && item.createdById !== auth.ctx.attendee.id) {
    return NextResponse.json(
      { error: "Only the host or item creator can remove this activity." },
      { status: 403 },
    );
  }

  db.delete(itineraryItems).where(eq(itineraryItems.id, item.id)).run();
  return NextResponse.json({ ok: true });
}
