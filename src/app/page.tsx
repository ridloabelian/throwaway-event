import { Calendar, Camera, Flame, Lock, Receipt, Vote } from "lucide-react";
import { CreateEventForm } from "@/components/CreateEventForm";
import { DemoShowcaseCard } from "@/components/DemoShowcaseCard";
import { getDemoShowcaseSummary } from "@/lib/room-data";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const demo = getDemoShowcaseSummary();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      {/* Hero */}
      <header className="mb-10 space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#D9CEBE] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#1E4635]">
          <Flame className="h-3.5 w-3.5 text-[#C85A32]" />
          throwaway-event · Ephemeral Micro-App Platform
        </div>

        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-[#191715] sm:text-5xl">
          One secret link for the whole weekend. Wiped clean when it&apos;s over.
        </h1>

        <p className="max-w-2xl text-base leading-relaxed text-[#645C52]">
          Spin up a private throwaway room for a group trip, wedding weekend, reunion, or offsite in
          under 60 seconds. Guests drop only their first name—no passwords, no social feeds, no
          forever cloud trail.
        </p>

        <div className="grid gap-2.5 pt-2 sm:grid-cols-4">
          <div className="flex items-center gap-2.5 rounded-2xl border border-[#E4DACB] bg-white px-3.5 py-3 text-xs font-medium text-[#191715]">
            <Calendar className="h-4 w-4 shrink-0 text-[#1E4635]" />
            <span>Live Itinerary + RSVPs</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-2xl border border-[#E4DACB] bg-white px-3.5 py-3 text-xs font-medium text-[#191715]">
            <Vote className="h-4 w-4 shrink-0 text-[#C85A32]" />
            <span>Quick Group Polls</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-2xl border border-[#E4DACB] bg-white px-3.5 py-3 text-xs font-medium text-[#191715]">
            <Receipt className="h-4 w-4 shrink-0 text-[#1E4635]" />
            <span>Minimal Split-the-Tab</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-2xl border border-[#E4DACB] bg-white px-3.5 py-3 text-xs font-medium text-[#191715]">
            <Camera className="h-4 w-4 shrink-0 text-[#C85A32]" />
            <span>Disappearing Photo Wall</span>
          </div>
        </div>
      </header>

      <div className="space-y-8">
        {demo && <DemoShowcaseCard demo={demo} />}
        <CreateEventForm />
      </div>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#E4DACB] pt-6 text-xs text-[#645C52]">
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-[#1E4635]" />
          Signed event-scoped HTTP-only cookies · Local SQLite + local disk storage
        </span>
        <span>v0.1 MVP</span>
      </footer>
    </main>
  );
}
