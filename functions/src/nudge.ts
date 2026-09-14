/**
 * Nudge, from the admin's thumb.
 *
 * Until now the buttons on the board only moved the ladder. They send, now,
 * and they come through a Cloud Function rather than writing Firestore
 * directly, because sending needs the bot token — and because the toast
 * should name the channel that actually worked, which only the server knows.
 */

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { REGION } from "./config";
import { daysOverdue } from "./escalation/decide";
import { deliver } from "./escalation/send";
import { digestBody, digestShort, reminderBody, reminderShort, type TaskLine } from "./messaging/copy";
import { TELEGRAM_BOT_TOKEN } from "./messaging/telegram";
import { TEXTBELT_KEY, WHATSAPP_PHONE_ID, WHATSAPP_TOKEN } from "./messaging/pending-channels";
import type { ChannelId, Recipient } from "./messaging/types";

const SECRETS = [TELEGRAM_BOT_TOKEN, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, TEXTBELT_KEY];

function assertAdmin(auth: { token?: Record<string, unknown> } | undefined): void {
  const role = auth?.token?.role;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if ((role !== "admin" && role !== "owner") || auth.token?.status !== "approved") {
    throw new HttpsError("permission-denied", "Only an admin can nudge.");
  }
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const maybe = value as { toDate?: () => Date };
  return typeof maybe.toDate === "function" ? maybe.toDate() : null;
}

async function loadContext(uid: string) {
  const db = getFirestore();
  const person = (await db.collection("users").doc(uid).get()).data();
  if (!person) throw new HttpsError("not-found", "No such member.");
  if (person.status !== "approved") {
    throw new HttpsError("failed-precondition", "That account is not approved.");
  }

  const to: Recipient = {
    uid,
    name: person.name ?? "",
    phone: person.phone ?? null,
    telegramChatId: person.telegramChatId ?? null,
    fcmTokens: Array.isArray(person.fcmTokens) ? person.fcmTokens : [],
  };

  const settings = (await db.doc("settings/global").get()).data() ?? {};
  return {
    to,
    enabled: (settings.channels ?? {}) as Partial<Record<ChannelId, boolean>>,
    preferred: (person.preferredChannel as ChannelId) ?? null,
  };
}

async function lineFor(task: FirebaseFirestore.DocumentData, now: Date): Promise<TaskLine> {
  const db = getFirestore();
  const episodeId = typeof task.episodeId === "string" ? task.episodeId : task.episodeId?.id ?? "";
  const episode = episodeId ? (await db.collection("episodes").doc(episodeId).get()).data() ?? {} : {};
  return {
    taskType: task.type ?? "A task",
    episodeCode: episode.code ?? "",
    episodeTitle: episode.title ?? "",
    daysOverdue: daysOverdue(toDate(task.dueDate), now),
  };
}

/** One task. Returns the channel that worked, for the toast. */
export const nudgeTask = onCall<{ taskId?: string }>(
  { region: REGION, secrets: SECRETS },
  async (request) => {
    assertAdmin(request.auth);

    const taskId = request.data?.taskId;
    if (!taskId) throw new HttpsError("invalid-argument", "A taskId is required.");

    const db = getFirestore();
    const snap = await db.collection("tasks").doc(taskId).get();
    if (!snap.exists) throw new HttpsError("not-found", "That task is gone.");

    const task = snap.data() ?? {};
    if (task.done === true) {
      throw new HttpsError("failed-precondition", "That task is already done.");
    }

    const now = new Date();
    const { to, enabled, preferred } = await loadContext(task.assigneeUid);
    const line = await lineFor(task, now);

    const result = await deliver(
      to,
      {
        short: reminderShort(line),
        body: reminderBody(to.name, line),
        taskIds: [taskId],
        actionableTaskId: taskId,
        template: {
          taskType: line.taskType,
          episode: `${line.episodeCode} ${line.episodeTitle}`.trim(),
          daysOverdue: line.daysOverdue,
        },
      },
      {
        enabled,
        preferred: (task.preferredChannel as ChannelId) ?? preferred,
        escalationStep: task.remindersSent ?? 0,
      }
    );

    return { name: to.name, channel: result.delivered, taskType: line.taskType };
  }
);

/**
 * Everything a person owes, in one message, with every task's step bumped.
 * One message rather than five, because five notifications in a row is how
 * people learn to ignore notifications.
 */
export const nudgeAllOpen = onCall<{ uid?: string }>(
  { region: REGION, secrets: SECRETS },
  async (request) => {
    assertAdmin(request.auth);

    const uid = request.data?.uid;
    if (!uid) throw new HttpsError("invalid-argument", "A uid is required.");

    const db = getFirestore();
    const open = await db
      .collection("tasks")
      .where("assigneeUid", "==", uid)
      .where("done", "==", false)
      .get();

    const { to, enabled, preferred } = await loadContext(uid);

    if (open.empty) {
      return { name: to.name, channel: null, count: 0 };
    }

    const now = new Date();
    const lines = await Promise.all(open.docs.map((d) => lineFor(d.data(), now)));
    const worstStep = Math.max(...open.docs.map((d) => d.data().remindersSent ?? 0));

    const result = await deliver(
      to,
      {
        short: digestShort(lines),
        body: digestBody(to.name, lines),
        taskIds: open.docs.map((d) => d.id),
        // One button cannot close five tasks, so a digest carries none.
        actionableTaskId: open.size === 1 ? open.docs[0].id : null,
        template: null,
      },
      { enabled, preferred, escalationStep: worstStep }
    );

    return { name: to.name, channel: result.delivered, count: open.size };
  }
);
