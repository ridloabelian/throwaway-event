import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { photos } from "@/db/schema";
import { requireWriteAccess } from "@/lib/api-helpers";
import { resolveSafePhotoPath } from "@/lib/paths";

const ALLOWED_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export async function POST(
  req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const auth = requireWriteAccess(req, slug);
  if (!auth.ok) return auth.response;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an image file to upload." }, { status: 400 });
  }

  const mimeType = file.type.toLowerCase();
  const ext = ALLOWED_MIME_EXTENSIONS[mimeType];
  if (!ext) {
    return NextResponse.json(
      { error: "Supported photo formats: JPEG, PNG, WebP, GIF, and AVIF." },
      { status: 400 },
    );
  }

  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      { error: "Photo file must be between 1 byte and 15 MB." },
      { status: 400 },
    );
  }

  const rawCaption = formData.get("caption");
  const rawTakenAt = formData.get("takenAtLabel");
  const caption = typeof rawCaption === "string" ? rawCaption.trim().slice(0, 240) : "";
  const takenAtLabel =
    typeof rawTakenAt === "string" ? rawTakenAt.trim().slice(0, 48) : "";

  const photoId = `ph_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const storageKey = path.posix.join(auth.ctx.event.id, `${photoId}.${ext}`);
  const destPath = resolveSafePhotoPath(storageKey);

  const bytes = Buffer.from(await file.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, bytes);

  const originalName = (file.name || `moment.${ext}`).replace(/[^\w.-]+/g, "_").slice(0, 100);
  const now = Date.now();

  getDb()
    .insert(photos)
    .values({
      id: photoId,
      eventId: auth.ctx.event.id,
      uploadedById: auth.ctx.attendee.id,
      uploaderName: auth.ctx.attendee.name,
      storageKey,
      originalName,
      mimeType,
      sizeBytes: bytes.byteLength,
      caption,
      takenAtLabel,
      createdAt: now,
    })
    .run();

  return NextResponse.json(
    {
      id: photoId,
      url: `/api/events/${auth.ctx.event.slug}/photos/${photoId}`,
    },
    { status: 201 },
  );
}
