import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  attendees,
  events,
  expenseParticipants,
  expenses,
  itineraryItems,
  itineraryRsvps,
  photos,
  pollOptions,
  polls,
  pollVotes,
  type AttendeeRow,
  type EventRow,
} from "@/db/schema";
import { isEventExpired } from "./expiry";
import { DEMO_SLUG } from "./seed";
import {
  computeMinimalSettlements,
  computeNetBalances,
  type NetBalance,
  type SettlementTransfer,
} from "./settlement";

const AVATAR_COLORS = [
  "#1E4635",
  "#C85A32",
  "#3B6B8C",
  "#7B538C",
  "#9C6B28",
  "#4D6D49",
  "#9A3F4B",
  "#2F6A62",
];

export function pickAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function sanitizeHttpUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must use http:// or https://");
  }
  return parsed.toString();
}

export interface PublicEventMeta {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  location: string;
  startDate: string;
  endDate: string;
  offlinePact: boolean;
  expiryWindowDays: number;
  expiresAt: number;
  isDemo: boolean;
  hasPin: boolean;
  createdAt: number;
}

export interface RoomRsvpMember {
  attendeeId: string;
  name: string;
  status: "in" | "maybe" | "out";
}

export interface RoomItineraryItem {
  id: string;
  dayDate: string;
  timeLabel: string;
  title: string;
  description: string;
  locationName: string;
  locationUrl: string;
  createdById: string | null;
  sortOrder: number;
  rsvps: RoomRsvpMember[];
  viewerStatus: "in" | "maybe" | "out" | null;
}

export interface RoomPollOption {
  id: string;
  label: string;
  note: string;
  voteCount: number;
  percentage: number;
  voters: Array<{ attendeeId: string; name: string }>;
  viewerVoted: boolean;
}

export interface RoomPoll {
  id: string;
  question: string;
  allowMultiple: boolean;
  isClosed: boolean;
  createdById: string | null;
  createdAt: number;
  totalVotes: number;
  uniqueVoters: number;
  options: RoomPollOption[];
}

export interface RoomExpense {
  id: string;
  description: string;
  amountCents: number;
  paidById: string;
  paidByName: string;
  category: string;
  createdAt: number;
  participants: Array<{
    attendeeId: string;
    name: string;
    shareCents: number;
  }>;
}

export interface RoomPhoto {
  id: string;
  uploaderName: string;
  uploadedById: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string;
  takenAtLabel: string;
  createdAt: number;
  url: string;
}

export interface HydratedRoomData {
  event: PublicEventMeta;
  viewer: {
    attendee: {
      id: string;
      name: string;
      isHost: boolean;
      avatarColor: string;
    } | null;
    isHost: boolean;
  };
  attendees: Array<{
    id: string;
    name: string;
    isHost: boolean;
    avatarColor: string;
    createdAt: number;
  }>;
  itinerary: RoomItineraryItem[];
  polls: RoomPoll[];
  expenses: {
    items: RoomExpense[];
    totalSpentCents: number;
    netBalances: NetBalance[];
    settlements: SettlementTransfer[];
  };
  photos: RoomPhoto[];
}

export function toPublicEventMeta(event: EventRow): PublicEventMeta {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    tagline: event.tagline,
    location: event.location,
    startDate: event.startDate,
    endDate: event.endDate,
    offlinePact: event.offlinePact,
    expiryWindowDays: event.expiryWindowDays,
    expiresAt: event.expiresAt,
    isDemo: event.isDemo,
    hasPin: Boolean(event.pinHash),
    createdAt: event.createdAt,
  };
}

