"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  Copy,
  KeyRound,
  LogOut,
  MapPin,
  Receipt,
  Users,
  Vote,
} from "lucide-react";
import type { HydratedRoomData, PublicEventMeta } from "@/lib/room-data";
import { CountdownBanner } from "./CountdownBanner";
import { ExpensesModule } from "./ExpensesModule";
import { ItineraryModule } from "./ItineraryModule";
import { JoinGate } from "./JoinGate";
import { PhotosModule } from "./PhotosModule";
import { PollsModule } from "./PollsModule";

type RoomViewState =
  | { mode: "locked"; event: PublicEventMeta }
  | { mode: "open"; room: HydratedRoomData }
  | { mode: "expired"; title: string };

type ModuleTab = "itinerary" | "polls" | "expenses" | "photos";

export function EventRoomClient({
  initialState,
  justCreated,
}: {
  initialState: RoomViewState;
  justCreated: boolean;
}) {
  const [state, setState] = useState<RoomViewState>(initialState);
  const [activeTab, setActiveTab] = useState<ModuleTab>("itinerary");
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPasskey, setCopiedPasskey] = useState(false);
  const [createdPasskey, setCreatedPasskey] = useState<string | null>(null);

  const eventMeta =
    state.mode === "open"
      ? state.room.event
      : state.mode === "locked"
        ? state.event
        : null;

  useEffect(() => {
    if (!justCreated || !eventMeta || typeof window === "undefined") return;
    const saved = window.sessionStorage.getItem(`te_host_passkey_${eventMeta.slug}`);
    if (saved) {
      setCreatedPasskey(saved);
    }
  }, [justCreated, eventMeta]);

  const refreshRoom = useCallback(async () => {
    if (!eventMeta) return;
    const res = await fetch(`/api/events/${eventMeta.slug}`, { cache: "no-store" });
    if (res.status === 410) {
      setState({ mode: "expired", title: eventMeta.title });
      return;
    }
    if (res.status === 401) {
      const data = (await res.json()) as { event?: PublicEventMeta };
      if (data.event) {
        setState({ mode: "locked", event: data.event });
      }
      return;
    }
    if (res.ok) {
      const room = (await res.json()) as HydratedRoomData;
      setState({ mode: "open", room });
    }
  }, [eventMeta]);

  async function handleLeave() {
    if (!eventMeta) return;
    await fetch(`/api/events/${eventMeta.slug}/leave`, { method: "POST" });
    await refreshRoom();
  }

  async function copyInviteLink() {
    if (!eventMeta || typeof window === "undefined") return;
    const url = `${window.location.origin}/e/${eventMeta.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Clipboard API unavailable in non-HTTPS test context; ignored cleanly
    }
  }

  async function copyPasskey() {
    if (!createdPasskey || typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(createdPasskey);
      setCopiedPasskey(true);
      setTimeout(() => setCopiedPasskey(false), 2000);
    } catch {
      // Ignored cleanly
    }
  }

  if (state.mode === "expired") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="rounded-3xl border border-[#E4DACB] bg-white p-8 shadow-sm">
          <span className="inline-block rounded-full bg-[#FBEAE3] px-3 py-1 text-xs font-semibold text-[#A8431F]">
            410 · Self-Destructed
          </span>
          <h1 className="mt-3 text-3xl font-bold text-[#191715]">
            {state.title} has expired
          </h1>
          <p className="mt-2 text-sm text-[#645C52]">
            All photos, itinerary plans, polls, and expense records for this throwaway room have been wiped.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1E4635] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#153326]"
          >
            <ArrowLeft className="h-4 w-4" />
            Spin up a new room
          </Link>
        </div>
      </main>
    );
  }

  const event = state.mode === "open" ? state.room.event : state.event;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#645C52] hover:text-[#191715]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          throwaway-event
        </Link>

        <button
          type="button"
          onClick={() => void copyInviteLink()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9CEBE] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#191715] transition hover:bg-[#FAF7F2]"
        >
          {copiedLink ? (
            <>
              <Check className="h-3.5 w-3.5 text-[#1E4635]" />
              Link Copied!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 text-[#C85A32]" />
              Copy Secret Link (/e/{event.slug})
            </>
          )}
        </button>
      </div>

      {/* Host Creation Banner with One-Time Host Passkey */}
      {createdPasskey && (
        <div className="mb-5 rounded-2xl border border-[#1E4635]/30 bg-[#EAF2ED] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#1E4635]" />
              <div>
                <p className="text-sm font-bold text-[#191715]">
                  Room ready! Save your Host Passkey before sharing the link
                </p>
                <p className="text-xs text-[#645C52]">
                  Use{" "}
                  <strong className="font-mono-label text-[#1E4635]">{createdPasskey}</strong> to
                  reclaim host ZIP export & moderation powers from another browser.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void copyPasskey()}
              className="rounded-xl bg-[#1E4635] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#153326]"
            >
              {copiedPasskey ? "Passkey Copied" : "Copy Passkey"}
            </button>
          </div>
        </div>
      )}

      {/* Event Header */}
      <header className="rounded-3xl border border-[#E4DACB] bg-white p-6 shadow-xs sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {event.isDemo && (
                <span className="rounded-full bg-[#FBEAE3] px-2.5 py-0.5 text-xs font-semibold text-[#A8431F]">
                  Demo Trip
                </span>
              )}
              {event.hasPin && (
                <span className="rounded-full bg-[#F3EDE2] px-2.5 py-0.5 text-xs font-semibold text-[#645C52]">
                  PIN Protected
                </span>
              )}
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#191715]">
              {event.title}
            </h1>
            {event.tagline && <p className="mt-1 text-sm text-[#645C52]">{event.tagline}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-medium text-[#645C52]">
              {event.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-[#C85A32]" />
                  {event.location}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-[#1E4635]" />
                {event.startDate} → {event.endDate}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <CountdownBanner expiresAt={event.expiresAt} offlinePact={event.offlinePact} />
        </div>
      </header>

      {/* Locked PIN Gate vs Open Event Room */}
      {state.mode === "locked" ? (
        <div className="mt-6">
          <JoinGate
            slug={event.slug}
            eventTitle={event.title}
            hasPin={event.hasPin}
            isDemo={event.isDemo}
            lockedMode
            onSuccess={refreshRoom}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Identity Bar or Inline Join Bar */}
          {state.room.viewer.attendee ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E4DACB] bg-white px-4 py-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: state.room.viewer.attendee.avatarColor }}
                >
                  {state.room.viewer.attendee.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="text-sm">
                  <span className="text-[#645C52]">Signed in as </span>
                  <strong className="text-[#191715]">{state.room.viewer.attendee.name}</strong>
                  {state.room.viewer.isHost && (
                    <span className="ml-2 rounded-full bg-[#EAF2ED] px-2.5 py-0.5 text-xs font-semibold text-[#1E4635]">
                      Host
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleLeave()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E4DACB] px-3 py-1.5 text-xs font-medium text-[#645C52] hover:bg-[#FAF7F2]"
              >
                <LogOut className="h-3.5 w-3.5" />
                Switch Name
              </button>
            </div>
          ) : (
            <JoinGate
              slug={event.slug}
              eventTitle={event.title}
              hasPin={event.hasPin}
              isDemo={event.isDemo}
              onSuccess={refreshRoom}
            />
          )}

          {/* Attendees Roster Strip */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#E4DACB] bg-white/80 px-4 py-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#645C52]">
              <Users className="h-3.5 w-3.5 text-[#1E4635]" />
              In the room ({state.room.attendees.length}):
            </span>
            {state.room.attendees.map((person) => (
              <span
                key={person.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF7F2] px-2.5 py-1 text-xs font-medium text-[#191715]"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: person.avatarColor }}
                />
                {person.name}
                {person.isHost ? " · Host" : ""}
              </span>
            ))}
          </div>

          {/* 4 Micro-Module Tabs */}
          <nav
            aria-label="Event room modules"
            className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
          >
            <button
              type="button"
              onClick={() => setActiveTab("itinerary")}
              className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                activeTab === "itinerary"
                  ? "bg-[#191715] text-white shadow-xs"
                  : "border border-[#E4DACB] bg-white text-[#645C52] hover:text-[#191715]"
              }`}
            >
              <Calendar className="h-4 w-4" />
              Itinerary ({state.room.itinerary.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("polls")}
              className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                activeTab === "polls"
                  ? "bg-[#191715] text-white shadow-xs"
                  : "border border-[#E4DACB] bg-white text-[#645C52] hover:text-[#191715]"
              }`}
            >
              <Vote className="h-4 w-4" />
              Quick Polls ({state.room.polls.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("expenses")}
              className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                activeTab === "expenses"
                  ? "bg-[#191715] text-white shadow-xs"
                  : "border border-[#E4DACB] bg-white text-[#645C52] hover:text-[#191715]"
              }`}
            >
              <Receipt className="h-4 w-4" />
              Split-the-Tab ({state.room.expenses.items.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("photos")}
              className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                activeTab === "photos"
                  ? "bg-[#191715] text-white shadow-xs"
                  : "border border-[#E4DACB] bg-white text-[#645C52] hover:text-[#191715]"
              }`}
            >
              <Camera className="h-4 w-4" />
              Photo Wall ({state.room.photos.length})
            </button>
          </nav>

          {/* Active Micro-Module Panel */}
          <section className="rounded-3xl border border-[#E4DACB] bg-white p-5 shadow-xs sm:p-6">
            {activeTab === "itinerary" && (
              <ItineraryModule
                slug={event.slug}
                startDate={event.startDate}
                endDate={event.endDate}
                items={state.room.itinerary}
                viewerId={state.room.viewer.attendee?.id ?? null}
                isHost={state.room.viewer.isHost}
                onMutate={refreshRoom}
              />
            )}

            {activeTab === "polls" && (
              <PollsModule
                slug={event.slug}
                polls={state.room.polls}
                viewerId={state.room.viewer.attendee?.id ?? null}
                isHost={state.room.viewer.isHost}
                onMutate={refreshRoom}
              />
            )}

            {activeTab === "expenses" && (
              <ExpensesModule
                slug={event.slug}
                attendees={state.room.attendees}
                expenses={state.room.expenses}
                viewerId={state.room.viewer.attendee?.id ?? null}
                isHost={state.room.viewer.isHost}
                onMutate={refreshRoom}
              />
            )}

            {activeTab === "photos" && (
              <PhotosModule
                slug={event.slug}
                offlinePact={event.offlinePact}
                photos={state.room.photos}
                viewerId={state.room.viewer.attendee?.id ?? null}
                isHost={state.room.viewer.isHost}
                onMutate={refreshRoom}
              />
            )}
          </section>
        </div>
      )}
    </main>
  );
}
