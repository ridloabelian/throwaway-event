"use client";

import { useState } from "react";
import { KeyRound, Lock, Sparkles, UserCheck } from "lucide-react";

interface JoinGateProps {
  slug: string;
  eventTitle: string;
  hasPin: boolean;
  isDemo: boolean;
  lockedMode?: boolean;
  onSuccess: () => Promise<void> | void;
}

export function JoinGate({
  slug,
  eventTitle,
  hasPin,
  isDemo,
  lockedMode = false,
  onSuccess,
}: JoinGateProps) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [hostPasskey, setHostPasskey] = useState("");
  const [showHostMode, setShowHostMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitJoin(payload: Record<string, unknown>) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/events/${slug}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Unable to enter event room.");
        return;
      }
      setPin("");
      setHostPasskey("");
      await onSuccess();
    } catch {
      setError("Network error while joining room.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (showHostMode) {
      void submitJoin({ hostPasskey: hostPasskey.trim(), name: name.trim() || undefined });
      return;
    }
    void submitJoin({
      name: name.trim(),
      pin: hasPin ? pin.trim() : undefined,
    });
  }

  return (
    <div
      className={`rounded-2xl border border-[#E4DACB] bg-white ${
        lockedMode ? "p-6 shadow-sm sm:p-8" : "p-4 sm:p-5"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {lockedMode ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FBEAE3] text-[#C85A32]">
              <Lock className="h-4 w-4" />
            </span>
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EAF2ED] text-[#1E4635]">
              <UserCheck className="h-4 w-4" />
            </span>
          )}
          <div>
            <h2 className="text-base font-semibold text-[#191715]">
              {lockedMode
                ? `Enter ${eventTitle}`
                : "Drop your first name to RSVP, vote, split tabs & share photos"}
            </h2>
            <p className="text-xs text-[#645C52]">
              {lockedMode
                ? "Zero accounts needed — just your first name and the room PIN."
                : "Zero signup. Saved only in a signed cookie scoped to this event."}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowHostMode((prev) => !prev);
            setError(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4DACB] px-2.5 py-1.5 text-xs font-medium text-[#645C52] hover:bg-[#FAF7F2]"
        >
          <KeyRound className="h-3.5 w-3.5" />
          {showHostMode ? "Join as Guest" : "Host Passkey"}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {!showHostMode ? (
          <>
            <label className="flex-1">
              <span className="mb-1 block text-xs font-medium text-[#645C52]">
                First Name
              </span>
              <input
                type="text"
                required
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jordan"
                className="w-full rounded-xl border border-[#D9CEBE] bg-[#FAF7F2] px-3.5 py-2 text-sm text-[#191715] focus:border-[#1E4635] focus:bg-white focus:outline-none"
              />
            </label>

            {hasPin && (
              <label className="sm:w-44">
                <span className="mb-1 block text-xs font-medium text-[#645C52]">
                  Room PIN
                </span>
                <input
                  type="password"
                  required
                  maxLength={24}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Shared PIN"
                  className="w-full rounded-xl border border-[#D9CEBE] bg-[#FAF7F2] px-3.5 py-2 text-sm text-[#191715] focus:border-[#1E4635] focus:bg-white focus:outline-none"
                />
              </label>
            )}
          </>
        ) : (
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium text-[#645C52]">
              Host Passkey (reclaims host ZIP export & moderation powers)
            </span>
            <input
              type="text"
              required
              value={hostPasskey}
              onChange={(e) => setHostPasskey(e.target.value)}
              placeholder="e.g. ABCD-1234"
              className="font-mono-label w-full rounded-xl border border-[#D9CEBE] bg-[#FAF7F2] px-3.5 py-2 text-sm uppercase text-[#191715] focus:border-[#1E4635] focus:bg-white focus:outline-none"
            />
          </label>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-[#1E4635] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#153326] disabled:opacity-60"
        >
          {submitting ? "Entering…" : showHostMode ? "Claim Host Access" : "Enter Room"}
        </button>
      </form>

      {isDemo && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#EFE7DA] pt-3">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#645C52]">
            <Sparkles className="h-3.5 w-3.5 text-[#C85A32]" />
            Demo shortcuts:
          </span>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitJoin({ demoRole: "host" })}
            className="rounded-lg bg-[#EAF2ED] px-3 py-1 text-xs font-semibold text-[#1E4635] hover:bg-[#DCE9E1]"
          >
            Enter as Maya (Host)
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitJoin({ demoRole: "guest" })}
            className="rounded-lg bg-[#F3EDE2] px-3 py-1 text-xs font-semibold text-[#191715] hover:bg-[#E7DEC9]"
          >
            Enter as Jordan (Guest)
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-[#F2C6B6] bg-[#FBEAE3] px-3 py-2 text-xs font-medium text-[#9B3614]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
