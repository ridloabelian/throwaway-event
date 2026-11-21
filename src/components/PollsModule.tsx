"use client";

import { useState } from "react";
import { CheckCircle2, Lock, Plus, Trash2, Unlock, Vote } from "lucide-react";
import type { RoomPoll } from "@/lib/room-data";

interface PollsModuleProps {
  slug: string;
  polls: RoomPoll[];
  viewerId: string | null;
  isHost: boolean;
  onMutate: () => Promise<void>;
}

export function PollsModule({
  slug,
  polls,
  viewerId,
  isHost,
  onMutate,
}: PollsModuleProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [question, setQuestion] = useState("");
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [options, setOptions] = useState(["", ""]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreatePoll(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusyId("create");
    try {
      const cleaned = options.map((o) => o.trim()).filter(Boolean);
      const res = await fetch(`/api/events/${slug}/polls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          allowMultiple,
          options: cleaned,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Unable to create poll.");
        return;
      }
      setQuestion("");
      setAllowMultiple(false);
      setOptions(["", ""]);
      setShowCreate(false);
      await onMutate();
    } catch {
      setError("Network error while creating poll.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleVote(pollId: string, optionId: string) {
    if (!viewerId) return;
    setError(null);
    setBusyId(pollId);
    try {
      const res = await fetch(`/api/events/${slug}/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to record vote.");
        return;
      }
      await onMutate();
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleClosed(poll: RoomPoll) {
    setError(null);
    setBusyId(poll.id);
    try {
      const res = await fetch(`/api/events/${slug}/polls/${poll.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isClosed: !poll.isClosed }),
      });
      if (res.ok) await onMutate();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(pollId: string) {
    setError(null);
    setBusyId(pollId);
    try {
      const res = await fetch(`/api/events/${slug}/polls/${pollId}`, {
        method: "DELETE",
      });
      if (res.ok) await onMutate();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[#191715]">Quick Polls</h3>
          <p className="text-xs text-[#645C52]">
            Decide dinner spots and plans in seconds without endless group-chat scrolling.
          </p>
        </div>

        {viewerId && (
          <button
            type="button"
            onClick={() => setShowCreate((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#1E4635] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#153326]"
          >
            <Plus className="h-3.5 w-3.5" />
            {showCreate ? "Cancel" : "New Poll"}
          </button>
        )}
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreatePoll}
          className="space-y-3 rounded-2xl border border-[#D9CEBE] bg-[#FAF7F2] p-4"
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#645C52]">Question *</span>
            <input
              type="text"
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Where are we grabbing Friday dinner?"
              className="w-full rounded-xl border border-[#D9CEBE] bg-white px-3 py-2 text-sm text-[#191715] focus:border-[#1E4635] focus:outline-none"
            />
          </label>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-[#645C52]">Options *</span>
            {options.map((opt, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  type="text"
                  required={idx < 2}
                  value={opt}
                  onChange={(e) =>
                    setOptions((prev) => prev.map((val, i) => (i === idx ? e.target.value : val)))
                  }
                  placeholder={`Option ${idx + 1}`}
                  className="flex-1 rounded-xl border border-[#D9CEBE] bg-white px-3 py-2 text-sm text-[#191715] focus:border-[#1E4635] focus:outline-none"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setOptions((prev) => prev.filter((_, i) => i !== idx))}
                    className="rounded-xl px-2.5 text-xs text-[#645C52] hover:bg-[#FBEAE3] hover:text-[#9B3614]"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <button
                type="button"
                onClick={() => setOptions((prev) => [...prev, ""])}
                className="text-xs font-semibold text-[#1E4635] hover:underline"
              >
                + Add another option
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-[#645C52]">
              <input
                type="checkbox"
                checked={allowMultiple}
                onChange={(e) => setAllowMultiple(e.target.checked)}
                className="h-4 w-4 accent-[#1E4635]"
              />
              Allow picking multiple options
            </label>

            <button
              type="submit"
              disabled={busyId === "create"}
              className="rounded-xl bg-[#1E4635] px-4 py-2 text-xs font-semibold text-white hover:bg-[#153326] disabled:opacity-60"
            >
              {busyId === "create" ? "Launching…" : "Launch Poll"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="rounded-xl border border-[#F2C6B6] bg-[#FBEAE3] px-3 py-2 text-xs font-medium text-[#9B3614]">
          {error}
        </p>
      )}

      {polls.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D9CEBE] bg-[#FAF7F2] p-8 text-center">
          <p className="text-sm font-medium text-[#191715]">No polls yet.</p>
          <p className="mt-1 text-xs text-[#645C52]">
            Spin up a quick vote for dinner, groceries, or tee times.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {polls.map((poll) => {
            const canManage = Boolean(viewerId && (isHost || poll.createdById === viewerId));
            return (
              <article
                key={poll.id}
                className="flex flex-col justify-between rounded-2xl border border-[#E4DACB] bg-white p-5 shadow-xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Vote className="h-4 w-4 text-[#C85A32]" />
                        <h4 className="text-base font-bold text-[#191715]">{poll.question}</h4>
                      </div>
                      <p className="mt-1 text-xs text-[#645C52]">
                        {poll.uniqueVoters} {poll.uniqueVoters === 1 ? "person" : "people"} voted ·{" "}
                        {poll.allowMultiple ? "Multi-select" : "Single choice"}
                        {poll.isClosed ? " · Closed" : ""}
                      </p>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title={poll.isClosed ? "Reopen poll" : "Close poll"}
                          disabled={busyId === poll.id}
                          onClick={() => void handleToggleClosed(poll)}
                          className="rounded-lg p-1.5 text-[#645C52] hover:bg-[#FAF7F2]"
                        >
                          {poll.isClosed ? (
                            <Unlock className="h-4 w-4" />
                          ) : (
                            <Lock className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete poll ${poll.question}`}
                          disabled={busyId === poll.id}
                          onClick={() => void handleDelete(poll.id)}
                          className="rounded-lg p-1.5 text-[#645C52] hover:bg-[#FBEAE3] hover:text-[#9B3614]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 space-y-2.5">
                    {poll.options.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={!viewerId || poll.isClosed || busyId === poll.id}
                        onClick={() => void handleVote(poll.id, opt.id)}
                        className={`relative w-full overflow-hidden rounded-xl border p-3 text-left transition ${
                          opt.viewerVoted
                            ? "border-[#1E4635] bg-[#EAF2ED]/50"
                            : "border-[#E4DACB] bg-[#FAF7F2] hover:border-[#C85A32]"
                        } disabled:cursor-default disabled:opacity-80`}
                      >
                        <div
                          className="pointer-events-none absolute inset-y-0 left-0 bg-[#1E4635]/10 transition-all"
                          style={{ width: `${opt.percentage}%` }}
                        />
                        <div className="relative flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {opt.viewerVoted && (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1E4635]" />
                            )}
                            <div>
                              <span className="text-sm font-semibold text-[#191715]">
                                {opt.label}
                              </span>
                              {opt.note && (
                                <span className="block text-xs text-[#645C52]">{opt.note}</span>
                              )}
                            </div>
                          </div>
                          <span className="font-mono-label shrink-0 text-xs font-bold text-[#191715]">
                            {opt.voteCount} ({opt.percentage}%)
                          </span>
                        </div>
                        {opt.voters.length > 0 && (
                          <div className="relative mt-2 flex flex-wrap gap-1">
                            {opt.voters.map((v) => (
                              <span
                                key={v.attendeeId}
                                className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-[#645C52]"
                              >
                                {v.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
