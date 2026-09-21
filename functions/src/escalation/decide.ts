/**
 * Who gets chased today.
 *
 * This is the whole escalation rule, with no Firebase in it, so the decision
 * can be tested directly instead of inferred from what the job happened to
 * send.
 *
 *   GAPS = settings.plan            // [7, 4, 3, 2, 1], then the last forever
 *   step = min(remindersSent, GAPS.length - 1)
 *   gap  = GAPS[step]
 *   since = daysBetween(lastReminderAt ?? assignedAt, today)
 *   send if since >= gap
 *
 * The same arithmetic runs in the app (mobile/src/lib/escalation.ts) to draw
 * the countdown. The two are deliberately separate copies — one is a Cloud
 * Function on Node, the other is bundled into an Android app — and they must
 * agree, or the board promises a reminder that never arrives. Both read the
 * gaps from settings/global, and both are unit tested against the same
 * examples.
 *
 * Everything here is in Asia/Dhaka. "Today" means the team's today.
 */

export const TIME_ZONE = "Asia/Dhaka";

export interface QuietHours {
  enabled: boolean;
  /** Hour the quiet window opens, 22 for 10pm. */
  from: number;
  /** Hour it closes, 8 for 8am. */
  to: number;
  /** Hour queued reminders go out instead. */
  sendQueuedAt: number;
}

export interface DueTask {
  id: string;
  assigneeUid: string;
  remindersSent: number;
  lastReminderAt: Date | null;
  assignedAt: Date | null;
  /**
   * Where the work has got to. Only `open` is chased: once it has been handed
   * in, chasing the person who handed it in is chasing the wrong person.
   */
  status?: string;
  /** Set when an admin sent it back. Turns the ladder into a steady tap. */
  rejectedAt?: Date | null;
}

export interface CalendarDay {
  year: number;
  month: number;
  day: number;
  hour: number;
}

/**
 * A date as the team would read it off a wall in Dhaka. Bangladesh has no
 * daylight saving, but this goes through Intl rather than assuming +06:00, so
 * it stays right if that ever changes.
 */
export function dhakaParts(date: Date, timeZone: string = TIME_ZONE): CalendarDay {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // Midnight comes back as hour 24 in some ICU versions.
  const hour = value("hour") % 24;

  return { year: value("year"), month: value("month"), day: value("day"), hour };
}

/** Whole days between two instants, counted in Dhaka calendar days. */
export function daysBetween(from: Date, to: Date, timeZone: string = TIME_ZONE): number {
  const a = dhakaParts(from, timeZone);
  const b = dhakaParts(to, timeZone);
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((utcB - utcA) / 86_400_000);
}

export function sameDhakaDay(a: Date, b: Date, timeZone: string = TIME_ZONE): boolean {
  return daysBetween(a, b, timeZone) === 0;
}

/** The rung this task is on, capped at the last one. */
export function stepOf(remindersSent: number, plan: readonly number[]): number {
  const sent = Math.max(0, Math.trunc(remindersSent) || 0);
  return Math.min(sent, Math.max(plan.length - 1, 0));
}

export function gapFor(remindersSent: number, plan: readonly number[]): number {
  if (plan.length === 0) return 1;
  return plan[stepOf(remindersSent, plan)];
}

/**
 * How often a task that was sent back is chased, in days.
 *
 * The same constant lives in mobile/src/lib/review.ts. They must agree, or
 * the app draws a countdown to a reminder this job does not send.
 */
export const REJECTED_GAP_DAYS = 2;

export function isRejected(task: Pick<DueTask, "status" | "rejectedAt">): boolean {
  return (task.status ?? "open") === "open" && Boolean(task.rejectedAt);
}

/**
 * The gap for this particular task: the ladder normally, a flat two days once
 * it has been sent back.
 *
 * The ladder exists to get work in by a due date. Once work has been handed
 * in and returned, that date is long past and there is nothing left to
 * escalate towards — what is wanted is a steady, undramatic reminder until it
 * comes back.
 */
export function chaseGapFor(task: DueTask, plan: readonly number[]): number {
  if (isRejected(task)) return REJECTED_GAP_DAYS;
  return gapFor(task.remindersSent, plan);
}

/**
 * Inside the quiet window? The window wraps midnight — 22:00 to 08:00 is
 * "late evening or early morning", not "between 22 and 8", which is empty.
 */
export function isQuietHour(now: Date, quiet: QuietHours, timeZone: string = TIME_ZONE): boolean {
  if (!quiet.enabled) return false;
  const { hour } = dhakaParts(now, timeZone);
  const { from, to } = quiet;
  if (from === to) return false;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

export type Decision =
  | { send: true; step: number; daysSince: number }
  | { send: false; reason: "not-open" | "not-due" | "already-sent-today" | "quiet-hours" | "never-started" };

/**
 * Should this task be chased right now?
 *
 * Three reasons not to, and each is named rather than folded into a boolean,
 * because "why did nobody get a reminder this morning" is the question this
 * job will be asked.
 */
export function decide(
  task: DueTask,
  plan: readonly number[],
  now: Date,
  quiet: QuietHours,
  timeZone: string = TIME_ZONE
): Decision {
  // Handed in, accepted or paid: not this person's problem any more. A
  // member who has done the work and is waiting on an admin must not be
  // chased for it.
  if ((task.status ?? "open") !== "open") {
    return { send: false, reason: "not-open" };
  }

  // Safe to run twice in a day: a task already chased today is left alone,
  // whether by this job or by an admin tapping Nudge.
  if (task.lastReminderAt && sameDhakaDay(task.lastReminderAt, now, timeZone)) {
    return { send: false, reason: "already-sent-today" };
  }

  const from = task.lastReminderAt ?? task.assignedAt;
  if (!from) return { send: false, reason: "never-started" };

  const daysSince = daysBetween(from, now, timeZone);
  if (daysSince < chaseGapFor(task, plan)) {
    return { send: false, reason: "not-due" };
  }

  if (isQuietHour(now, quiet, timeZone)) {
    return { send: false, reason: "quiet-hours" };
  }

  return { send: true, step: stepOf(task.remindersSent, plan), daysSince };
}

/** How many days past due, for the message copy. Negative means not yet due. */
export function daysOverdue(dueDate: Date | null, now: Date, timeZone: string = TIME_ZONE): number {
  if (!dueDate) return 0;
  return daysBetween(dueDate, now, timeZone);
}
