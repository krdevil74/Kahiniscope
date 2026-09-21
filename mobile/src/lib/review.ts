/**
 * Handing work in, and what an admin does with it.
 *
 * The old model had one bit: done or not, decided by whoever did the work.
 * That was fine while nobody was being paid for it. Now a task is handed in,
 * looked at, and either sent back or accepted — and only the accepting
 * creates a payment, so the state has to be the server's and the member's
 * "done" has to become "submitted".
 *
 * Rejection is deliberately not a state of its own. A rejected task is open
 * again — it is work somebody still owes — and what makes it different is
 * only that `rejectedAt` is set, which is what turns the escalation ladder
 * into the every-other-day chase below.
 *
 * Pure: no Firebase, no React. Unit tested.
 */

import type { Task, TaskStatus } from "./model.ts";

/**
 * How often a rejected task is chased, in days.
 *
 * It replaces the ladder rather than restarting it. The ladder exists to get
 * work in by a due date; once work has been handed in and sent back, that due
 * date is long past and there is nothing left to escalate towards. What is
 * wanted then is a steady, undramatic tap on the shoulder until it comes
 * back.
 *
 * The same constant exists in functions/src/escalation/decide.ts. They must
 * agree, or the app promises a reminder the job does not send.
 */
export const REJECTED_GAP_DAYS = 2;

export function isRejected(task: Pick<Task, "status" | "rejectedAt">): boolean {
  return task.status === "open" && task.rejectedAt !== null;
}

/** Waiting on an admin. Nobody is chased while a task sits here. */
export function isAwaitingReview(task: Pick<Task, "status">): boolean {
  return task.status === "submitted";
}

/** Accepted, whether or not the money has gone out. */
export function isAccepted(task: Pick<Task, "status">): boolean {
  return task.status === "approved" || task.status === "paid";
}

/** `done` as every screen and the escalation query already understood it. */
export function doneFor(status: TaskStatus): boolean {
  return status === "approved" || status === "paid";
}

/**
 * Days between reminders for this task: the ladder normally, two days flat
 * once it has been sent back.
 */
export function chaseGapFor(
  task: Pick<Task, "status" | "rejectedAt" | "remindersSent">,
  plan: readonly number[],
  ladderGap: (remindersSent: number, plan: readonly number[]) => number
): number {
  if (isRejected(task)) return REJECTED_GAP_DAYS;
  return ladderGap(task.remindersSent, plan);
}

/** Is anybody chased about this task at all? */
export function isChased(task: Pick<Task, "status">): boolean {
  return task.status === "open";
}

// ---------------------------------------------------------------------------
// Groupings
// ---------------------------------------------------------------------------

export function submittedTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter(isAwaitingReview);
}

export function rejectedTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter(isRejected);
}

/**
 * The review queue, oldest submission first. Somebody who handed work in on
 * Monday should not be behind somebody who handed it in this morning.
 */
export function byReviewOrder(tasks: readonly Task[]): Task[] {
  return [...submittedTasks(tasks)].sort(
    (a, b) => (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0)
  );
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** What the member's own button says. */
export function submitLabel(task: Pick<Task, "status" | "rejectedAt">): string {
  if (task.status === "submitted") return "Waiting for review";
  if (isAccepted(task)) return "Approved";
  return isRejected(task) ? "Submit again" : "Submit for review";
}

/** What the member reads under a task that came back. */
export function rejectionLabel(task: Pick<Task, "rejectedCount" | "rejectionNote">): string {
  const note = task.rejectionNote?.trim();
  const times = task.rejectedCount > 1 ? ` (sent back ${task.rejectedCount} times)` : "";
  return note ? `Sent back: ${note}${times}` : `Sent back for changes${times}`;
}

export function statusLabel(task: Pick<Task, "status" | "rejectedAt">): string {
  switch (task.status) {
    case "submitted":
      return "In review";
    case "approved":
      return "Approved · payment pending";
    case "paid":
      return "Paid";
    case "open":
      return isRejected(task) ? "Sent back" : "Open";
  }
}

export function reviewQueueLabel(count: number): string {
  if (count === 0) return "Nothing waiting for review";
  return `${count} ${count === 1 ? "task" : "tasks"} waiting for review`;
}
