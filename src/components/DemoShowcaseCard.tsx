"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  Camera,
  MapPin,
  Receipt,
  Users,
  Vote,
} from "lucide-react";
import type { DemoShowcaseSummary } from "@/lib/room-data";
import { CountdownBanner } from "./CountdownBanner";

export function DemoShowcaseCard({ demo }: { demo: DemoShowcaseSummary }) {
  const router = useRouter();
  const [entering, setEntering] = useState(false);

  async function enterAsDemoHost() {
    setEntering(true);
    try {
      await fetch(`/api/events/${demo.slug}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demoRole: "host" }),
      });
      router.push(`/e/${demo.slug}`);
    } finally {
      setEntering(false);
    }
  }

  return (
    <section className="rounded-3xl border border-[#D9CEBE] bg-white p-6 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FBEAE3] px-3 py-1 text-xs font-semibold text-[#A8431F]">
          Live Pre-Seeded Demo Trip
        </span>
        <span className="font-mono-label text-xs text-[#645C52]">/e/{demo.slug}</span>
      </div>

      <div className="mt-3">
        <h2 className="text-2xl font-bold tracking-tight text-[#191715]">
          {demo.title}
        </h2>
        <p className="mt-1 text-sm text-[#645C52]">{demo.tagline}</p>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-medium text-[#645C52]">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-[#C85A32]" />
            {demo.location}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-[#1E4635]" />
            {demo.startDate} → {demo.endDate}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5 text-[#1E4635]" />
            {demo.attendeeCount} attendees
          </span>
        </div>
      </div>

      <div className="mt-4">
        <CountdownBanner expiresAt={demo.expiresAt} offlinePact={demo.offlinePact} compact />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl bg-[#FAF7F2] px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs text-[#645C52]">
            <Calendar className="h-3.5 w-3.5 text-[#1E4635]" /> Itinerary
          </div>
          <div className="mt-1 text-lg font-bold text-[#191715]">{demo.itineraryCount} stops</div>
        </div>
        <div className="rounded-xl bg-[#FAF7F2] px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs text-[#645C52]">
            <Vote className="h-3.5 w-3.5 text-[#C85A32]" /> Polls
          </div>
          <div className="mt-1 text-lg font-bold text-[#191715]">{demo.pollCount} active</div>
        </div>
        <div className="rounded-xl bg-[#FAF7F2] px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs text-[#645C52]">
            <Receipt className="h-3.5 w-3.5 text-[#1E4635]" /> Split Tab
          </div>
          <div className="mt-1 text-lg font-bold text-[#191715]">{demo.expenseCount} bills</div>
        </div>
        <div className="rounded-xl bg-[#FAF7F2] px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs text-[#645C52]">
            <Camera className="h-3.5 w-3.5 text-[#C85A32]" /> Photo Wall
          </div>
          <div className="mt-1 text-lg font-bold text-[#191715]">{demo.photoCount} moments</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          href={`/e/${demo.slug}`}
          className="inline-flex items-center gap-2 rounded-xl bg-[#191715] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#312D29]"
        >
          Open Demo Room
          <ArrowRight className="h-4 w-4" />
        </Link>
        <button
          type="button"
          disabled={entering}
          onClick={() => void enterAsDemoHost()}
          className="inline-flex items-center gap-2 rounded-xl border border-[#1E4635] bg-[#EAF2ED] px-4 py-2.5 text-sm font-semibold text-[#1E4635] transition hover:bg-[#DCE9E1] disabled:opacity-60"
        >
          {entering ? "Joining…" : "1-Click Enter as Host (Maya)"}
        </button>
      </div>
    </section>
  );
}
