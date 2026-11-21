import fs from "node:fs";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { photos } from "@/db/schema";
import {
  expiredEventResponse,
  notFoundEventResponse,
  requireWriteAccess,
} from "@/lib/api-helpers";
import { loadEventAccess } from "@/lib/event-access";
import { resolveSafePhotoPath } from "@/lib/paths";

export async function GET(
  req: Request,
  context: { params: Promise<{ slug: string; photoId: string }> },
) {
  const { slug, photoId } = await context.params;
  const access = loadEventAccess(req, slug);

  if (access.status === "not_found") {
    return notFoundEventResponse();
  }
  if (access.status === "expired") {
    return expiredEventResponse();
  }
  if (!access.canReadRoom) {
    return NextResponse.json(
      { error: "Unlock the room with its PIN to view private photos." },
      { status: 401 },
    );
  }

  const db = getDb();
  const photo = db
    .select()
    .from(photos)
    .where(and(eq(photos.id, photoId), eq(photos.eventId, access.event.id)))
    .get();

  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  let filePath: string;
  try {
    filePath = resolveSafePhotoPath(photo.storageKey);
  } catch {
    return NextResponse.json({ error: "Invalid photo path" }, { status: 404 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Photo file no longer exists" }, { status: 404 });
  }

  const data = fs.readFileSync(filePath);
  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(data.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ slug: string; photoId: string }> },
) {
  const { slug, photoId } = await context.params;
  const auth = requireWriteAccess(req, slug);
  if (!auth.ok) return auth.response;

  const db = getDb();
  const photo = db
    .select()
    .from(photos)
    .where(and(eq(photos.id, photoId), eq(photos.eventId, auth.ctx.event.id)))
    .get();

  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  if (!auth.ctx.isHost && photo.uploadedById !== auth.ctx.attendee.id) {
    return NextResponse.json(
      { error: "Only the host or the uploader can remove this photo." },
      { status: 403 },
    );
  }

  try {
    const filePath = resolveSafePhotoPath(photo.storageKey);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Continue removing DB metadata even if disk file was already deleted
  }

  db.delete(photos).where(eq(photos.id, photo.id)).run();
  return NextResponse.json({ ok: true });
}
