import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { expenses } from "@/db/schema";
import { requireWriteAccess } from "@/lib/api-helpers";

export async function DELETE(
  req: Request,
  context: { params: Promise<{ slug: string; expenseId: string }> },
) {
  const { slug, expenseId } = await context.params;
  const auth = requireWriteAccess(req, slug);
  if (!auth.ok) return auth.response;

  const db = getDb();
  const expense = db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.eventId, auth.ctx.event.id)))
    .get();

  if (!expense) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  if (!auth.ctx.isHost && expense.paidById !== auth.ctx.attendee.id) {
    return NextResponse.json(
      { error: "Only the host or the person who paid can remove this expense." },
      { status: 403 },
    );
  }

  db.delete(expenses).where(eq(expenses.id, expense.id)).run();
  return NextResponse.json({ ok: true });
}
