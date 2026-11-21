import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  tagline: text("tagline").notNull().default(""),
  location: text("location").notNull().default(""),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  pinHash: text("pin_hash"),
  hostKeyHash: text("host_key_hash").notNull(),
  offlinePact: integer("offline_pact", { mode: "boolean" }).notNull().default(true),
  expiryWindowDays: integer("expiry_window_days").notNull().default(7),
  expiresAt: integer("expires_at").notNull(),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const attendees = sqliteTable("attendees", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isHost: integer("is_host", { mode: "boolean" }).notNull().default(false),
  avatarColor: text("avatar_color").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const itineraryItems = sqliteTable("itinerary_items", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  dayDate: text("day_date").notNull(),
  timeLabel: text("time_label").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  locationName: text("location_name").notNull().default(""),
  locationUrl: text("location_url").notNull().default(""),
  createdById: text("created_by_id").references(() => attendees.id, {
    onDelete: "set null",
  }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const itineraryRsvps = sqliteTable(
  "itinerary_rsvps",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => itineraryItems.id, { onDelete: "cascade" }),
    attendeeId: text("attendee_id")
      .notNull()
      .references(() => attendees.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("itinerary_rsvps_item_attendee_idx").on(table.itemId, table.attendeeId)],
);

export const polls = sqliteTable("polls", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  allowMultiple: integer("allow_multiple", { mode: "boolean" }).notNull().default(false),
  isClosed: integer("is_closed", { mode: "boolean" }).notNull().default(false),
  createdById: text("created_by_id").references(() => attendees.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at").notNull(),
});

export const pollOptions = sqliteTable("poll_options", {
  id: text("id").primaryKey(),
  pollId: text("poll_id")
    .notNull()
    .references(() => polls.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  note: text("note").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const pollVotes = sqliteTable(
  "poll_votes",
  {
    id: text("id").primaryKey(),
    pollId: text("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    optionId: text("option_id")
      .notNull()
      .references(() => pollOptions.id, { onDelete: "cascade" }),
    attendeeId: text("attendee_id")
      .notNull()
      .references(() => attendees.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("poll_votes_option_attendee_idx").on(table.optionId, table.attendeeId)],
);

export const expenses = sqliteTable("expenses", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  paidById: text("paid_by_id")
    .notNull()
    .references(() => attendees.id, { onDelete: "cascade" }),
  category: text("category").notNull().default("shared"),
  createdAt: integer("created_at").notNull(),
});

export const expenseParticipants = sqliteTable(
  "expense_participants",
  {
    id: text("id").primaryKey(),
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    attendeeId: text("attendee_id")
      .notNull()
      .references(() => attendees.id, { onDelete: "cascade" }),
    shareCents: integer("share_cents").notNull(),
  },
  (table) => [
    uniqueIndex("expense_participants_expense_attendee_idx").on(
      table.expenseId,
      table.attendeeId,
    ),
  ],
);

export const photos = sqliteTable("photos", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  uploadedById: text("uploaded_by_id").references(() => attendees.id, {
    onDelete: "set null",
  }),
  uploaderName: text("uploader_name").notNull(),
  storageKey: text("storage_key").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  caption: text("caption").notNull().default(""),
  takenAtLabel: text("taken_at_label").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

export type EventRow = typeof events.$inferSelect;
export type AttendeeRow = typeof attendees.$inferSelect;
export type ItineraryItemRow = typeof itineraryItems.$inferSelect;
export type ItineraryRsvpRow = typeof itineraryRsvps.$inferSelect;
export type PollRow = typeof polls.$inferSelect;
export type PollOptionRow = typeof pollOptions.$inferSelect;
export type PollVoteRow = typeof pollVotes.$inferSelect;
export type ExpenseRow = typeof expenses.$inferSelect;
export type ExpenseParticipantRow = typeof expenseParticipants.$inferSelect;
export type PhotoRow = typeof photos.$inferSelect;
