/**
 * Questions an admin can ask of what has been paid.
 *
 * "Who did we pay most in the last three months", "the top three last month",
 * "which episode cost most in August" — all the same shape: pick a measure,
 * group by something, over a period, and show the top few. The answers come
 * from the paid payments in that period, added up here.
 *
 * Firestore can sum a column but cannot group by one, so this is the part it
 * cannot do. The read behind it is bounded — see `usePaidBetween` in data.ts.
 *
 * "Paid" means the figure an admin agreed (`finalAmount`) on the day it was
 * marked paid (`paidAt`), the same as the month-by-month chart. Work settled
 * from an advance counts: it is money that person earned. Advances themselves
 * do not — they are a loan against work, not a payment for it.
 *
 * Pure: no React, no Firebase. Unit tested.
 */

import { lastMonths, monthLong, monthRange, monthSlotOf, type MonthSlot } from "./months.ts";
import type { Payment } from "./payments.ts";

export type InsightMeasure = "total" | "count" | "largest";
export type InsightGroup = "person" | "episode" | "taskType";

export type InsightPeriod =
  /** The last `months` calendar months, this one included. */
  | { kind: "recent"; months: number }
  /** The calendar month before this one. */
  | { kind: "lastMonth" }
  /** One calendar month the admin picked. */
  | { kind: "month"; slot: MonthSlot };

export const MEASURES: { value: InsightMeasure; label: string }[] = [
  { value: "total", label: "Total paid" },
  { value: "count", label: "No. of payments" },
  { value: "largest", label: "Biggest payment" },
];

export const GROUPS: { value: InsightGroup; label: string }[] = [
  { value: "person", label: "Person" },
  { value: "episode", label: "Episode" },
  { value: "taskType", label: "Task type" },
];

/** The quick periods. "Pick a month" sits after these, in the panel. */
export const PERIODS: { label: string; period: InsightPeriod }[] = [
  { label: "This month", period: { kind: "recent", months: 1 } },
  { label: "Last month", period: { kind: "lastMonth" } },
  { label: "Last 3 months", period: { kind: "recent", months: 3 } },
  { label: "Last 6 months", period: { kind: "recent", months: 6 } },
  { label: "Last 12 months", period: { kind: "recent", months: 12 } },
];

export const TOP_CHOICES = [3, 5, 10] as const;

export function samePeriod(a: InsightPeriod, b: InsightPeriod): boolean {
  if (a.kind === "recent" && b.kind === "recent") return a.months === b.months;
  if (a.kind === "month" && b.kind === "month") {
    return a.slot.year === b.slot.year && a.slot.month === b.slot.month;
  }
  return a.kind === b.kind;
}

/**
 * The half-open range a period covers, in the device's own time — the same
 * boundaries the chart draws, so the two never disagree about a month.
 */
export function periodRange(period: InsightPeriod, now: Date): { start: Date; end: Date } {
  if (period.kind === "month") return monthRange(period.slot);
  if (period.kind === "lastMonth") {
    return monthRange(monthSlotOf(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
  }
  const months = lastMonths(now, Math.max(1, period.months));
  return {
    start: monthRange(months[0]).start,
    end: monthRange(months[months.length - 1]).end,
  };
}

/** "Last 3 months", "August 2026". */
export function periodLabel(period: InsightPeriod, now: Date): string {
  if (period.kind === "month") return monthLong(period.slot);
  if (period.kind === "lastMonth") {
    return `Last month (${monthLong(monthSlotOf(new Date(now.getFullYear(), now.getMonth() - 1, 1)))})`;
  }
  return period.months === 1 ? "This month" : `Last ${period.months} months`;
}

export interface InsightRow {
  /** A uid, an episode id or a task type, depending on the grouping. */
  key: string;
  /** What is being ranked on: rupees, or a count. */
  value: number;
  /** How many payments are behind the figure. */
  count: number;
  /** Everything paid to this group, whatever the measure. */
  total: number;
}

export interface InsightResult {
  rows: InsightRow[];
  /** How many groups there were before the top few were taken. */
  groups: number;
  /** Everything paid in the period. */
  total: number;
  payments: number;
}

function keyOf(payment: Payment, group: InsightGroup): string {
  if (group === "person") return payment.uid;
  if (group === "episode") return payment.episodeId;
  return payment.taskType.trim() || "Other";
}

/**
 * Group, measure, rank, and keep the top `top`.
 *
 * Ties go to whoever has more payments behind them, then alphabetically by
 * key, so the same question asked twice gives the same order.
 */
export function rankPayments(
  payments: readonly Payment[],
  measure: InsightMeasure,
  group: InsightGroup,
  top: number
): InsightResult {
  const groups = new Map<string, InsightRow>();
  let total = 0;

  for (const payment of payments) {
    const amount = payment.finalAmount ?? 0;
    total += amount;
    const key = keyOf(payment, group);
    const row = groups.get(key) ?? { key, value: 0, count: 0, total: 0 };
    row.count += 1;
    row.total += amount;
    row.value =
      measure === "total" ? row.total : measure === "count" ? row.count : Math.max(row.value, amount);
    groups.set(key, row);
  }

  const rows = [...groups.values()].sort(
    (a, b) => b.value - a.value || b.count - a.count || a.key.localeCompare(b.key)
  );

  return { rows: rows.slice(0, Math.max(0, top)), groups: rows.length, total, payments: payments.length };
}
