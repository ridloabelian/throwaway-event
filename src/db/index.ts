import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { getDatabasePath } from "@/lib/paths";
import { ensureDemoSeeded } from "@/lib/seed";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  pin_hash TEXT,
  host_key_hash TEXT NOT NULL,
  offline_pact INTEGER NOT NULL DEFAULT 1,
  expiry_window_days INTEGER NOT NULL DEFAULT 7,
  expires_at INTEGER NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attendees (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_host INTEGER NOT NULL DEFAULT 0,
  avatar_color TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS attendees_event_id_idx ON attendees(event_id);

CREATE TABLE IF NOT EXISTS itinerary_items (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  day_date TEXT NOT NULL,
  time_label TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location_name TEXT NOT NULL DEFAULT '',
  location_url TEXT NOT NULL DEFAULT '',
  created_by_id TEXT REFERENCES attendees(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS itinerary_items_event_id_idx ON itinerary_items(event_id);

CREATE TABLE IF NOT EXISTS itinerary_rsvps (
  id TEXT PRIMARY KEY NOT NULL,
  item_id TEXT NOT NULL REFERENCES itinerary_items(id) ON DELETE CASCADE,
  attendee_id TEXT NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS itinerary_rsvps_item_attendee_idx
  ON itinerary_rsvps(item_id, attendee_id);

CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  allow_multiple INTEGER NOT NULL DEFAULT 0,
  is_closed INTEGER NOT NULL DEFAULT 0,
  created_by_id TEXT REFERENCES attendees(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS polls_event_id_idx ON polls(event_id);

CREATE TABLE IF NOT EXISTS poll_options (
  id TEXT PRIMARY KEY NOT NULL,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS poll_options_poll_id_idx ON poll_options(poll_id);

CREATE TABLE IF NOT EXISTS poll_votes (
  id TEXT PRIMARY KEY NOT NULL,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  attendee_id TEXT NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS poll_votes_option_attendee_idx
  ON poll_votes(option_id, attendee_id);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_by_id TEXT NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'shared',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS expenses_event_id_idx ON expenses(event_id);

CREATE TABLE IF NOT EXISTS expense_participants (
  id TEXT PRIMARY KEY NOT NULL,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  attendee_id TEXT NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  share_cents INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_participants_expense_attendee_idx
  ON expense_participants(expense_id, attendee_id);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  uploaded_by_id TEXT REFERENCES attendees(id) ON DELETE SET NULL,
  uploader_name TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  taken_at_label TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS photos_event_id_idx ON photos(event_id);
`;

interface CachedDb {
  dbPath: string;
  sqlite: Database.Database;
  db: AppDatabase;
}

const globalForDb = globalThis as typeof globalThis & {
  __throwawayDbCache?: CachedDb;
  __throwawaySeededPaths?: Set<string>;
};

function getSeededPaths(): Set<string> {
  if (!globalForDb.__throwawaySeededPaths) {
    globalForDb.__throwawaySeededPaths = new Set<string>();
  }
  return globalForDb.__throwawaySeededPaths;
}

/**
 * Returns the cached Drizzle SQLite connection for the active `DATABASE_PATH`,
 * ensuring schema creation and initial demo seeding on cold start.
 */
export function getDb(): AppDatabase {
  const dbPath = getDatabasePath();
  const cached = globalForDb.__throwawayDbCache;

  if (cached && cached.dbPath === dbPath) {
    return cached.db;
  }

  if (cached) {
    try {
      cached.sqlite.close();
    } catch {
      // Ignore already-closed handles when switching DB paths in tests
    }
    globalForDb.__throwawayDbCache = undefined;
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(SCHEMA_SQL);

  const db = drizzle(sqlite, { schema });
  globalForDb.__throwawayDbCache = { dbPath, sqlite, db };

  const seededPaths = getSeededPaths();
  if (process.env.SKIP_AUTO_SEED !== "true" && !seededPaths.has(dbPath)) {
    seededPaths.add(dbPath);
    ensureDemoSeeded(db);
  }

  return db;
}

/**
 * Closes the cached SQLite connection and resets seed tracking (primarily for tests).
 */
export function closeDb(): void {
  const cached = globalForDb.__throwawayDbCache;
  if (cached) {
    try {
      cached.sqlite.close();
    } catch {
      // Ignore close error
    }
    globalForDb.__throwawayDbCache = undefined;
  }
  getSeededPaths().clear();
}