export function getHydratedRoomData(
  event: EventRow,
  viewerAttendee: AttendeeRow | null,
): HydratedRoomData {
  const db = getDb();

  const attendeeRows = db
    .select()
    .from(attendees)
    .where(eq(attendees.eventId, event.id))
    .orderBy(desc(attendees.isHost), asc(attendees.createdAt))
    .all();

  const attendeeById = new Map(attendeeRows.map((a) => [a.id, a]));

  const itemRows = db
    .select()
    .from(itineraryItems)
    .where(eq(itineraryItems.eventId, event.id))
    .orderBy(
      asc(itineraryItems.dayDate),
      asc(itineraryItems.sortOrder),
      asc(itineraryItems.createdAt),
    )
    .all();

  const allRsvps = db.select().from(itineraryRsvps).all();
  const itemIds = new Set(itemRows.map((i) => i.id));
  const rsvpsByItem = new Map<string, RoomRsvpMember[]>();

  for (const rsvp of allRsvps) {
    if (!itemIds.has(rsvp.itemId)) continue;
    const person = attendeeById.get(rsvp.attendeeId);
    if (!person) continue;
    const list = rsvpsByItem.get(rsvp.itemId) ?? [];
    list.push({
      attendeeId: person.id,
      name: person.name,
      status: (rsvp.status as "in" | "maybe" | "out") || "in",
    });
    rsvpsByItem.set(rsvp.itemId, list);
  }

  const itinerary: RoomItineraryItem[] = itemRows.map((item) => {
    const rsvps = rsvpsByItem.get(item.id) ?? [];
    const viewerRsvp = viewerAttendee
      ? rsvps.find((r) => r.attendeeId === viewerAttendee.id)?.status ?? null
      : null;
    return {
      id: item.id,
      dayDate: item.dayDate,
      timeLabel: item.timeLabel,
      title: item.title,
      description: item.description,
      locationName: item.locationName,
      locationUrl: item.locationUrl,
      createdById: item.createdById,
      sortOrder: item.sortOrder,
      rsvps,
      viewerStatus: viewerRsvp,
    };
  });

  // Polls
  const pollRows = db
    .select()
    .from(polls)
    .where(eq(polls.eventId, event.id))
    .orderBy(desc(polls.createdAt))
    .all();
  const pollIds = new Set(pollRows.map((p) => p.id));

  const optionRows = db
    .select()
    .from(pollOptions)
    .orderBy(asc(pollOptions.sortOrder))
    .all()
    .filter((o) => pollIds.has(o.pollId));

  const voteRows = db
    .select()
    .from(pollVotes)
    .all()
    .filter((v) => pollIds.has(v.pollId));

  const hydratedPolls: RoomPoll[] = pollRows.map((poll) => {
    const opts = optionRows.filter((o) => o.pollId === poll.id);
    const votes = voteRows.filter((v) => v.pollId === poll.id);
    const totalVotes = votes.length;
    const uniqueVoters = new Set(votes.map((v) => v.attendeeId)).size;

    const options: RoomPollOption[] = opts.map((opt) => {
      const optVotes = votes.filter((v) => v.optionId === opt.id);
      const voters = optVotes
        .map((v) => attendeeById.get(v.attendeeId))
        .filter((a): a is AttendeeRow => Boolean(a))
        .map((a) => ({ attendeeId: a.id, name: a.name }));

      const percentage =
        totalVotes > 0 ? Math.round((optVotes.length / totalVotes) * 100) : 0;

      return {
        id: opt.id,
        label: opt.label,
        note: opt.note,
        voteCount: optVotes.length,
        percentage,
        voters,
        viewerVoted: Boolean(
          viewerAttendee && optVotes.some((v) => v.attendeeId === viewerAttendee.id),
        ),
      };
    });

    return {
      id: poll.id,
      question: poll.question,
      allowMultiple: poll.allowMultiple,
      isClosed: poll.isClosed,
      createdById: poll.createdById,
      createdAt: poll.createdAt,
      totalVotes,
      uniqueVoters,
      options,
    };
  });

  // Expenses & Settlement
  const expenseRows = db
    .select()
    .from(expenses)
    .where(eq(expenses.eventId, event.id))
    .orderBy(desc(expenses.createdAt))
    .all();

  const expenseIds = new Set(expenseRows.map((e) => e.id));
  const participantRows = db
    .select()
    .from(expenseParticipants)
    .all()
    .filter((p) => expenseIds.has(p.expenseId));

  const settlementInputs = expenseRows.map((exp) => ({
    paidById: exp.paidById,
    amountCents: exp.amountCents,
    shares: participantRows
      .filter((p) => p.expenseId === exp.id)
      .map((p) => ({ attendeeId: p.attendeeId, shareCents: p.shareCents })),
  }));

  const attendeeRefs = attendeeRows.map((a) => ({ id: a.id, name: a.name }));
  const netBalances = computeNetBalances(settlementInputs, attendeeRefs);
  const settlements = computeMinimalSettlements(settlementInputs, attendeeRefs);
  const totalSpentCents = expenseRows.reduce((sum, e) => sum + e.amountCents, 0);

  const hydratedExpenses: RoomExpense[] = expenseRows.map((exp) => {
    const paidBy = attendeeById.get(exp.paidById);
    const parts = participantRows
      .filter((p) => p.expenseId === exp.id)
      .map((p) => ({
        attendeeId: p.attendeeId,
        name: attendeeById.get(p.attendeeId)?.name ?? "Guest",
        shareCents: p.shareCents,
      }));
    return {
      id: exp.id,
      description: exp.description,
      amountCents: exp.amountCents,
      paidById: exp.paidById,
      paidByName: paidBy?.name ?? "Guest",
      category: exp.category,
      createdAt: exp.createdAt,
      participants: parts,
    };
  });

  // Photos
  const photoRows = db
    .select()
    .from(photos)
    .where(eq(photos.eventId, event.id))
    .orderBy(desc(photos.createdAt))
    .all();

  const hydratedPhotos: RoomPhoto[] = photoRows.map((p) => ({
    id: p.id,
    uploaderName: p.uploaderName,
    uploadedById: p.uploadedById,
    originalName: p.originalName,
    mimeType: p.mimeType,
    sizeBytes: p.sizeBytes,
    caption: p.caption,
    takenAtLabel: p.takenAtLabel,
    createdAt: p.createdAt,
    url: `/api/events/${event.slug}/photos/${p.id}`,
  }));

  return {
    event: toPublicEventMeta(event),
    viewer: {
      attendee: viewerAttendee
        ? {
            id: viewerAttendee.id,
            name: viewerAttendee.name,
            isHost: viewerAttendee.isHost,
            avatarColor: viewerAttendee.avatarColor,
          }
        : null,
      isHost: Boolean(viewerAttendee?.isHost),
    },
    attendees: attendeeRows.map((a) => ({
      id: a.id,
      name: a.name,
      isHost: a.isHost,
      avatarColor: a.avatarColor,
      createdAt: a.createdAt,
    })),
    itinerary,
    polls: hydratedPolls,
    expenses: {
      items: hydratedExpenses,
      totalSpentCents,
      netBalances,
      settlements,
    },
    photos: hydratedPhotos,
  };
}

