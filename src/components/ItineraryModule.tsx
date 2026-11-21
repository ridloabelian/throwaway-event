"use client";

import { useState } from "react";
import {
  Calendar,
  Check,
  Clock,
  ExternalLink,
  HelpCircle,
  MapPin,
  Plus,
  Trash2,
} from "lucide-react";
import type { RoomItineraryItem } from "@/lib/room-data";

interface ItineraryModuleProps {
  slug: string;
  startDate: string;
  endDate: string;
  items: RoomItineraryItem[];
  viewerId: string | null;
  isHost: boolean;
  onMutate: () => Promise<void>;
}

export function ItineraryModule({
  slug,
  startDate,
  endDate,
  items,
  viewerId,
  isHost,
  onMutate,
}: ItineraryModuleProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [dayDate, setDayDate] = useState(startDate);
  const [timeLabel, setTimeLabel] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationUrl, setLocationUrl] = useState("");
  const [description, setDescription] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groupedDays = new Map<string, RoomItineraryItem[]>();
  for (const item of items) {
    const list = groupedDays.get(item.dayDate) ?? [];
    list.push(item);
    groupedDays.set(item.dayDate, list);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusyId("create");
    try {
      const res = await fetch(`/api/events/${slug}/itinerary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          dayDate,
          timeLabel: timeLabel.trim() || "Anytime",
          locationName,
          locationUrl,
          description,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not add activity.");
        return;
      }
      setTitle("");
      setTimeLabel("");
      setLocationName("");
      setLocationUrl("");
      setDescription("");
      setShowAdd(false);
      await onMutate();
    } catch {
      setError("Network error while adding activity.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRsvp(itemId: string, nextStatus: "in" | "maybe" | "out", current: string | null) {
    if (!viewerId) return;
    setError(null);
    setBusyId(itemId);
    try {
      const status = current === nextStatus ? "clear" : nextStatus;
      const res = await fetch(`/api/events/${slug}/itinerary/${itemId}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to update RSVP.");
        return;
      }
      await onMutate();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(itemId: string) {
    setError(null);
    setBusyId(itemId);
    try {
      const res = await fetch(`/api/events/${slug}/itinerary/${itemId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to remove activity.");
        return;
      }
      await onMutate();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[#191715]">Live Itinerary</h3>
          <p className="text-xs text-[#645C52]">
            Shared timeline with map pins and one-tap &ldquo;Who&apos;s in&rdquo; RSVPs.
          </p>
        </div>

        {viewerId && (
          <button
            type="button"
            onClick={() => setShowAdd((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#1E4635] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#153326]"
          >
            <Plus className="h-3.5 w-3.5" />
            {showAdd ? "Cancel" : "Add Activity"}
          </button>
        )}
      </div>

      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="space-y-3 rounded-2xl border border-[#D9CEBE] bg-[#FAF7F2] p-4"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-[#645C52]">
                Activity Title *
              </span>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Morning Cold Plunge & Espresso"
                className="w-full rounded-xl border border-[#D9CEBE] bg-white px-3 py-2 text-sm text-[#191715] focus:border-[#1E4635] focus:outline-none"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-[#645C52]">Day *</span>
              <input
                type="date"
                required
                min={startDate}
                max={endDate}
                value={dayDate}
                onChange={(e) => setDayDate(e.target.value)}
                className="w-full rounded-xl border border-[#D9CEBE] bg-white px-3 py-2 text-sm text-[#191715] focus:border-[#1E4635] focus:outline-none"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="mb-1 block text-xs font-medium text-[#645C52]">Time Label</span>
              <input
                type="text"
                value={timeLabel}
                onChange={(e) => setTimeLabel(e.target.value)}
                placeholder="e.g. 9:00 AM"
                className="w-full rounded-xl border border-[#D9CEBE] bg-white px-3 py-2 text-sm text-[#191715] focus:border-[#1E4635] focus:outline-none"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-[#645C52]">Spot / Venue</span>
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g. Bixby Creek Overlook"
                className="w-full rounded-xl border border-[#D9CEBE] bg-white px-3 py-2 text-sm text-[#191715] focus:border-[#1E4635] focus:outline-none"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-[#645C52]">
                Map / Link URL
              </span>
              <input
                type="url"
                value={locationUrl}
                onChange={(e) => setLocationUrl(e.target.value)}
                placeholder="https://maps.google.com/..."
                className="w-full rounded-xl border border-[#D9CEBE] bg-white px-3 py-2 text-sm text-[#191715] focus:border-[#1E4635] focus:outline-none"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#645C52]">Details</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Bring layers, carpool notes, or meeting spot"
              className="w-full rounded-xl border border-[#D9CEBE] bg-white px-3 py-2 text-sm text-[#191715] focus:border-[#1E4635] focus:outline-none"
            />
          </label>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busyId === "create"}
              className="rounded-xl bg-[#1E4635] px-4 py-2 text-xs font-semibold text-white hover:bg-[#153326] disabled:opacity-60"
            >
              {busyId === "create" ? "Saving…" : "Save to Timeline"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="rounded-xl border border-[#F2C6B6] bg-[#FBEAE3] px-3 py-2 text-xs font-medium text-[#9B3614]">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D9CEBE] bg-[#FAF7F2] p-8 text-center">
          <p className="text-sm font-medium text-[#191715]">No activities pinned yet.</p>
          <p className="mt-1 text-xs text-[#645C52]">
            Add the first stop so everyone knows where and when to meet up.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(groupedDays.entries()).map(([day, dayItems]) => (
            <div key={day} className="space-y-3">
              <div className="flex items-center gap-2 border-b border-[#E4DACB] pb-1.5">
                <Calendar className="h-4 w-4 text-[#C85A32]" />
                <span className="font-mono-label text-xs font-bold uppercase tracking-wider text-[#645C52]">
                  {day}
                </span>
              </div>

              <div className="space-y-3">
                {dayItems.map((item) => {
                  const inList = item.rsvps.filter((r) => r.status === "in");
                  const maybeList = item.rsvps.filter((r) => r.status === "maybe");
                  const canDelete = Boolean(
                    viewerId && (isHost || item.createdById === viewerId),
                  );

                  return (
                    <article
                      key={item.id}
                      className="rounded-2xl border border-[#E4DACB] bg-white p-4 shadow-xs"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#F3EDE2] px-2.5 py-0.5 text-xs font-semibold text-[#191715]">
                              <Clock className="h-3 w-3 text-[#C85A32]" />
                              {item.timeLabel}
                            </span>
                            <h4 className="text-base font-bold text-[#191715]">{item.title}</h4>
                          </div>

                          {item.description && (
                            <p className="text-sm text-[#645C52]">{item.description}</p>
                          )}

                          {(item.locationName || item.locationUrl) && (
                            <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-[#1E4635]">
                              <span className="inline-flex items-center gap-1 font-medium">
                                <MapPin className="h-3.5 w-3.5" />
                                {item.locationName || "Map Pin"}
                              </span>
                              {item.locationUrl && (
                                <a
                                  href={item.locationUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 underline hover:text-[#153326]"
                                >
                                  Open Map <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={!viewerId || busyId === item.id}
                            onClick={() => void handleRsvp(item.id, "in", item.viewerStatus)}
                            className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                              item.viewerStatus === "in"
                                ? "bg-[#1E4635] text-white"
                                : "border border-[#D9CEBE] bg-[#FAF7F2] text-[#191715] hover:border-[#1E4635]"
                            } disabled:opacity-50`}
                          >
                            <Check className="h-3.5 w-3.5" />
                            I&apos;m in ({inList.length})
                          </button>

                          <button
                            type="button"
                            disabled={!viewerId || busyId === item.id}
                            onClick={() => void handleRsvp(item.id, "maybe", item.viewerStatus)}
                            className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                              item.viewerStatus === "maybe"
                                ? "bg-[#C85A32] text-white"
                                : "border border-[#D9CEBE] bg-[#FAF7F2] text-[#645C52] hover:border-[#C85A32]"
                            } disabled:opacity-50`}
                          >
                            <HelpCircle className="h-3.5 w-3.5" />
                            Maybe ({maybeList.length})
                          </button>

                          {canDelete && (
                            <button
                              type="button"
                              aria-label={`Remove ${item.title}`}
                              disabled={busyId === item.id}
                              onClick={() => void handleDelete(item.id)}
                              className="rounded-xl p-1.5 text-[#645C52] hover:bg-[#FBEAE3] hover:text-[#9B3614]"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {(inList.length > 0 || maybeList.length > 0) && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[#F1EAE0] pt-2.5">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-[#645C52]">
                            Who&apos;s in:
                          </span>
                          {inList.map((r) => (
                            <span
                              key={r.attendeeId}
                              className="rounded-full bg-[#EAF2ED] px-2.5 py-0.5 text-xs font-medium text-[#1E4635]"
                            >
                              {r.name}
                            </span>
                          ))}
                          {maybeList.map((r) => (
                            <span
                              key={r.attendeeId}
                              className="rounded-full bg-[#FBEAE3] px-2.5 py-0.5 text-xs font-medium text-[#A8431F]"
                            >
                              {r.name}?
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
