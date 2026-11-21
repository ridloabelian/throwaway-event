import { describe, expect, it } from "vitest";
import {
  computeMinimalSettlements,
  computeNetBalances,
  formatCurrency,
  splitAmountEvenly,
} from "@/lib/settlement";

describe("expense splitting and minimal settlement math", () => {
  it("distributes indivisible cents cleanly so shares sum exactly to total", () => {
    const shares = splitAmountEvenly(1000, ["alex", "sam", "jordan"]);
    expect(shares).toEqual({
      alex: 334,
      sam: 333,
      jordan: 333,
    });
    const sum = Object.values(shares).reduce((acc, val) => acc + val, 0);
    expect(sum).toBe(1000);
  });

  it("rejects invalid amounts or empty participants", () => {
    expect(() => splitAmountEvenly(0, ["alex"])).toThrow();
    expect(() => splitAmountEvenly(-500, ["alex"])).toThrow();
    expect(() => splitAmountEvenly(100, [])).toThrow();
  });

  it("computes clean single-transfer settlement with formatted summary", () => {
    const attendees = [
      { id: "alex", name: "Alex" },
      { id: "sam", name: "Sam" },
    ];
    const shares = splitAmountEvenly(3600, ["alex", "sam"]);
    const expenses = [
      {
        paidById: "sam",
        amountCents: 3600,
        shares: Object.entries(shares).map(([attendeeId, shareCents]) => ({
          attendeeId,
          shareCents,
        })),
      },
    ];

    const transfers = computeMinimalSettlements(expenses, attendees);
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({
      fromId: "alex",
      fromName: "Alex",
      toId: "sam",
      toName: "Sam",
      amountCents: 1800,
      summary: "Alex pays Sam $18",
    });
    expect(formatCurrency(1850)).toBe("$18.50");
  });

  it("cancels circular debts to zero transfers", () => {
    const attendees = [
      { id: "a", name: "Alex" },
      { id: "b", name: "Sam" },
      { id: "c", name: "Jordan" },
    ];
    const expenses = [
      {
        paidById: "a",
        amountCents: 2000,
        shares: [{ attendeeId: "b", shareCents: 2000 }],
      },
      {
        paidById: "b",
        amountCents: 2000,
        shares: [{ attendeeId: "c", shareCents: 2000 }],
      },
      {
        paidById: "c",
        amountCents: 2000,
        shares: [{ attendeeId: "a", shareCents: 2000 }],
      },
    ];

    expect(computeMinimalSettlements(expenses, attendees)).toEqual([]);
  });

  it("finds globally minimal transfer count via zero-sum subset partitioning", () => {
    // Pair 1 cancels cleanly in 1 transfer (+30, -30)
    // Trio 2 cancels cleanly in 2 transfers (+25, -15, -10)
    // Total minimal transfers = 3 (naive greedy across largest values often produces 4)
    const attendees = [
      { id: "p1", name: "P1" },
      { id: "p2", name: "P2" },
      { id: "p3", name: "P3" },
      { id: "p4", name: "P4" },
      { id: "p5", name: "P5" },
    ];
    const expenses = [
      {
        paidById: "p1",
        amountCents: 3000,
        shares: [{ attendeeId: "p2", shareCents: 3000 }],
      },
      {
        paidById: "p3",
        amountCents: 2500,
        shares: [
          { attendeeId: "p4", shareCents: 1500 },
          { attendeeId: "p5", shareCents: 1000 },
        ],
      },
    ];

    const balances = computeNetBalances(expenses, attendees);
    const transfers = computeMinimalSettlements(expenses, attendees);

    expect(transfers).toHaveLength(3);

    // Verify money conservation: applying transfers zeroes every attendee's balance
    const netMap = new Map(balances.map((b) => [b.attendeeId, b.netCents]));
    for (const t of transfers) {
      netMap.set(t.fromId, (netMap.get(t.fromId) ?? 0) + t.amountCents);
      netMap.set(t.toId, (netMap.get(t.toId) ?? 0) - t.amountCents);
    }
    for (const val of netMap.values()) {
      expect(val).toBe(0);
    }
  });
});
