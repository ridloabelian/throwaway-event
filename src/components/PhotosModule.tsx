"use client";

import { useRef, useState } from "react";
import { Camera, Download, ShieldOff, Trash2, Upload, X } from "lucide-react";
import type { RoomPhoto } from "@/lib/room-data";

interface PhotosModuleProps {
  slug: string;
  offlinePact: boolean;
  photos: RoomPhoto[];
  viewerId: string | null;
  isHost: boolean;
  onMutate: () => Promise<void>;
}

export function PhotosModule({
  slug,
  offlinePact,
  photos,
  viewerId,
  isHost,
  onMutate,
}: PhotosModuleProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [takenAtLabel, setTakenAtLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<RoomPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      setError("Choose a photo from your device first.");
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("caption", caption.trim());
      formData.append("takenAtLabel", takenAtLabel.trim());

      const res = await fetch(`/api/events/${slug}/photos`, {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Photo upload failed.");
        return;
      }

      setSelectedFile(null);
      setCaption("");
      setTakenAtLabel("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await onMutate();
    } catch {
      setError("Network error while uploading photo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(photoId: string) {
    setError(null);
    setBusyId(photoId);
    try {
      const res = await fetch(`/api/events/${slug}/photos/${photoId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (lightboxPhoto?.id === photoId) setLightboxPhoto(null);
        await onMutate();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Cameras Down / Private Room Manifesto + Host ZIP Export */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#D9CEBE] bg-[#FBEAE3]/70 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C85A32] text-white">
            <ShieldOff className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-bold text-[#191715]">
              Cameras Down / Private Room Photo Wall
            </h3>
            <p className="mt-0.5 text-xs text-[#645C52]">
              {offlinePact
                ? "Offline Pact active: keep phones away in the moment, drop candid shots here later, and never repost to public feeds."
                : "Stored strictly locally on this server and wiped automatically when the countdown hits zero."}
            </p>
          </div>
        </div>

        {isHost && photos.length > 0 && (
          <a
            href={`/api/events/${slug}/photos/archive`}
            download={`${slug}-archive.zip`}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1E4635] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#153326]"
          >
            <Download className="h-4 w-4" />
            Download All (.zip)
          </a>
        )}
      </div>

      {viewerId && (
        <form
          onSubmit={handleUpload}
          className="space-y-3 rounded-2xl border border-[#D9CEBE] bg-white p-4"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#645C52]">
                Choose Photo *
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className="block w-full rounded-xl border border-[#D9CEBE] bg-[#FAF7F2] px-3 py-1.5 text-xs text-[#191715] file:mr-2.5 file:rounded-lg file:border-0 file:bg-[#1E4635] file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-white"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#645C52]">
                Caption (Optional)
              </span>
              <input
                type="text"
                maxLength={240}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="e.g. Campfire story hour"
                className="w-full rounded-xl border border-[#D9CEBE] bg-[#FAF7F2] px-3 py-2 text-sm text-[#191715] focus:border-[#1E4635] focus:bg-white focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#645C52]">
                Moment Tag (Optional)
              </span>
              <input
                type="text"
                maxLength={48}
                value={takenAtLabel}
                onChange={(e) => setTakenAtLabel(e.target.value)}
                placeholder="e.g. Sat · Sunset"
                className="w-full rounded-xl border border-[#D9CEBE] bg-[#FAF7F2] px-3 py-2 text-sm text-[#191715] focus:border-[#1E4635] focus:bg-white focus:outline-none"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-[#645C52]">
              JPEG, PNG, WebP, GIF, or AVIF up to 15 MB. Saved locally until room wipe.
            </span>
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#C85A32] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#AE4B27] disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? "Uploading…" : "Drop Moment"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="rounded-xl border border-[#F2C6B6] bg-[#FBEAE3] px-3 py-2 text-xs font-medium text-[#9B3614]">
          {error}
        </p>
      )}

      {photos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D9CEBE] bg-[#FAF7F2] p-10 text-center">
          <Camera className="mx-auto h-7 w-7 text-[#645C52]" />
          <p className="mt-2 text-sm font-medium text-[#191715]">No moments dropped yet.</p>
          <p className="mt-1 text-xs text-[#645C52]">
            Upload candid weekend shots here — the host can grab a clean ZIP before expiry.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => {
            const canDelete = Boolean(
              viewerId && (isHost || photo.uploadedById === viewerId),
            );
            return (
              <figure
                key={photo.id}
                className="group overflow-hidden rounded-2xl border border-[#E4DACB] bg-white p-3 shadow-xs transition hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => setLightboxPhoto(photo)}
                  className="block w-full overflow-hidden rounded-xl bg-[#F3EDE2]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.caption || photo.originalName}
                    className="h-52 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                </button>

                <figcaption className="mt-3 space-y-1.5 px-0.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-[#645C52]">
                    <span>
                      by <strong className="text-[#191715]">{photo.uploaderName}</strong>
                      {photo.takenAtLabel ? ` · ${photo.takenAtLabel}` : ""}
                    </span>
                    {canDelete && (
                      <button
                        type="button"
                        aria-label={`Delete photo ${photo.originalName}`}
                        disabled={busyId === photo.id}
                        onClick={() => void handleDelete(photo.id)}
                        className="rounded-lg p-1 text-[#645C52] hover:bg-[#FBEAE3] hover:text-[#9B3614]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {photo.caption && (
                    <p className="text-sm font-medium text-[#191715]">{photo.caption}</p>
                  )}
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}

      {lightboxPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="max-w-3xl overflow-hidden rounded-2xl bg-white p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-[#645C52]">
                {lightboxPhoto.uploaderName}
                {lightboxPhoto.takenAtLabel ? ` · ${lightboxPhoto.takenAtLabel}` : ""}
              </span>
              <button
                type="button"
                aria-label="Close photo preview"
                onClick={() => setLightboxPhoto(null)}
                className="rounded-lg p-1 text-[#645C52] hover:bg-[#FAF7F2]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxPhoto.url}
              alt={lightboxPhoto.caption || lightboxPhoto.originalName}
              className="max-h-[75vh] w-full rounded-xl object-contain"
            />
            {lightboxPhoto.caption && (
              <p className="mt-2.5 px-1 text-sm font-medium text-[#191715]">
                {lightboxPhoto.caption}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
