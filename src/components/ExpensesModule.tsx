"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Plus, Receipt, Trash2 } from "lucide-react";
import type { HydratedRoomData } from "@/lib/room-data";
import { formatCurrency } from "@/lib/settlement";

interface ExpensesModuleProps {
  slug: string;
  attendees: HydratedRoomData["attendees"];
  expenses: HydratedRoomData["expenses"];
  viewerId: string | null;
  isHost: boolean;
  onMutate: () => Promise<void>;
}

export function ExpensesModule({
  slug,
  attendees,
  expenses,
  viewerId,
  isHost,
  onMutate,
}: ExpensesModuleProps) {
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [paidById, setPaidById] = useState(viewerId ?? attendees[0]?.id ?? "");
  const [category, setCategory] = useState("shared");
  const [selectedIds, setSelectedIds] = useState<string[]>(() => attendees.map((a) => a.id));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openForm() {
    setPaidById(viewerId ?? attendees[0]?.id ?? "");
    setSelectedIds(attendees.map((a) => a.id));
    setShowForm(true);
    setError(null);
  }

  function toggleParticipant(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedDollars = Number(amountInput);
    const amountCents = Math.round(parsedDollars * 100);
    if (!Number.isFinite(parsedDollars) || amountCents <= 0) {
      setError("Enter a valid positive dollar amount.");
      return;
    }

    if (selectedIds.length === 0) {
      setError("Select at least one person to split this expense.");
      return;
    }

    setBusyId("create");
    try {
      const res = await fetch(`/api/events/${slug}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          amountCents,
          paidById,
          category,
          participantIds: selectedIds,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to log expense.");
        return;
      }
      setDescription("");
      setAmountInput("");
      setShowForm(false);
      await onMutate();
    } catch {
      setError("Network error while logging expense.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(expenseId: string) {
    setError(null);
    setBusyId(expenseId);
    try {
      const res = await fetch(`/api/events/${slug}/expenses/${expenseId}`, {
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
          <h3 className="text-lg font-bold text-[#191715]">Split-the-Tab</h3>
          <p className="text-xs text-[#645C52]">
            Log shared costs and compute the minimal number of settlement transfers.
          </p>
        </div>

        {viewerId && (
          <button
            type="button"
            onClick={() => (showForm ? setShowForm(false) : openForm())}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#1E4635] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#153326]"
          >
            <Plus className="h-3.5 w-3.5" />
            {showForm ? "Cancel" : "Log Shared Expense"}
          </button>
        )}
      </div>

      {/* Minimal Settlement Summary Card */}
      <div className="rounded-2xl border border-[#D9CEBE] bg-[#EAF2ED]/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#1E4635]">
              Minimal Settlement Plan
            </span>
            <p className="mt-0.5 text-xs text-[#645C52]">
              Group total logged:{" "}
              <strong className="text-[#191715]">
                {formatCurrency(expenses.totalSpentCents)}
              </strong>
            </p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#1E4635]">
            {expenses.settlements.length}{" "}
            {expenses.settlements.length === 1 ? "transfer" : "transfers"} needed
          </span>
        </div>

        {expenses.settlements.length === 0 ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-[#1E4635]">
            <CheckCircle2 className="h-4 w-4" />
            Everyone is completely squared up!
          </div>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {expenses.settlements.map((transfer, idx) => (
              <div
                key={`${transfer.fromId}_${transfer.toId}_${idx}`}
                data-testid="settlement-transfer"
                className="flex items-center justify-between gap-2 rounded-xl border border-[#CFE0D5] bg-white px-3.5 py-2.5 text-sm"
              >
                <div className="flex items-center gap-1.5 font-medium text-[#191715]">
                  <span>{transfer.fromName}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[#C85A32]" />
                  <span>{transfer.toName}</span>
                </div>
                <span className="font-mono-label font-bold text-[#1E4635]">
                  {formatCurrency(transfer.amountCents)}
                </span>
              </div>
            ))}
          </div>
        )}

        {expenses.netBalances.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {expenses.netBalances.map((bal) => (
              <span
                key={bal.attendeeId}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  bal.netCents > 0
                    ? "bg-white text-[#1E4635]"
                    : bal.netCents < 0
                      ? "bg-[#FBEAE3] text-[#9B3614]"
                      : "bg-white/70 text-[#645C52]"
                }`}
              >
                {bal.name}:{" "}
                {bal.netCents > 0
                  ? `+${formatCurrency(bal.netCents)}`
                  : formatCurrency(bal.netCents)}
              </span>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-[#D9CEBE] bg-[#FAF7F2] p-4"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-[#645C52]">
                What was it for? *
              </span>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Campfire groceries & firewood"
                className="w-full rounded-xl border border-[#D9CEBE] bg-white px-3 py-2 text-sm text-[#191715] focus:border-[#1E4635] focus:outline-none"
              />
            </label>

            <label>
              <span className="mb-1 block text-xs font-medium text-[#645C52]">
                Amount (USD) *
              </span>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="48.00"
                className="w-full rounded-xl border border-[#D9CEBE] bg-white px-3 py-2 text-sm text-[#191715] focus:border-[#1E4635] focus:outline-none"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-xs font-medium text-[#645C52]">Paid By</span>
              <select
                value={paidById}
                onChange={(e) => setPaidById(e.target.value)}
                className="w-full rounded-xl border border-[#D9CEBE] bg-white px-3 py-2 text-sm text-[#191715] focus:border-[#1E4635] focus:outline-none"
              >
                {attendees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-xs font-medium text-[#645C52]">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-[#D9CEBE] bg-white px-3 py-2 text-sm text-[#191715] focus:border-[#1E4635] focus:outline-none"
              >
                <option value="shared">Shared</option>
                <option value="food">Food & Drinks</option>
                <option value="stay">Lodging</option>
                <option value="transport">Gas & Transit</option>
                <option value="activity">Tickets & Gear</option>
              </select>
            </label>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-[#645C52]">Split Evenly Among</span>
              <button
                type="button"
                onClick={() => setSelectedIds(attendees.map((a) => a.id))}
                className="text-xs font-semibold text-[#1E4635] hover:underline"
              >
                Select Everyone
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {attendees.map((a) => {
                const checked = selectedIds.includes(a.id);
                return (
                  <label
                    key={a.id}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                      checked
                        ? "border-[#1E4635] bg-[#EAF2ED] text-[#1E4635]"
                        : "border-[#D9CEBE] bg-white text-[#645C52]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleParticipant(a.id)}
                      className="accent-[#1E4635]"
                    />
                    {a.name}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busyId === "create"}
              className="rounded-xl bg-[#1E4635] px-4 py-2 text-xs font-semibold text-white hover:bg-[#153326] disabled:opacity-60"
            >
              {busyId === "create" ? "Saving…" : "Save Expense"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="rounded-xl border border-[#F2C6B6] bg-[#FBEAE3] px-3 py-2 text-xs font-medium text-[#9B3614]">
          {error}
        </p>
      )}

      {expenses.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D9CEBE] bg-[#FAF7F2] p-8 text-center">
          <p className="text-sm font-medium text-[#191715]">No shared expenses logged yet.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {expenses.items.map((exp) => {
            const canDelete = Boolean(viewerId && (isHost || exp.paidById === viewerId));
            return (
              <div
                key={exp.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E4DACB] bg-white px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-[#FAF7F2] text-[#C85A32]">
                    <Receipt className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[#191715]">{exp.description}</span>
                      <span className="rounded-full bg-[#F3EDE2] px-2 py-0.5 text-[11px] font-medium uppercase text-[#645C52]">
                        {exp.category}
                      </span>
                    </div>
                    <p className="text-xs text-[#645C52]">
                      Paid by <strong className="text-[#191715]">{exp.paidByName}</strong> · split{" "}
                      {exp.participants.length} ways (
                      {exp.participants.map((p) => p.name).join(", ")})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono-label text-sm font-bold text-[#191715]">
                    {formatCurrency(exp.amountCents)}
                  </span>
                  {canDelete && (
                    <button
                      type="button"
                      aria-label={`Delete expense ${exp.description}`}
                      disabled={busyId === exp.id}
                      onClick={() => void handleDelete(exp.id)}
                      className="rounded-lg p-1.5 text-[#645C52] hover:bg-[#FBEAE3] hover:text-[#9B3614]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
