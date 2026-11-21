"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Lock, ShieldCheck, Sparkles } from "lucide-react";

function todayOffsetIso(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export function CreateEventForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [hostName, setHostName] = useState("");
  const [location, setLocation] = useState("");
  const [tagline, setTagline] = useState("");
  const [startDate, setStartDate] = useState(() => todayOffsetIso(1));
  const [endDate, setEndDate] = useState(() => todayOffsetIso(3));
  const [pin, setPin] = useState("");
  const [expiryWindowDays, setExpiryWindowDays] = useState(7);
  const [offlinePact, setOfflinePact] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          hostName,
          location,
          tagline,
          startDate,
          endDate,
          pin: pin.trim() || undefined,
          expiryWindowDays,
          offlinePact,
        }),
      });
      const data = (await res.json()) as {
        slug?: string;
        hostPasskey?: string;
        error?: string;
      };

      if (!res.ok || !data.slug) {
        setError(data.error ?? "Failed to create event room.");
        return;
      }

      if (data.hostPasskey && typeof window !== "undefined") {
        window.sessionStorage.setItem(`te_host_passkey_${data.slug}`, data.hostPasskey);
      }

      router.push(`/e/${data.slug}?created=1`);
    } catch {
      setError("Network error while spinning up event.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      id="spin-up"
      className="rounded-3xl border border-[#E4DACB] bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF2ED] px-3 py-1 text-xs font-semibold text-[#1E4635]">
            <Sparkles className="h-3.5 w-3.5" />
            60-Second Spin-Up
          </span>
          <h2 className="mt-2.5 text-2xl font-bold tracking-tight text-[#191715]">
            Spin up a private throwaway room
          </h2>
          <p className="mt-1 text-sm text-[#645C52]">
            Get one secret shareable link. No attendee signups, no apps to install, auto-wiped when it&apos;s over.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#645C52]">
              Event Title *
            </span>
            <input
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Lake Tahoe Cabin Reunion"
              className="w-full rounded-xl border border-[#D9CEBE] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#191715] focus:border-[#1E4635] focus:bg-white focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#645C52]">
              Your First Name (Host) *
            </span>
            <input
              type="text"
              required
              minLength={1}
              maxLength={40}
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="e.g. Sam"
              className="w-full rounded-xl border border-[#D9CEBE] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#191715] focus:border-[#1E4635] focus:bg-white focus:outline-none"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#645C52]">
              Location (Optional)
            </span>
            <input
              type="text"
              maxLength={120}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. South Lake Tahoe, CA"
              className="w-full rounded-xl border border-[#D9CEBE] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#191715] focus:border-[#1E4635] focus:bg-white focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#645C52]">
              Short Note / Vibe (Optional)
            </span>
            <input
              type="text"
              maxLength={200}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Four days of pine trees, board games & lake swims"
              className="w-full rounded-xl border border-[#D9CEBE] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#191715] focus:border-[#1E4635] focus:bg-white focus:outline-none"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#645C52]">
              <Calendar className="h-3.5 w-3.5" /> Start Date *
            </span>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-[#D9CEBE] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#191715] focus:border-[#1E4635] focus:bg-white focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#645C52]">
              <Calendar className="h-3.5 w-3.5" /> End Date *
            </span>
            <input
              type="date"
              required
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-[#D9CEBE] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#191715] focus:border-[#1E4635] focus:bg-white focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#645C52]">
              Auto-Wipe Window
            </span>
            <select
              value={expiryWindowDays}
              onChange={(e) => setExpiryWindowDays(Number(e.target.value))}
              className="w-full rounded-xl border border-[#D9CEBE] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#191715] focus:border-[#1E4635] focus:bg-white focus:outline-none"
            >
              <option value={1}>1 day after event</option>
              <option value={3}>3 days after event</option>
              <option value={7}>7 days after event</option>
              <option value={14}>14 days after event</option>
              <option value={30}>30 days after event</option>
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#645C52]">
              <Lock className="h-3.5 w-3.5" /> Optional Room PIN
            </span>
            <input
              type="text"
              maxLength={24}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Leave blank or set 3+ chars (e.g. 4242)"
              className="w-full rounded-xl border border-[#D9CEBE] bg-[#FAF7F2] px-3.5 py-2.5 text-sm text-[#191715] focus:border-[#1E4635] focus:bg-white focus:outline-none"
            />
          </label>

          <div className="flex items-end">
            <label className="flex w-full cursor-pointer items-start gap-3 rounded-xl border border-[#D9CEBE] bg-[#FAF7F2] px-3.5 py-2.5 transition hover:border-[#1E4635]">
              <input
                type="checkbox"
                checked={offlinePact}
                onChange={(e) => setOfflinePact(e.target.checked)}
                className="mt-1 h-4 w-4 accent-[#1E4635]"
              />
              <div>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-[#191715]">
                  <ShieldCheck className="h-4 w-4 text-[#1E4635]" />
                  No Social Posting / Offline Pact
                </span>
                <span className="block text-xs text-[#645C52]">
                  Displays a reminder across the room & photo wall to keep moments off feeds.
                </span>
              </div>
            </label>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-[#F2C6B6] bg-[#FBEAE3] px-4 py-2.5 text-sm font-medium text-[#9B3614]"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-xs text-[#645C52]">
            100% local SQLite + disk photo storage. Nothing leaves this server.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-[#1E4635] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#153326] disabled:opacity-60"
          >
            {submitting ? "Creating Room…" : "Create Secret Event Link"}
          </button>
        </div>
      </form>
    </section>
  );
}
