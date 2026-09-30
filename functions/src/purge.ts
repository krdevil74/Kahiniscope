/**
 * What a by-hand collection clean-up is allowed to delete, and from when.
 *
 * `purgeOldData` (functions/src/retention.ts) is the automatic sweep: one
 * year, three collections, every Sunday. This is the other thing — the manual
 * one, run from the Actions tab when somebody has decided that a particular
 * collection should lose everything older than a particular date.
 *
 * Every decision that job makes is here, with no Firebase in it, because a
 * tool whose whole purpose is deleting production data should have its rules
 * readable and tested rather than buried in a script.
 *
 * Three of those rules matter:
 *
 *  - **The collection has to be on the list.** Not a free-text box. A typo in
 *    a collection name is a no-op against Firestore, which is the worst
 *    possible outcome: it looks like it worked.
 *  - **Each collection is judged on its own clock**, the same field the
 *    retention sweep uses, so the two never disagree about what "old" means.
 *  - **The date is read in Dhaka**, because whoever types it is reading it off
 *    a wall there. A date taken as UTC would delete six hours more than asked.
 */

import { TIME_ZONE } from "./escalation/decide";

export interface PurgeTarget {
  /** Top-level collection name. */
  collection: string;
  /** The timestamp field that decides how old a document is. */
  dateField: string;
  /** What is in it, for the confirmation line the job prints before deleting. */
  describes: string;
  /**
   * Whether documents here carry subcollections that have to go with them.
   * Firestore does not cascade: deleting `episodes/EP-12` leaves
   * `episodes/EP-12/private/roster` behind, reachable and invisible.
   */
  hasSubcollections: boolean;
}

/**
 * The collections this job will touch.
 *
 * `users` and `settings` are deliberately absent, and should stay absent.
 * A user document is half of an account — the other half is a Firebase Auth
 * record with a custom claim on it — so deleting one by date leaves an
 * account that can still sign in and has nothing to sign in to.
 * `settings/global` is a single document the entire app reads on every
 * screen. Neither belongs behind a date box.
 */
export const PURGE_TARGETS: readonly PurgeTarget[] = [
  {
    collection: "episodes",
    dateField: "airDate",
    describes: "episodes, by the date they aired",
    hasSubcollections: true,
  },
  {
    collection: "tasks",
    dateField: "assignedAt",
    describes: "tasks, by when they were assigned — open ones too",
    hasSubcollections: false,
  },
  {
    collection: "reminderLog",
    dateField: "sentAt",
    describes: "delivery records, by when the reminder was sent",
    hasSubcollections: false,
  },
  {
    collection: "payments",
    dateField: "approvedAt",
    describes: "payment records, by when the work was approved",
    hasSubcollections: false,
  },
  {
    // Ordinarily swept by its own daily job thirty days after upload; on the
    // list because an admin clearing out a date range should not have to leave
    // the screenshots behind.
    collection: "paymentProofs",
    dateField: "uploadedAt",
    describes: "payment screenshots, by when they were uploaded",
    hasSubcollections: false,
  },
  {
    collection: "advances",
    dateField: "createdAt",
    describes: "advances, by when they were recorded",
    hasSubcollections: false,
  },
];

/**
 * How recent a cutoff may be.
 *
 * A day is enough. What this is really guarding against is a date that reads
 * as sensible and is not — today's, or a mistyped year — rather than a
 * considered decision to clear out last week; the dry run is what catches
 * that one. So the floor sits at the smallest value that still refuses
 * "everything before now", and the rest is left to the person reading the
 * count. Like the retention floor it is not negotiable from the outside: an
 * escape hatch is exactly what a mistyped year would use.
 */
export const MIN_AGE_DAYS = 1;

export function targetFor(collection: string): PurgeTarget {
  const name = collection.trim();
  const target = PURGE_TARGETS.find((t) => t.collection === name);
  if (target) return target;

  const allowed = PURGE_TARGETS.map((t) => t.collection).join(", ");
  throw new Error(`"${collection}" is not a collection this job will purge. Allowed: ${allowed}.`);
}

/** The offset of a time zone at a given instant, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallClock = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour") % 24,
    value("minute"),
    value("second")
  );

  return wallClock - instant.getTime();
}

/**
 * Midnight at the start of a YYYY-MM-DD day, in Dhaka, as an instant.
 *
 * Bangladesh has no daylight saving, so a fixed +06:00 would be right today.
 * This goes through Intl anyway — the same choice `dhakaParts` makes — and
 * applies the offset twice because the correct offset is the one in force at
 * the answer, not at the guess. That only differs across a DST boundary,
 * which is precisely the case nobody would notice was wrong.
 */
export function startOfDay(day: string, timeZone: string = TIME_ZONE): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!match) {
    throw new Error(`The date must be written YYYY-MM-DD. Got "${day}".`);
  }

  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const dayOfMonth = Number(d);
  const naive = Date.UTC(year, month - 1, dayOfMonth);

  // Rejects 2026-02-31 and 2026-13-01, which Date.UTC would quietly roll over.
  const rolled = new Date(naive);
  if (
    rolled.getUTCFullYear() !== year ||
    rolled.getUTCMonth() !== month - 1 ||
    rolled.getUTCDate() !== dayOfMonth
  ) {
    throw new Error(`"${day}" is not a real date.`);
  }

  const guess = naive - offsetMs(rolled, timeZone);
  return new Date(naive - offsetMs(new Date(guess), timeZone));
}

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/**
 * The instant before which a document is old enough for this job to delete.
 *
 * "Before 2026-04-01" means strictly before midnight that morning in Dhaka —
 * the 31st of March goes, the 1st of April stays. That is how the sentence
 * reads to the person typing it, and the boundary is the half of the answer
 * people get wrong.
 */
export function cutoffFor(day: string, now: Date = new Date(), timeZone: string = TIME_ZONE): Date {
  const cutoff = startOfDay(day, timeZone);

  if (cutoff.getTime() > now.getTime()) {
    throw new Error(
      `${day} is in the future. This job deletes everything before the date it is given, ` +
        `which from a future date is everything there is. Check the year.`
    );
  }

  const floor = now.getTime() - MIN_AGE_DAYS * 86_400_000;
  if (cutoff.getTime() > floor) {
    throw new Error(
      `${day} is less than ${days(MIN_AGE_DAYS)} ago. This job only clears out old data; ` +
        `pick a date at least ${days(MIN_AGE_DAYS)} back.`
    );
  }

  return cutoff;
}
