/**
 * The scheduled job: once a day at 09:00 Asia/Dhaka, chase whoever is due.
 *
 * Deploy needs the Blaze plan — scheduled functions do — but a daily pass over
 * a dozen tasks stays inside the free allowance.
 */

import { getFirestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

import { DEFAULT_PLAN, DEFAULT_QUIET_HOURS, REGION, SCHEDULER_REGION } from "../config";
import { TELEGRAM_BOT_TOKEN } from "../messaging/telegram";
import { TEXTBELT_KEY, WHATSAPP_PHONE_ID, WHATSAPP_TOKEN } from "../messaging/pending-channels";
import { defineSecret } from "firebase-functions/params";
import { readSecret } from "../messaging/configured";

/** Shared secret for the manual run endpoint below. */
export const ESCALATION_RUN_KEY = defineSecret("ESCALATION_RUN_KEY");
import { reminderBody, reminderShort, type TaskLine } from "../messaging/copy";
import type { ChannelId, Recipient } from "../messaging/types";
import { daysOverdue, decide, TIME_ZONE, type QuietHours } from "./decide";
import { deliver } from "./send";

export interface RunSummary {
  considered: number;
  sent: number;
  skipped: Record<string, number>;
  failures: number;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const maybe = value as { toDate?: () => Date };
  return typeof maybe.toDate === "function" ? maybe.toDate() : null;
}

/**
 * The pass itself, separated from the schedule so it can be run by hand — by
 * the HTTP trigger below, or from a test — with a clock of your choosing.
 */
export async function runEscalation(now: Date = new Date()): Promise<RunSummary> {
  const db = getFirestore();

  const settingsSnap = await db.doc("settings/global").get();
  const settings = settingsSnap.data() ?? {};
  const plan: number[] =
    Array.isArray(settings.plan) && settings.plan.length ? settings.plan : DEFAULT_PLAN;
  const quiet: QuietHours = { ...DEFAULT_QUIET_HOURS, ...(settings.quietHours ?? {}) };
  const enabled = (settings.channels ?? {}) as Partial<Record<ChannelId, boolean>>;

  const open = await db.collection("tasks").where("done", "==", false).get();

  const summary: RunSummary = { considered: open.size, sent: 0, skipped: {}, failures: 0 };
  const note = (reason: string) => {
    summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1;
  };

  // Cache people and episodes: a dozen tasks across half a dozen members
  // would otherwise re-read the same documents all morning.
  const people = new Map<string, FirebaseFirestore.DocumentData>();
  const episodes = new Map<string, FirebaseFirestore.DocumentData>();

  for (const taskDoc of open.docs) {
    const task = taskDoc.data();

    const verdict = decide(
      {
        id: taskDoc.id,
        assigneeUid: task.assigneeUid,
        remindersSent: task.remindersSent ?? 0,
        lastReminderAt: toDate(task.lastReminderAt),
        assignedAt: toDate(task.assignedAt),
      },
      plan,
      now,
      quiet
    );

    if (!verdict.send) {
      note(verdict.reason);
      continue;
    }

    if (!people.has(task.assigneeUid)) {
      const snap = await db.collection("users").doc(task.assigneeUid).get();
      people.set(task.assigneeUid, snap.data() ?? {});
    }
    const person = people.get(task.assigneeUid) ?? {};

    // Somebody revoked or declined mid-episode. Chasing them would be rude
    // and pointless.
    if (person.status !== "approved") {
      note("assignee-not-approved");
      continue;
    }

    const episodeId =
      typeof task.episodeId === "string" ? task.episodeId : task.episodeId?.id ?? "";
    if (episodeId && !episodes.has(episodeId)) {
      const snap = await db.collection("episodes").doc(episodeId).get();
      episodes.set(episodeId, snap.data() ?? {});
    }
    const episode = episodes.get(episodeId) ?? {};

    const line: TaskLine = {
      taskType: task.type ?? "A task",
      episodeCode: episode.code ?? "",
      episodeTitle: episode.title ?? "",
      daysOverdue: daysOverdue(toDate(task.dueDate), now),
    };

    const to: Recipient = {
      uid: task.assigneeUid,
      name: person.name ?? "",
      phone: person.phone ?? null,
      telegramChatId: person.telegramChatId ?? null,
      fcmTokens: Array.isArray(person.fcmTokens) ? person.fcmTokens : [],
    };

    const result = await deliver(
      to,
      {
        short: reminderShort(line),
        body: reminderBody(to.name, line),
        taskIds: [taskDoc.id],
        actionableTaskId: taskDoc.id,
        template: {
          taskType: line.taskType,
          episode: `${line.episodeCode} ${line.episodeTitle}`.trim(),
          daysOverdue: line.daysOverdue,
        },
      },
      {
        enabled,
        // The admin can pin a channel on one task, or on the person. The
        // task wins where both are set; neither is a restriction, because
        // the chain still falls through if the pinned one fails.
        preferred:
          (task.preferredChannel as ChannelId) ?? (person.preferredChannel as ChannelId) ?? null,
        escalationStep: verdict.step,
      }
    );

    summary.sent += 1;
    if (!result.delivered) summary.failures += 1;
  }

  logger.info("Escalation pass finished", summary as unknown as Record<string, unknown>);
  return summary;
}

const SECRETS = [TELEGRAM_BOT_TOKEN, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, TEXTBELT_KEY];



/** 09:00 every day, Dhaka time. */
export const escalateDaily = onSchedule(
  {
    schedule: "0 9 * * *",
    timeZone: TIME_ZONE,
    // Not REGION: Cloud Scheduler is not available where the database is.
    region: SCHEDULER_REGION,
    secrets: SECRETS,
    retryCount: 1,
  },
  async () => {
    await runEscalation(new Date());
  }
);

/**
 * The same pass, on demand, for the owner.
 *
 * Waiting until nine tomorrow morning to find out whether the ladder works is
 * not a reasonable way to test it. Guarded by a shared secret rather than an
 * ID token, because it is called from a terminal:
 *
 *   firebase functions:secrets:set ESCALATION_RUN_KEY
 *   curl -X POST "$URL" -H "x-run-key: <key>"
 *
 * Every guard inside the pass still applies, so running it twice sends
 * nothing twice.
 */
export const runEscalationNow = onRequest(
  { region: REGION, secrets: [...SECRETS, ESCALATION_RUN_KEY] },
  async (request, response) => {
    // The declared secret in production; the plain variable in the emulator.
    const key = readSecret(ESCALATION_RUN_KEY, "ESCALATION_RUN_KEY");

    if (!key) {
      response.status(503).send("ESCALATION_RUN_KEY is not set on this deployment.");
      return;
    }
    if (request.get("x-run-key") !== key) {
      response.status(403).send("Bad or missing x-run-key.");
      return;
    }

    const summary = await runEscalation(new Date());
    response.json(summary);
  }
);
