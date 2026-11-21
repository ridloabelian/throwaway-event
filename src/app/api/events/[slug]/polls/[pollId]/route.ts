import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { polls } from "@/db/schema";
import { requireWriteAccess } from "@/lib/api-helpers";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ slug: string; pollId: string }> },
) {
  const { slug, pollId } = await context.params;
  const auth = requireWriteAccess(req, slug);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const db = getDb();
  const poll = db
    .select()
    .from(polls)
    .where(and(eq(polls.id, pollId), eq(polls.eventId, auth.ctx.event.id)))
    .get();

  if (!poll) {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }

  if (!auth.ctx.isHost && poll.createdById !== auth.ctx.attendee.id) {
    return NextResponse.json(
      { error: "Only the host or poll creator can close or reopen this poll." },
      { status: 403 },
    );
  }

  const isClosed = typeof body.isClosed === "boolean" ? body.isClosed : !poll.isClosed;
  db.update(polls).set({ isClosed }).where(eq(polls.id, poll.id)).run();

  return NextResponse.json({ ok: true, isClosed });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ slug: string; pollId: string }> },
) {
  const { slug, pollId } = await context.params;
  const auth = requireWriteAccess(req, slug);
  if (!auth.ok) return auth.response;

  const db = getDb();
  const poll = db
    .select()
    .from(polls)
    .where(and(eq(polls.id, pollId), eq(polls.eventId, auth.ctx.event.id)))
    .get();

  if (!poll) {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }

  if (!auth.ctx.isHost && poll.createdById !== auth.ctx.attendee.id) {
    return NextResponse.json(
      { error: "Only the host or poll creator can delete this poll." },
      { status: 403 },
    );
  }

  db.delete(polls).where(eq(polls.id, poll.id)).run();
  return NextResponse.json({ ok: true });
}
