import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { pollOptions, polls } from "@/db/schema";
import { requireWriteAccess } from "@/lib/api-helpers";

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

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const allowMultiple = Boolean(body.allowMultiple);
  const rawOptions = Array.isArray(body.options) ? body.options : [];

  const parsedOptions: Array<{ label: string; note: string }> = [];
  const seenLabels = new Set<string>();

  for (const entry of rawOptions) {
    const label =
      typeof entry === "string"
        ? entry.trim()
        : typeof entry === "object" && entry !== null && typeof (entry as { label?: unknown }).label === "string"
          ? ((entry as { label: string }).label).trim()
          : "";
    const note =
      typeof entry === "object" && entry !== null && typeof (entry as { note?: unknown }).note === "string"
        ? ((entry as { note: string }).note).trim().slice(0, 120)
        : "";

    if (!label) continue;
    const key = label.toLowerCase();
    if (seenLabels.has(key)) continue;
    seenLabels.add(key);
    parsedOptions.push({ label: label.slice(0, 100), note });
  }

  if (question.length < 2 || question.length > 160) {
    return NextResponse.json(
      { error: "Poll question must be between 2 and 160 characters." },
      { status: 400 },
    );
  }

  if (parsedOptions.length < 2 || parsedOptions.length > 10) {
    return NextResponse.json(
      { error: "Provide between 2 and 10 distinct options." },
      { status: 400 },
    );
  }

  const db = getDb();
  const now = Date.now();
  const pollId = `poll_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

  db.transaction((tx) => {
    tx.insert(polls)
      .values({
        id: pollId,
        eventId: auth.ctx.event.id,
        question,
        allowMultiple,
        isClosed: false,
        createdById: auth.ctx.attendee.id,
        createdAt: now,
      })
      .run();

    parsedOptions.forEach((opt, idx) => {
      tx.insert(pollOptions)
        .values({
          id: `opt_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
          pollId,
          label: opt.label,
          note: opt.note,
          sortOrder: idx + 1,
        })
        .run();
    });
  });

  return NextResponse.json({ id: pollId }, { status: 201 });
}
