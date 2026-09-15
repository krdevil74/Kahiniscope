/**
 * Data retention: nothing older than a year.
 *
 * Episodes, tasks and reminder logs are swept weekly. What gets deleted is
 * decided by `cutoffFor`, which is pure and tested — deleting production data
 * on a schedule is exactly the kind of thing that should not rest on a date
 * comparison nobody has looked at.
 *
 * Three deliberate choices:
 *
 *  - **Open tasks are swept too.** A task nobody closed in a year is not
 *    pending work, it is a task from a finished episode that was forgotten.
 *    Leaving it means the escalation job chases somebody about EP-12 forever.
 *  - **Episodes go by air date, tasks by when they were assigned.** Each
 *    collection is judged on its own clock rather than by chasing references,
 *    so a slow sweep can never half-delete an episode.
 *  - **Everything is counted and logged.** A silent deletion job is a job
 *    nobody can audit after the fact.
 */

import { getFirestore, Timestamp, type Query } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";

import { SCHEDULER_REGION } from "./config";
import { TIME_ZONE } from "./escalation/decide";

/** Kept for a year unless settings/global says otherwise. */
export const DEFAULT_RETENTION_DAYS = 365;

/**
 * Never sweep with a shorter window than this, whatever the settings say. A
 * fat-fingered `retentionDays: 3` would otherwise delete the current slate on
 * the next run.
 */
export const MINIMUM_RETENTION_DAYS = 90;

/** How many documents one pass will delete per collection. */
export const MAX_DELETES_PER_COLLECTION = 500;

export interface RetentionSettings {
  enabled: boolean;
  days: number;
}

export function retentionFrom(settings: unknown): RetentionSettings {
  const raw = (settings ?? {}) as { retention?: { enabled?: unknown; days?: unknown } };
  const days =
    typeof raw.retention?.days === "number" && Number.isFinite(raw.retention.days)
      ? Math.trunc(raw.retention.days)
      : DEFAULT_RETENTION_DAYS;

  return {
    // Opt out by setting it false; on by default, because unbounded growth is
    // the thing that eventually costs money.
    enabled: raw.retention?.enabled !== false,
    days: Math.max(MINIMUM_RETENTION_DAYS, days),
  };
}

/** The instant before which a document is old enough to delete. */
export function cutoffFor(now: Date, days: number): Date {
  const safeDays = Math.max(MINIMUM_RETENTION_DAYS, Math.trunc(days) || DEFAULT_RETENTION_DAYS);
  return new Date(now.getTime() - safeDays * 86_400_000);
}

export interface SweepSummary {
  episodes: number;
  tasks: number;
  reminderLog: number;
  cutoff: string;
  skipped?: string;
}

async function deleteOlderThan(query: Query, limit: number): Promise<number> {
  const snap = await query.limit(limit).get();
  if (snap.empty) return 0;

  const db = getFirestore();
  const batch = db.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
  return snap.size;
}

/**
 * One sweep. Separated from the schedule so it can be run with a clock of
 * your choosing, which is the only honest way to test a deletion job.
 */
export async function runRetentionSweep(now: Date = new Date()): Promise<SweepSummary> {
  const db = getFirestore();
  const settings = (await db.doc("settings/global").get()).data();
  const retention = retentionFrom(settings);

  if (!retention.enabled) {
    logger.info("Retention sweep skipped — switched off in settings/global");
    return { episodes: 0, tasks: 0, reminderLog: 0, cutoff: "", skipped: "disabled" };
  }

  const cutoff = Timestamp.fromDate(cutoffFor(now, retention.days));

  const [reminderLog, tasks, episodes] = await Promise.all([
    deleteOlderThan(
      db.collection("reminderLog").where("sentAt", "<", cutoff),
      MAX_DELETES_PER_COLLECTION
    ),
    deleteOlderThan(
      db.collection("tasks").where("assignedAt", "<", cutoff),
      MAX_DELETES_PER_COLLECTION
    ),
    deleteOlderThan(
      db.collection("episodes").where("airDate", "<", cutoff),
      MAX_DELETES_PER_COLLECTION
    ),
  ]);

  const summary: SweepSummary = {
    episodes,
    tasks,
    reminderLog,
    cutoff: cutoff.toDate().toISOString(),
  };

  logger.info("Retention sweep finished", summary as unknown as Record<string, unknown>);
  return summary;
}

/**
 * Sundays at 03:00 Dhaka — off-peak, and well clear of the 09:00 escalation
 * pass so the two never argue about the same documents.
 *
 * Weekly rather than daily: the volume here is a few hundred documents a
 * year, and a job that deletes production data is one you want running as
 * rarely as it can while still doing its job.
 */
export const purgeOldData = onSchedule(
  {
    schedule: "0 3 * * 0",
    timeZone: TIME_ZONE,
    region: SCHEDULER_REGION,
    retryCount: 1,
  },
  async () => {
    await runRetentionSweep(new Date());
  }
);
