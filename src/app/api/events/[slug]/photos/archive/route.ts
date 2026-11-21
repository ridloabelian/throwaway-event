import fs from "node:fs";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { photos } from "@/db/schema";
import { requireWriteAccess } from "@/lib/api-helpers";
import { resolveSafePhotoPath } from "@/lib/paths";

export async function GET(
  req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const auth = requireWriteAccess(req, slug);
  if (!auth.ok) return auth.response;

  if (!auth.ctx.isHost) {
    return NextResponse.json(
      { error: "Only the event host can export the ZIP archive." },
      { status: 403 },
    );
  }

  const db = getDb();
  const eventPhotos = db
    .select()
    .from(photos)
    .where(eq(photos.eventId, auth.ctx.event.id))
    .orderBy(asc(photos.createdAt))
    .all();

  const zip = new JSZip();
  const manifestEntries: Array<{
    filename: string;
    uploader: string;
    caption: string;
    takenAtLabel: string;
    uploadedAt: string;
  }> = [];

  eventPhotos.forEach((photo, idx) => {
    try {
      const filePath = resolveSafePhotoPath(photo.storageKey);
      if (!fs.existsSync(filePath)) return;
      const bytes = fs.readFileSync(filePath);
      const safeName = `${String(idx + 1).padStart(2, "0")}-${photo.originalName.replace(/[^\w.-]+/g, "_")}`;
      zip.file(`photos/${safeName}`, bytes);
      manifestEntries.push({
        filename: safeName,
        uploader: photo.uploaderName,
        caption: photo.caption,
        takenAtLabel: photo.takenAtLabel,
        uploadedAt: new Date(photo.createdAt).toISOString(),
      });
    } catch {
      // Skip missing/unreadable files cleanly
    }
  });

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        event: {
          title: auth.ctx.event.title,
          slug: auth.ctx.event.slug,
          location: auth.ctx.event.location,
          startDate: auth.ctx.event.startDate,
          endDate: auth.ctx.event.endDate,
          offlinePact: auth.ctx.event.offlinePact,
          expiresAt: new Date(auth.ctx.event.expiresAt).toISOString(),
        },
        exportedAt: new Date().toISOString(),
        photoCount: manifestEntries.length,
        photos: manifestEntries,
      },
      null,
      2,
    ),
  );

  zip.file(
    "README.txt",
    [
      `${auth.ctx.event.title} (${auth.ctx.event.startDate} to ${auth.ctx.event.endDate})`,
      `Exported from throwaway-event before auto-wipe on ${new Date(auth.ctx.event.expiresAt).toUTCString()}.`,
      auth.ctx.event.offlinePact
        ? "Offline Pact Active: Please respect the group's agreement not to post these moments publicly on social feeds."
        : "Private group archive.",
      "",
      `Photos included: ${manifestEntries.length}`,
    ].join("\n"),
  );

  const archiveBuffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return new Response(Buffer.from(archiveBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${auth.ctx.event.slug}-archive.zip"`,
      "Content-Length": String(archiveBuffer.byteLength),
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
