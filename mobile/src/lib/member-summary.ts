/**
 * What a member's own screen has to answer, at a glance.
 *
 * Before this the home screen was a list of tasks, which answers "what next"
 * and nothing else. The questions somebody actually opens the app with are
 * how much is outstanding, how much has been accepted, and what they have
 * been paid — and none of those could be read without scrolling and counting.
 *
 * Everything here is counted from the snapshot on screen. Nothing is stored:
 * two figures that can disagree are worse than one that has to be derived.
 *
 * Pure: no React, no Firebase. Unit tested.
 */

import type { Task } from "./model.ts";
import { earningsFor, type Payment } from "./payments.ts";

export interface MemberSummary {
  /** Work still owed — open, including anything sent back. */
  pending: number;
  /** Handed in, waiting on an admin. */
  submitted: number;
  /** Accepted, whether or not the money has gone out. */
  approved: number;
  /** Approved and unpaid, at the rates that applied when approved. */
  paymentPending: number;
  /** True when a pending entry has no rate behind it, so the total is partial. */
  paymentPendingPartial: boolean;
  /** Actually paid, in the last 30 days. */
  paidLastMonth: number;
  /** Actually paid, in the last 365 days. */
  paidLastYear: number;
  /** Actually paid, all time. */
  paidAllTime: number;
}

const DAY = 86_400_000;

function paidWithin(payments: readonly Payment[], now: Date, days: number): number {
  const cutoff = now.getTime() - days * DAY;
  return payments
    .filter((p) => p.status === "paid" && (p.paidAt?.getTime() ?? 0) >= cutoff)
    .reduce((sum, p) => sum + (p.finalAmount ?? 0), 0);
}

export function memberSummary(
  tasks: readonly Task[],
  payments: readonly Payment[],
  now: Date
): MemberSummary {
  const earnings = earningsFor(payments);

  return {
    pending: tasks.filter((t) => t.status === "open").length,
    submitted: tasks.filter((t) => t.status === "submitted").length,
    approved: tasks.filter((t) => t.status === "approved" || t.status === "paid").length,
    paymentPending: earnings.pendingEstimate,
    paymentPendingPartial: earnings.pendingIncomplete,
    paidLastMonth: paidWithin(payments, now, 30),
    paidLastYear: paidWithin(payments, now, 365),
    paidAllTime: earnings.paid,
  };
}

// ---------------------------------------------------------------------------
// Six months of work, assigned against handed in
// ---------------------------------------------------------------------------

export interface MonthActivity {
  /** "Apr", for the axis. */
  label: string;
  /** Year and month, so two Aprils never collapse into one column. */
  key: string;
  assigned: number;
  submitted: number;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * The last `count` months, oldest first, counting what was given out against
 * what came back.
 *
 * A task counts in the month it was assigned and, separately, in the month it
 * was submitted — which are often different months, and that gap is the whole
 * point of the chart. Submitted here means handed in at any time: a task
 * approved later was still submitted once.
 *
 * Months with nothing in them are kept. A gap in a bar chart is information;
 * a missing column is a chart that lies about the shape of the year.
 */
export function monthlyActivity(
  tasks: readonly Task[],
  now: Date,
  count = 6
): MonthActivity[] {
  const months: MonthActivity[] = [];
  const index = new Map<string, MonthActivity>();

  for (let back = count - 1; back >= 0; back--) {
    const date = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const entry: MonthActivity = {
      label: MONTHS[date.getMonth()],
      key: `${date.getFullYear()}-${date.getMonth()}`,
      assigned: 0,
      submitted: 0,
    };
    months.push(entry);
    index.set(entry.key, entry);
  }

  const keyOf = (date: Date | null) =>
    date ? `${date.getFullYear()}-${date.getMonth()}` : null;

  for (const task of tasks) {
    const assigned = index.get(keyOf(task.assignedAt) ?? "");
    if (assigned) assigned.assigned += 1;

    const submitted = index.get(keyOf(task.submittedAt) ?? "");
    if (submitted) submitted.submitted += 1;
  }

  return months;
}

/** The tallest column, so every bar can be drawn as a fraction of it. */
export function peakOf(months: readonly MonthActivity[]): number {
  return months.reduce((max, m) => Math.max(max, m.assigned, m.submitted), 0);
}
