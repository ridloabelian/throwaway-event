# throwaway-event

A lightweight, privacy-first **"throwaway micro-app" platform** for a single group trip, wedding weekend, reunion, or team offsite — **one shareable link**, **zero attendee account registration**, and **automatic self-destruction** after the event.

Built to run **100% locally** out of the box using Next.js (App Router, TypeScript), Tailwind CSS, SQLite (`better-sqlite3`) + Drizzle ORM, and local disk storage.

---

## Key Features (v0.1 MVP)

1. **60-Second Event Spin-Up**
   - Create a private event room with a title, location/note, start & end dates, optional room PIN, configurable expiry window (`1`–`30` days post-event), and a **"No Social Posting / Offline Pact"** toggle.
   - Generates an unguessable room slug (`/e/[slug]`) plus a one-time **Host Passkey** (`XXXX-XXXX`) for reclaiming host powers from another device.

2. **Zero-Signup Attendee Identity**
   - Guests enter just their **first name** (plus the shared PIN if enabled).
   - Sessions are stored in lightweight, event-scoped `HttpOnly` cookies signed with HMAC-SHA256 (`te_session_<slug>`).

3. **4 Essential Micro-Modules**
   - **Live Itinerary**: Day-grouped timeline with map links and one-tap `"I'm in"` / `"Maybe"` RSVPs.
   - **Quick Polls**: Single-choice or multi-select group voting with live percentage bars and voter attribution.
   - **Split-the-Tab**: Exact integer-cent expense logging (`splitAmountEvenly`) and minimal transfer settlement math (`"Alex pays Sam $18"`) powered by optimal zero-sum subset partitioning.
   - **Private Disappearing Photo Wall**: Local image uploads with a prominent **"Cameras Down / Private Room"** manifesto and a **1-click Host ZIP archive download** (`/api/events/[slug]/photos/archive`) before automatic wipe.

4. **Ephemeral Lifecycle & Cleanup**
   - Live ticking countdown banner showing exact remaining time until wipe.
   - CLI / cron cleanup command (`npm run expire-check`) that purges expired events, cascaded SQLite rows, and local photo directories cleanly.

5. **Pre-Seeded Demo Weekend**
   - Opening the app on localhost automatically seeds **`Big Sur Redwood Weekend`** (`/e/big-sur-weekend`) with 6 attendees, 5 itinerary stops, 2 polls, 4 shared expenses, and 4 locally generated PNG moments.

---

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript), React 19
- **Styling**: Tailwind CSS v4, `lucide-react`
- **Database**: SQLite via `better-sqlite3` + Drizzle ORM (`drizzle-kit` migrations under `drizzle/`)
- **Archives**: `jszip` (in-memory ZIP assembly for host photo exports)
- **Testing**: `vitest` (unit & API integration tests) + `@playwright/test` (Chromium E2E tests)

---

## Local Quickstart

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000):
- Explore the pre-seeded **Big Sur Redwood Weekend** demo (`/e/big-sur-weekend`) with 1-click **"Enter as Host (Maya)"** or **"Enter as Jordan (Guest)"**.
- Or spin up a brand-new private event right from the home page.

### Production Mode

```bash
npm run build
npm start
```

---

## CLI & Maintenance Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js development server |
| `npm run build` | Build production bundle |
| `npm start` | Serve production build |
| `npm run typecheck` | Run TypeScript strict type checking (`tsc --noEmit`) |
| `npm test` | Run Vitest unit & API integration tests |
| `npm run test:e2e` | Run Playwright Chromium end-to-end tests |
| `npm run expire-check` | Purge expired events from SQLite and delete their local photo folders |
| `npm run db:seed` | Reset and re-seed the `big-sur-weekend` demo trip |
| `npm run db:generate` | Regenerate Drizzle SQL migrations after schema edits |

---

## Configuration (Optional)

All configuration defaults to local project storage under `./data/` with zero setup required. Optional environment variables (see `.env.example`):

- `DATABASE_PATH` — path to SQLite database file (default: `./data/throwaway.db`)
- `STORAGE_DIR` — directory for local uploaded photos (default: `./data/uploads`)
- `SESSION_SECRET` — HMAC secret for signing event cookies (default: auto-generated `.session-secret` file alongside the DB)

---

## Privacy & Security Design

- **Salted PIN & Host Passkey Hashing**: Stored with `crypto.scryptSync` and verified via `crypto.timingSafeEqual`.
- **Event-Scoped Signed Cookies**: Each cookie is bound to its target `slug` and expiration timestamp, preventing cross-event token replay.
- **No Indexing / No Third-Party Storage**: `robots: noindex, nofollow` headers/metadata, `Cache-Control: private, no-store` on photos and ZIP archives, and local-only filesystem storage with path traversal checks.
- **Host Impersonation Guard**: Guests cannot join using the host's name without supplying the Host Passkey.
