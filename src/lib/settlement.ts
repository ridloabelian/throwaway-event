export interface ExpenseInput {
  paidById: string;
  amountCents: number;
  shares: Array<{
    attendeeId: string;
    shareCents: number;
  }>;
}

export interface AttendeeRef {
  id: string;
  name: string;
}

export interface NetBalance {
  attendeeId: string;
  name: string;
  paidCents: number;
  shareCents: number;
  netCents: number;
}

export interface SettlementTransfer {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amountCents: number;
  summary: string;
}

/**
 * Formats integer cents as a clean USD display string (e.g., `$18` or `$18.50`).
 */
export function formatCurrency(cents: number): string {
  const abs = Math.abs(cents);
  const sign = cents < 0 ? "-" : "";
  if (abs % 100 === 0) {
    return `${sign}$${abs / 100}`;
  }
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

/**
 * Splits an integer amount in cents across participants so shares always sum exactly
 * to `amountCents`. Remainder cents are assigned deterministically to the first participants.
 */
export function splitAmountEvenly(
  amountCents: number,
  participantIds: string[],
): Record<string, number> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("amountCents must be a positive integer");
  }

  const uniqueIds = Array.from(new Set(participantIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) {
    throw new Error("At least one participant is required");
  }

  const baseShare = Math.floor(amountCents / uniqueIds.length);
  const remainder = amountCents % uniqueIds.length;
  const result: Record<string, number> = {};

  uniqueIds.forEach((id, idx) => {
    result[id] = baseShare + (idx < remainder ? 1 : 0);
  });

  return result;
}

/**
 * Computes each attendee's total paid, total fair share, and net balance (`paid - share`).
 */
export function computeNetBalances(
  expenses: ExpenseInput[],
  attendees: AttendeeRef[],
): NetBalance[] {
  const paidByAttendee = new Map<string, number>();
  const shareByAttendee = new Map<string, number>();

  for (const attendee of attendees) {
    paidByAttendee.set(attendee.id, 0);
    shareByAttendee.set(attendee.id, 0);
  }

  for (const expense of expenses) {
    paidByAttendee.set(
      expense.paidById,
      (paidByAttendee.get(expense.paidById) ?? 0) + expense.amountCents,
    );

    for (const share of expense.shares) {
      shareByAttendee.set(
        share.attendeeId,
        (shareByAttendee.get(share.attendeeId) ?? 0) + share.shareCents,
      );
    }
  }

  return attendees.map((attendee) => {
    const paidCents = paidByAttendee.get(attendee.id) ?? 0;
    const shareCents = shareByAttendee.get(attendee.id) ?? 0;
    return {
      attendeeId: attendee.id,
      name: attendee.name,
      paidCents,
      shareCents,
      netCents: paidCents - shareCents,
    };
  });
}

function greedySettleComponent(balances: NetBalance[]): SettlementTransfer[] {
  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ id: b.attendeeId, name: b.name, amount: b.netCents }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ id: b.attendeeId, name: b.name, amount: -b.netCents }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const transfers: SettlementTransfer[] = [];
  let cIdx = 0;
  let dIdx = 0;

  while (cIdx < creditors.length && dIdx < debtors.length) {
    const creditor = creditors[cIdx];
    const debtor = debtors[dIdx];
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0) {
      transfers.push({
        fromId: debtor.id,
        fromName: debtor.name,
        toId: creditor.id,
        toName: creditor.name,
        amountCents: amount,
        summary: `${debtor.name} pays ${creditor.name} ${formatCurrency(amount)}`,
      });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0) cIdx += 1;
    if (debtor.amount === 0) dIdx += 1;
  }

  return transfers;
}

function exactOptimalSettlement(active: NetBalance[]): SettlementTransfer[] {
  const n = active.length;
  const fullMask = (1 << n) - 1;
  const subsetSum = new Int32Array(1 << n);

  for (let mask = 1; mask <= fullMask; mask++) {
    const lsbBit = mask & -mask;
    const idx = Math.clz32(lsbBit) ^ 31;
    subsetSum[mask] = subsetSum[mask ^ lsbBit] + active[idx].netCents;
  }

  const dp = new Int16Array(1 << n);
  const choice = new Int32Array(1 << n);
  dp.fill(-1);
  dp[0] = 0;

  for (let mask = 1; mask <= fullMask; mask++) {
    if (subsetSum[mask] !== 0) continue;

    dp[mask] = 1;
    choice[mask] = mask;

    const lsbBit = mask & -mask;
    // Iterate submasks containing lsbBit to avoid symmetric duplicate partitions.
    for (let sub = (mask - 1) & mask; sub > 0; sub = (sub - 1) & mask) {
      if ((sub & lsbBit) === 0) continue;
      if (subsetSum[sub] !== 0) continue;
      const rest = mask ^ sub;
      if (dp[rest] <= 0) continue;
      const candidate = 1 + dp[rest];
      if (candidate > dp[mask]) {
        dp[mask] = candidate;
        choice[mask] = sub;
      }
    }
  }

  if (dp[fullMask] <= 0) {
    return greedySettleComponent(active);
  }

  const transfers: SettlementTransfer[] = [];
  let remaining = fullMask;
  while (remaining !== 0) {
    const part = choice[remaining];
    const component: NetBalance[] = [];
    for (let i = 0; i < n; i++) {
      if ((part & (1 << i)) !== 0) {
        component.push(active[i]);
      }
    }
    transfers.push(...greedySettleComponent(component));
    remaining ^= part;
  }

  return transfers;
}

function largeGroupSettlement(active: NetBalance[]): SettlementTransfer[] {
  const transfers: SettlementTransfer[] = [];
  const remaining = active.map((b) => ({ ...b }));

  // First match exact equal-and-opposite balances to reduce edge count.
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].netCents === 0) continue;
    for (let j = i + 1; j < remaining.length; j++) {
      if (remaining[j].netCents === 0) continue;
      if (remaining[i].netCents + remaining[j].netCents === 0) {
        const creditor = remaining[i].netCents > 0 ? remaining[i] : remaining[j];
        const debtor = remaining[i].netCents < 0 ? remaining[i] : remaining[j];
        const amount = creditor.netCents;
        transfers.push({
          fromId: debtor.attendeeId,
          fromName: debtor.name,
          toId: creditor.attendeeId,
          toName: creditor.name,
          amountCents: amount,
          summary: `${debtor.name} pays ${creditor.name} ${formatCurrency(amount)}`,
        });
        creditor.netCents = 0;
        debtor.netCents = 0;
        break;
      }
    }
  }

  const leftover = remaining.filter((b) => b.netCents !== 0);
  transfers.push(...greedySettleComponent(leftover));
  return transfers;
}

/**
 * Computes the minimal set of settlement transfers that clears all balances.
 * Uses exact zero-sum subset partitioning for up to 14 active participants.
 */
export function computeMinimalSettlements(
  expenses: ExpenseInput[],
  attendees: AttendeeRef[],
): SettlementTransfer[] {
  const balances = computeNetBalances(expenses, attendees);
  const active = balances.filter((b) => b.netCents !== 0);

  if (active.length === 0) {
    return [];
  }

  const totalNet = active.reduce((acc, b) => acc + b.netCents, 0);
  if (totalNet !== 0) {
    throw new Error(`Expenses are unbalanced by ${totalNet} cents`);
  }

  const transfers =
    active.length <= 14 ? exactOptimalSettlement(active) : largeGroupSettlement(active);

  return transfers.sort(
    (a, b) =>
      b.amountCents - a.amountCents ||
      a.fromName.localeCompare(b.fromName) ||
      a.toName.localeCompare(b.toName),
  );
}
