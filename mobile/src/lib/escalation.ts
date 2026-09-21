/**
 * The escalation ladder, as the app reads it.
 *
 *   GAPS = settings.plan            // [7, 4, 3, 2, 1], then the last forever
 *   step = min(remindersSent, GAPS.length - 1)
 *   gap  = GAPS[step]
 *   next = max(0, gap - daysSince(lastReminderAt ?? assignedAt))
 *
 * The same arithmetic runs in the scheduled Cloud Function that actually
 * sends. If the two ever disagree, the countdown on the board is a lie — so
 * both sides read the gaps from settings/global and neither hard-codes them.
 *
 * Pure: no Firebase, no tokens, no React. Unit tested.
 */

import type { Task } from "./model";

/** Whole calendar days between two dates, ignoring the time of day. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/** The step this task is on, capped at the last rung of the ladder. */
export function stepOf(remindersSent: number, plan: readonly number[]): number {
  const sent = Math.max(0, Math.trunc(remindersSent) || 0);
  return Math.min(sent, Math.max(plan.length - 1, 0));
}

/** Days that should pass before the next reminder. */
export function gapFor(remindersSent: number, plan: readonly number[]): number {
  if (plan.length === 0) return 1;
  return plan[stepOf(remindersSent, plan)];
}

/**
 * Days since the last reminder — or since the task was assigned, if none has
 * gone out yet. That is the clock the first 7-day gap runs against.
 */
export function daysSinceLastReminder(task: Task, now: Date): number {
  const from = task.lastReminderAt ?? task.assignedAt;
  if (!from) return 0;
  return Math.max(0, daysBetween(from, now));
}

/** Days until the next reminder. 0 means it goes out in today's run. */
export function daysUntilNextReminder(
  task: Task,
  plan: readonly number[],
  now: Date
): number {
  return Math.max(0, gapFor(task.remindersSent, plan) - daysSinceLastReminder(task, now));
}

/**
 * Days until due. Negative is overdue, which is how the board sorts and how
 * the stat cell counts.
 */
export function daysUntilDue(task: Task, now: Date): number {
  if (!task.dueDate) return 0;
  return daysBetween(now, task.dueDate);
}

export function isOverdue(task: Task, now: Date): boolean {
  return !task.done && daysUntilDue(task, now) < 0;
}

/** "4d overdue" · "due today" · "due in 3d" */
export function dueLabel(task: Task, now: Date): string {
  const due = daysUntilDue(task, now);
  if (due < 0) return `${Math.abs(due)}d overdue`;
  if (due === 0) return "due today";
  return `due in ${due}d`;
}

/**
 * The date the work is due, written out.
 *
 * "due in 7d" is the right thing to tell an admin deciding who to chase
 * today. It is the wrong thing to tell the person who has to do the work:
 * they need to know which day, because that is what they plan around, and a
 * countdown makes them compute a date every time they look.
 *
 * Lateness is still said, because a deadline that has passed silently is
 * worse than a countdown.
 */
export function deadlineLabel(task: Task, now: Date): string {
  if (!task.dueDate) return "No deadline set";
  const when = shortDate(task.dueDate);
  const due = daysUntilDue(task, now);
  if (due < 0) return `Submission deadline: ${when} · ${Math.abs(due)}d late`;
  return `Submission deadline: ${when}`;
}

/**
 * "Mon, 28 Sep". Built from fixed names rather than toLocaleDateString,
 * because ICU data differs between devices — en-GB renders "Sept" on some
 * Android builds and "Sep" on others, and a date that changes shape
 * depending on the phone is a date somebody will misread.
 */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export function shortDate(date: Date): string {
  return `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** How often reminders are going out at this step, in words. */
export function cadenceLabel(remindersSent: number, plan: readonly number[]): string {
  const gap = gapFor(remindersSent, plan);
  if (gap === 1) return "daily";
  if (gap === 7) return "weekly";
  return `every ${gap} days`;
}

/** "Reminder #4 today · daily" — the countdown chip. */
export function countdownLabel(task: Task, plan: readonly number[], now: Date): string {
  if (task.done) return "Complete — no further reminders";
  const next = daysUntilNextReminder(task, plan, now);
  const when = next === 0 ? "today" : next === 1 ? "tomorrow" : `in ${next} days`;
  return `Reminder #${task.remindersSent + 1} ${when} · ${cadenceLabel(task.remindersSent, plan)}`;
}

/** "4d overdue · reminder #4 in 0d" — the row note in episode detail. */
export function rowNote(task: Task, plan: readonly number[], now: Date): string {
  if (task.done) return "closed";
  const next = daysUntilNextReminder(task, plan, now);
  return `${dueLabel(task, now)} · reminder #${task.remindersSent + 1} in ${next}d`;
}

/**
 * The member app's note chip: the date they are working to, and when the app
 * will next nudge them about it.
 */
export function memberNote(task: Task, plan: readonly number[], now: Date): string {
  if (task.done) return "Closed — thanks";
  const next = daysUntilNextReminder(task, plan, now);
  return `${deadlineLabel(task, now)} · next reminder ${next === 0 ? "today" : `in ${next}d`}`;
}

/**
 * Needs chasing order: the most escalated first, then the most overdue.
 * Returns a new array.
 */
export function byChaseOrder(tasks: readonly Task[], now: Date): Task[] {
  return [...tasks].sort(
    (a, b) => b.remindersSent - a.remindersSent || daysUntilDue(a, now) - daysUntilDue(b, now)
  );
}
