/**
 * Payments by month: the arithmetic behind the admin's bar chart.
 *
 * The screen this feeds used to subscribe to the whole `payments` collection
 * and add it up on the phone. That is fine in the first month and worse every
 * month after — the cost of opening the Payments tab grows with the number of
 * payments the operation has ever made, which is exactly backwards.
 *
 * So the screen asks three bounded questions instead, and this module holds the
 * month arithmetic all three need:
 *
 *   how much is owed right now   →  the pending payments, which are bounded by
 *                                   the work in flight, not by history
 *   what went out each month     →  one aggregation query per bar: a sum and a
 *                                   count, never the documents
 *   what made up this month      →  the documents, for one month, on demand
 *
 * Months are the device's own months. Whoever reads this is looking at a
 * calendar on a wall in Dhaka, and a boundary drawn in UTC would put the
 * evening of the 31st in the wrong bar.
 *
 * The month arithmetic itself lives in months.ts — the Episodes screen needed
 * the same filter — and is re-exported here so nothing that already imports it
 * from this module has to move.
 *
 * Pure: no Firebase, no React. Unit tested.
 */

export {
  lastMonths,
  MONTHS_SHOWN,
  monthKey,
  monthLong,
  monthRange,
  monthShort,
  monthSlotOf,
  monthsOfYear,
  sameMonth,
  yearsFrom,
  type MonthSlot,
} from "./months.ts";

import {
  monthKey,
  monthLong,
  monthShort,
  sameMonth,
  type MonthSlot,
} from "./months.ts";

export interface MonthTotal extends MonthSlot {
  /** Rupees actually paid. */
  total: number;
  /** How many payments made it up. */
  count: number;
}

// ---------------------------------------------------------------------------
// The bars
// ---------------------------------------------------------------------------

export interface MonthBar extends MonthTotal {
  key: string;
  label: string;
  /** Pixels, already scaled against the tallest bar in the set. */
  height: number;
  /** No money in this month at all — drawn as a stub, not as nothing. */
  empty: boolean;
}

/**
 * Bar heights, scaled to the tallest month in view.
 *
 * Scaled against the set rather than against a fixed ceiling, because the
 * question this chart answers is "which months were heavy" — a shape only
 * visible when the biggest month reaches the top. The axis carries the figure
 * that makes the scale readable.
 *
 * A month with nothing in it gets `EMPTY_BAR` rather than zero: a bar of no
 * height is indistinguishable from a month the chart forgot to draw, and
 * "nobody was paid in July" is a fact worth being able to see.
 */
export const EMPTY_BAR = 2;

export function barsFrom(
  totals: readonly MonthTotal[],
  maxHeight: number,
  minHeight: number = 4
): MonthBar[] {
  const peak = Math.max(0, ...totals.map((t) => t.total));
  return totals.map((t) => {
    const empty = t.total <= 0;
    const scaled = peak > 0 ? Math.round((t.total / peak) * maxHeight) : 0;
    return {
      ...t,
      key: monthKey(t),
      label: monthShort(t),
      height: empty ? EMPTY_BAR : Math.max(minHeight, scaled),
      empty,
    };
  });
}

/** The tallest month, which is the one bar that gets a direct label. */
export function busiestMonth(totals: readonly MonthTotal[]): MonthTotal | null {
  let best: MonthTotal | null = null;
  for (const t of totals) {
    if (t.total > 0 && (!best || t.total > best.total)) best = t;
  }
  return best;
}

export function sumOf(totals: readonly MonthTotal[]): number {
  return totals.reduce((sum, t) => sum + t.total, 0);
}

export function countOf(totals: readonly MonthTotal[]): number {
  return totals.reduce((sum, t) => sum + t.count, 0);
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** The panel's own line: what is owed, and to how many people's work. */
export function pendingSummary(count: number, amount: string): string {
  if (count === 0) return "Nothing waiting to be paid";
  return `${count} ${count === 1 ? "payment" : "payments"} waiting · ${amount} estimated`;
}

/** What the chart says it is showing, under its heading. */
export function rangeLabel(months: readonly MonthSlot[]): string {
  if (months.length === 0) return "No months to show";
  const first = months[0];
  const last = months[months.length - 1];
  if (sameMonth(first, last)) return monthLong(first);
  return `${monthShort(first)} ${first.year} — ${monthShort(last)} ${last.year}`;
}

/** The month's own list heading: "September 2026 · 4 payments · ₹3,120". */
export function monthSummary(slot: MonthSlot, count: number, amount: string): string {
  if (count === 0) return `${monthLong(slot)} · nothing paid`;
  return `${monthLong(slot)} · ${count} ${count === 1 ? "payment" : "payments"} · ${amount}`;
}
