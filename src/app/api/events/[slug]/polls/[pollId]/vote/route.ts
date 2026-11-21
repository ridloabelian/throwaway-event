import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pollOptions, polls, pollVotes } from "@/db/schema";
import { requireWriteAccess } from "@/lib/api-helpers";

export async function POST(
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

  const optionId = typeof body.optionId === "string" ? body.optionId.trim() : "";
  if (!optionId) {
    return NextResponse.json({ error: "optionId is required." }, { status: 400 });
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

  if (poll.isClosed) {
    return NextResponse.json({ error: "This poll is closed." }, { status: 409 });
  }

  const option = db
    .select()
    .from(pollOptions)
    .where(and(eq(pollOptions.id, optionId), eq(pollOptions.pollId, poll.id)))
    .get();

  if (!option) {
    return NextResponse.json({ error: "Poll option not found" }, { status: 404 });
  }

  const now = Date.now();
  db.transaction((tx) => {
    const existingForOption = tx
      .select()
      .from(pollVotes)
      .where(
        and(
          eq(pollVotes.pollId, poll.id),
          eq(pollVotes.optionId, option.id),
          eq(pollVotes.attendeeId, auth.ctx.attendee.id),
        ),
      )
      .get();

    if (poll.allowMultiple) {
      if (existingForOption) {
        tx.delete(pollVotes).where(eq(pollVotes.id, existingForOption.id)).run();
      } else {
        tx.insert(pollVotes)
          .values({
            id: `vote_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
            pollId: poll.id,
            optionId: option.id,
            attendeeId: auth.ctx.attendee.id,
            createdAt: now,
          })
          .run();
      }
      return;
    }

    // Single-choice poll: clicking already-chosen option clears vote; otherwise replace previous vote.
    tx.delete(pollVotes)
      .where(and(eq(pollVotes.pollId, poll.id), eq(pollVotes.attendeeId, auth.ctx.attendee.id)))
      .run();

    if (!existingForOption) {
      tx.insert(pollVotes)
        .values({
          id: `vote_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
          pollId: poll.id,
          optionId: option.id,
          attendeeId: auth.ctx.attendee.id,
          createdAt: now,
        })
        .run();
    }
  });

  return NextResponse.json({ ok: true });
}
