import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attendees, expenseParticipants, expenses } from "@/db/schema";
import { requireWriteAccess } from "@/lib/api-helpers";
import { splitAmountEvenly } from "@/lib/settlement";

export async function POST(
  req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const auth = requireWriteAccess(req, slug);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  const category =
    typeof body.category === "string" && body.category.trim()
      ? body.category.trim().slice(0, 32)
      : "shared";
  const amountCents =
    typeof body.amountCents === "number" ? Math.round(body.amountCents) : Number(body.amountCents);
  const paidById =
    typeof body.paidById === "string" && body.paidById.trim()
      ? body.paidById.trim()
      : auth.ctx.attendee.id;
  const rawParticipantIds = Array.isArray(body.participantIds) ? body.participantIds : [];

  if (description.length < 1 || description.length > 120) {
    return NextResponse.json(
      { error: "Expense description must be between 1 and 120 characters." },
      { status: 400 },
    );
  }

  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 10_000_000) {
    return NextResponse.json(
      { error: "Amount must be a positive number up to $100,000." },
      { status: 400 },
    );
  }

  const db = getDb();
  const eventAttendeeIds = new Set(
    db
      .select({ id: attendees.id })
      .from(attendees)
      .where(eq(attendees.eventId, auth.ctx.event.id))
      .all()
      .map((a) => a.id),
  );

  if (!eventAttendeeIds.has(paidById)) {
    return NextResponse.json({ error: "Selected payer is not in this event." }, { status: 400 });
  }

  const participantIds = Array.from(
    new Set(
      rawParticipantIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter((id) => eventAttendeeIds.has(id)),
    ),
  );

  if (participantIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one attendee to split this expense with." },
      { status: 400 },
    );
  }

  const shares = splitAmountEvenly(amountCents, participantIds);
  const expenseId = `exp_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = Date.now();

  db.transaction((tx) => {
    tx.insert(expenses)
      .values({
        id: expenseId,
        eventId: auth.ctx.event.id,
        description,
        amountCents,
        paidById,
        category,
        createdAt: now,
      })
      .run();

    for (const [attendeeId, shareCents] of Object.entries(shares)) {
      tx.insert(expenseParticipants)
        .values({
          id: `ep_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
          expenseId,
          attendeeId,
          shareCents,
        })
        .run();
    }
  });

  return NextResponse.json({ id: expenseId }, { status: 201 });
}
