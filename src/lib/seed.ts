import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { count, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db";
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
} from "@/db/schema";
import { hashSecret } from "./auth";
import { generateScenePng, type DemoSceneSpec } from "./demo-images";
import { computeExpiresAt } from "./expiry";
import { getStorageDir } from "./paths";
import { splitAmountEvenly } from "./settlement";

export const DEMO_SLUG = "big-sur-weekend";
export const DEMO_HOST_PASSKEY = "BIGS-UR26";

function formatDateOffset(baseMs: number, offsetDays: number): string {
  const date = new Date(baseMs + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

const DEMO_PHOTOS: Array<{
  filename: string;
  caption: string;
  takenAtLabel: string;
  uploaderKey: "maya" | "alex" | "sam" | "priya";
  scene: DemoSceneSpec;
}> = [
  {
    filename: "campfire-under-redwoods.png",
    caption: "Campfire sparks under the redwoods — phones stayed in backpacks all night.",
    takenAtLabel: "Fri · 9:40 PM",
    uploaderKey: "maya",
    scene: {
      topRgb: [22, 34, 48],
      bottomRgb: [58, 38, 30],
      accentRgb: [242, 134, 64],
      sunXRatio: 0.52,
      sunYRatio: 0.62,
      horizonRatio: 0.66,
    },
  },
  {
    filename: "bixby-creek-golden-hour.png",
    caption: "Pulled off Highway 1 right as the marine layer cleared.",
    takenAtLabel: "Sat · 5:25 PM",
    uploaderKey: "alex",
    scene: {
      topRgb: [62, 101, 138],
      bottomRgb: [232, 148, 92],
      accentRgb: [255, 214, 132],
      sunXRatio: 0.28,
      sunYRatio: 0.44,
      horizonRatio: 0.68,
    },
  },
  {
    filename: "morning-pour-over-deck.png",
    caption: "First pot of coffee on the cedar deck before anyone checked Slack.",
    takenAtLabel: "Sat · 8:15 AM",
    uploaderKey: "sam",
    scene: {
      topRgb: [152, 178, 166],
      bottomRgb: [212, 194, 164],
      accentRgb: [246, 226, 172],
      sunXRatio: 0.72,
      sunYRatio: 0.34,
      horizonRatio: 0.72,
    },
  },
  {
    filename: "point-lobos-coastal-fog.png",
    caption: "Cypress cove trail in thick coastal fog. Sea otters down in the kelp.",
    takenAtLabel: "Sun · 10:10 AM",
    uploaderKey: "priya",
    scene: {
      topRgb: [118, 142, 146],
      bottomRgb: [72, 110, 104],
      accentRgb: [235, 240, 232],
      sunXRatio: 0.62,
      sunYRatio: 0.28,
      horizonRatio: 0.63,
    },
  },
];

/**
 * Auto-seeds the demo weekend trip once when the database has no events yet.
 */
export function ensureDemoSeeded(db: AppDatabase, now = Date.now()): boolean {
  const existing = db.select({ total: count() }).from(events).get();
  if ((existing?.total ?? 0) > 0) {
    return false;
  }

  seedDemoEvent(now, db);
  return true;
}

/**
 * Inserts (or resets) the realistic pre-seeded Big Sur weekend trip event with
 * 6 attendees, itinerary + RSVPs, polls + votes, shared expenses, and local PNG photos.
 */
export function seedDemoEvent(now = Date.now(), dbArg?: AppDatabase): {
  eventId: string;
  slug: string;
  hostPasskey: string;
} {
  const db = dbArg ?? getDb();

  // Remove existing demo event if re-seeding explicitly
  const existingDemo = db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.slug, DEMO_SLUG))
    .get();
  if (existingDemo) {
    fs.rmSync(path.join(getStorageDir(), existingDemo.id), { recursive: true, force: true });
    db.delete(events).where(eq(events.id, existingDemo.id)).run();
  }

  const startDate = formatDateOffset(now, -1);
  const endDate = formatDateOffset(now, 1);
  const expiryWindowDays = 7;
  const expiresAt = computeExpiresAt(endDate, expiryWindowDays);
  const eventId = `evt_demo_${crypto.randomUUID().slice(0, 8)}`;

  const people = {
    maya: { id: `${eventId}_maya`, name: "Maya", isHost: true, color: "#1E4635" },
    alex: { id: `${eventId}_alex`, name: "Alex", isHost: false, color: "#C85A32" },
    sam: { id: `${eventId}_sam`, name: "Sam", isHost: false, color: "#3B6B8C" },
    jordan: { id: `${eventId}_jordan`, name: "Jordan", isHost: false, color: "#7B538C" },
    priya: { id: `${eventId}_priya`, name: "Priya", isHost: false, color: "#9C6B28" },
    leo: { id: `${eventId}_leo`, name: "Leo", isHost: false, color: "#4D6D49" },
  };

  db.transaction((tx) => {
    tx.insert(events)
      .values({
        id: eventId,
        slug: DEMO_SLUG,
        title: "Big Sur Redwood Weekend",
        tagline: "Three days offline in the canyon — one link, zero feeds, memories wiped in a week.",
        location: "Big Sur, CA",
        startDate,
        endDate,
        pinHash: null,
        hostKeyHash: hashSecret(DEMO_HOST_PASSKEY),
        offlinePact: true,
        expiryWindowDays,
        expiresAt,
        isDemo: true,
        createdAt: now - 86_400_000 * 2,
      })
      .run();

    Object.values(people).forEach((person, idx) => {
      tx.insert(attendees)
        .values({
          id: person.id,
          eventId,
          name: person.name,
          isHost: person.isHost,
          avatarColor: person.color,
          createdAt: now - 86_400_000 * 2 + idx * 1000,
        })
        .run();
    });

    const day1 = startDate;
    const day2 = formatDateOffset(now, 0);
    const day3 = endDate;

    const items = [
      {
        id: `${eventId}_it1`,
        dayDate: day1,
        timeLabel: "4:30 PM",
        title: "Cabin Check-In & Cedar Deck Aperitivo",
        description: "Drop bags, claim bunks, open the sparkling cider, and put phones in the woven basket.",
        locationName: "Glen Oaks Redwood Cabin #4",
        locationUrl: "https://maps.google.com/?q=Big+Sur+CA",
        createdById: people.maya.id,
        sortOrder: 1,
        rsvps: [
          [people.maya.id, "in"],
          [people.alex.id, "in"],
          [people.sam.id, "in"],
          [people.jordan.id, "in"],
          [people.priya.id, "in"],
          [people.leo.id, "maybe"],
        ] as const,
      },
      {
        id: `${eventId}_it2`,
        dayDate: day1,
        timeLabel: "8:00 PM",
        title: "Firepit Tacos & Acoustic Vinyl Session",
        description: "Leo is bringing portable speakers and extra firewood. Bring layers for canyon fog.",
        locationName: "South Fire Ring",
        locationUrl: "",
        createdById: people.leo.id,
        sortOrder: 2,
        rsvps: [
          [people.maya.id, "in"],
          [people.alex.id, "in"],
          [people.sam.id, "in"],
          [people.jordan.id, "in"],
          [people.priya.id, "in"],
          [people.leo.id, "in"],
        ] as const,
      },
      {
        id: `${eventId}_it3`,
        dayDate: day2,
        timeLabel: "9:30 AM",
        title: "Ewoldsen Trail Redwood Loop",
        description: "5-mile canyon hike with ocean overlook. Meet on the front porch with water bottles.",
        locationName: "Julia Pfeiffer Burns State Park",
        locationUrl: "https://maps.google.com/?q=Julia+Pfeiffer+Burns+State+Park",
        createdById: people.alex.id,
        sortOrder: 3,
        rsvps: [
          [people.maya.id, "in"],
          [people.alex.id, "in"],
          [people.sam.id, "maybe"],
          [people.jordan.id, "in"],
          [people.priya.id, "in"],
          [people.leo.id, "out"],
        ] as const,
      },
      {
        id: `${eventId}_it4`,
        dayDate: day2,
        timeLabel: "6:00 PM",
        title: "Sunset Cliffside Picnic & Group Dinner",
        description: "Pick up wood-fired pizzas on the way back or sit down at Nepenthe terrace.",
        locationName: "Highway 1 Pullout Overlook",
        locationUrl: "https://maps.google.com/?q=Bixby+Creek+Bridge",
        createdById: people.sam.id,
        sortOrder: 4,
        rsvps: [
          [people.maya.id, "in"],
          [people.alex.id, "in"],
          [people.sam.id, "in"],
          [people.jordan.id, "in"],
          [people.priya.id, "maybe"],
          [people.leo.id, "in"],
        ] as const,
      },
      {
        id: `${eventId}_it5`,
        dayDate: day3,
        timeLabel: "10:30 AM",
        title: "Bakery Pastry Run & Slow Coast Drive Home",
        description: "Quick tidy-up at the cabin, then grab sourdough croissants before hitting 101.",
        locationName: "Big Sur Bakery",
        locationUrl: "https://maps.google.com/?q=Big+Sur+Bakery",
        createdById: people.priya.id,
        sortOrder: 5,
        rsvps: [
          [people.maya.id, "in"],
          [people.alex.id, "in"],
          [people.sam.id, "in"],
          [people.jordan.id, "maybe"],
          [people.priya.id, "in"],
          [people.leo.id, "in"],
        ] as const,
      },
    ];

    for (const item of items) {
      tx.insert(itineraryItems)
        .values({
          id: item.id,
          eventId,
          dayDate: item.dayDate,
          timeLabel: item.timeLabel,
          title: item.title,
          description: item.description,
          locationName: item.locationName,
          locationUrl: item.locationUrl,
          createdById: item.createdById,
          sortOrder: item.sortOrder,
          createdAt: now - 3600_000 * (10 - item.sortOrder),
        })
        .run();

      for (const [attendeeId, status] of item.rsvps) {
        tx.insert(itineraryRsvps)
          .values({
            id: `${item.id}_${attendeeId}`,
            itemId: item.id,
            attendeeId,
            status,
            updatedAt: now - 1800_000,
          })
          .run();
      }
    }

    // Polls
    const poll1Id = `${eventId}_poll1`;
    tx.insert(polls)
      .values({
        id: poll1Id,
        eventId,
        question: "Saturday night dinner plan?",
        allowMultiple: false,
        isClosed: false,
        createdById: people.maya.id,
        createdAt: now - 7200_000,
      })
      .run();

    const p1Opts = [
      { id: `${poll1Id}_o1`, label: "Wood-fired pizza & cider back at the deck", note: "Cozy, zero wait", sortOrder: 1 },
      { id: `${poll1Id}_o2`, label: "Nepenthe terrace burgers at sunset", note: "Ocean view, ~$35/person", sortOrder: 2 },
      { id: `${poll1Id}_o3`, label: "Cook cast-iron pasta & salad family style", note: "Use cabin kitchen", sortOrder: 3 },
    ];
    for (const opt of p1Opts) {
      tx.insert(pollOptions).values({ ...opt, pollId: poll1Id }).run();
    }
    const p1Votes: Array<[string, string]> = [
      [p1Opts[0].id, people.maya.id],
      [p1Opts[0].id, people.sam.id],
      [p1Opts[0].id, people.leo.id],
      [p1Opts[1].id, people.alex.id],
      [p1Opts[1].id, people.priya.id],
      [p1Opts[2].id, people.jordan.id],
    ];
    p1Votes.forEach(([optionId, attendeeId], idx) => {
      tx.insert(pollVotes)
        .values({
          id: `${poll1Id}_v${idx}`,
          pollId: poll1Id,
          optionId,
          attendeeId,
          createdAt: now - 3600_000,
        })
        .run();
    });

    const poll2Id = `${eventId}_poll2`;
    tx.insert(polls)
      .values({
        id: poll2Id,
        eventId,
        question: "Sunday morning pace before checkout?",
        allowMultiple: false,
        isClosed: false,
        createdById: people.priya.id,
        createdAt: now - 5400_000,
      })
      .run();

    const p2Opts = [
      { id: `${poll2Id}_o1`, label: "Point Lobos 8 AM coastal walk + coffee", note: "Easy 2.5 miles", sortOrder: 1 },
      { id: `${poll2Id}_o2`, label: "Sleep in & big cabin pancake breakfast", note: "Checkout is 11 AM", sortOrder: 2 },
    ];
    for (const opt of p2Opts) {
      tx.insert(pollOptions).values({ ...opt, pollId: poll2Id }).run();
    }
    const p2Votes: Array<[string, string]> = [
      [p2Opts[0].id, people.priya.id],
      [p2Opts[0].id, people.alex.id],
      [p2Opts[0].id, people.maya.id],
      [p2Opts[0].id, people.jordan.id],
      [p2Opts[1].id, people.sam.id],
      [p2Opts[1].id, people.leo.id],
    ];
    p2Votes.forEach(([optionId, attendeeId], idx) => {
      tx.insert(pollVotes)
        .values({
          id: `${poll2Id}_v${idx}`,
          pollId: poll2Id,
          optionId,
          attendeeId,
          createdAt: now - 2400_000,
        })
        .run();
    });

    // Shared expenses (clean numbers showcasing minimal settlement transfers)
    const allIds = Object.values(people).map((p) => p.id);
    const expenseSeeds = [
      {
        id: `${eventId}_exp1`,
        description: "Redwood cabin weekend balance",
        amountCents: 48000, // $480 / 6 = $80 each
        paidById: people.maya.id,
        category: "stay",
        participants: allIds,
        createdAt: now - 7000_000,
      },
      {
        id: `${eventId}_exp2`,
        description: "Trader Joe's groceries & firewood haul",
        amountCents: 12000, // $120 / 6 = $20 each
        paidById: people.sam.id,
        category: "food",
        participants: allIds,
        createdAt: now - 5000_000,
      },
      {
        id: `${eventId}_exp3`,
        description: "Point Lobos park pass & road coffee",
        amountCents: 6000, // $60 / 4 = $15 each
        paidById: people.alex.id,
        category: "activity",
        participants: [people.maya.id, people.alex.id, people.jordan.id, people.priya.id],
        createdAt: now - 3000_000,
      },
      {
        id: `${eventId}_exp4`,
        description: "Wood-fired sourdough pizzas & cider",
        amountCents: 9000, // $90 / 6 = $15 each
        paidById: people.sam.id,
        category: "food",
        participants: allIds,
        createdAt: now - 1500_000,
      },
    ];

    for (const exp of expenseSeeds) {
      tx.insert(expenses)
        .values({
          id: exp.id,
          eventId,
          description: exp.description,
          amountCents: exp.amountCents,
          paidById: exp.paidById,
          category: exp.category,
          createdAt: exp.createdAt,
        })
        .run();

      const shares = splitAmountEvenly(exp.amountCents, exp.participants);
      for (const [attendeeId, shareCents] of Object.entries(shares)) {
        tx.insert(expenseParticipants)
          .values({
            id: `${exp.id}_${attendeeId}`,
            expenseId: exp.id,
            attendeeId,
            shareCents,
          })
          .run();
      }
    }
  });

  // Write generated PNG photos locally inside <storageDir>/<eventId>/
  const eventUploadDir = path.join(getStorageDir(), eventId);
  fs.mkdirSync(eventUploadDir, { recursive: true });

  DEMO_PHOTOS.forEach((spec, idx) => {
    const photoId = `${eventId}_ph${idx + 1}`;
    const storageKey = path.posix.join(eventId, `${photoId}-${spec.filename}`);
    const filePath = path.join(getStorageDir(), storageKey);
    const pngBuffer = generateScenePng(480, 360, spec.scene);
    fs.writeFileSync(filePath, pngBuffer);

    const uploader = people[spec.uploaderKey];
    db.insert(photos)
      .values({
        id: photoId,
        eventId,
        uploadedById: uploader.id,
        uploaderName: uploader.name,
        storageKey,
        originalName: spec.filename,
        mimeType: "image/png",
        sizeBytes: pngBuffer.byteLength,
        caption: spec.caption,
        takenAtLabel: spec.takenAtLabel,
        createdAt: now - (DEMO_PHOTOS.length - idx) * 1800_000,
      })
      .run();
  });

  return {
    eventId,
    slug: DEMO_SLUG,
    hostPasskey: DEMO_HOST_PASSKEY,
  };
}