export interface DemoShowcaseSummary {
  slug: string;
  title: string;
  tagline: string;
  location: string;
  startDate: string;
  endDate: string;
  expiresAt: number;
  offlinePact: boolean;
  attendeeCount: number;
  itineraryCount: number;
  pollCount: number;
  expenseCount: number;
  photoCount: number;
}

export function getDemoShowcaseSummary(now = Date.now()): DemoShowcaseSummary | null {
  const db = getDb();
  const demo = db.select().from(events).where(eq(events.slug, DEMO_SLUG)).get();
  if (!demo || isEventExpired(demo, now)) {
    return null;
  }

  return {
    slug: demo.slug,
    title: demo.title,
    tagline: demo.tagline,
    location: demo.location,
    startDate: demo.startDate,
    endDate: demo.endDate,
    expiresAt: demo.expiresAt,
    offlinePact: demo.offlinePact,
    attendeeCount: db.select().from(attendees).where(eq(attendees.eventId, demo.id)).all().length,
    itineraryCount: db
      .select()
      .from(itineraryItems)
      .where(eq(itineraryItems.eventId, demo.id))
      .all().length,
    pollCount: db.select().from(polls).where(eq(polls.eventId, demo.id)).all().length,
    expenseCount: db.select().from(expenses).where(eq(expenses.eventId, demo.id)).all().length,
    photoCount: db.select().from(photos).where(eq(photos.eventId, demo.id)).all().length,
  };
}
