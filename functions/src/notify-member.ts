/**
 * Telling somebody what just happened to their work.
 *
 * Every one of these is the result of an admin doing something — accepting a
 * task, sending it back, paying for it, advancing money against it — and in
 * every case the person it happened to is somewhere else, not watching the
 * app. A change they only discover the next time they happen to open it is a
 * change that may as well not have happened for a week.
 *
 * It rides the same chain as a reminder: push first, then whatever else is
 * switched on and can reach them. And it never throws. A notification that
 * fails must not roll back the approval that caused it — the money is the
 * important part, the message is the courtesy.
 */

import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

import { deliver } from "./escalation/send";
import type { ChannelId, Recipient } from "./messaging/types";

export interface MemberMessage {
  /** The line that lands on the lock screen. */
  short: string;
  body: string;
}

export async function notifyMember(uid: string, message: MemberMessage): Promise<void> {
  if (!uid) return;

  try {
    const db = getFirestore();
    const [userSnap, settingsSnap] = await Promise.all([
      db.collection("users").doc(uid).get(),
      db.doc("settings/global").get(),
    ]);

    const user = userSnap.data();
    if (!user) return;

    const to: Recipient = {
      uid,
      name: user.name ?? "",
      phone: user.phone ?? null,
      telegramChatId: user.telegramChatId ?? null,
      fcmTokens: Array.isArray(user.fcmTokens) ? user.fcmTokens : [],
    };

    const settings = settingsSnap.data() ?? {};

    const result = await deliver(
      to,
      { short: message.short, body: message.body, taskIds: [], actionableTaskId: null, template: null },
      {
        enabled: (settings.channels ?? {}) as Partial<Record<ChannelId, boolean>>,
        preferred: (user.preferredChannel as ChannelId) ?? null,
        // Nothing to escalate: this is news, not a chase. It goes out once.
        bumpTasks: false,
        escalationStep: Number.POSITIVE_INFINITY,
      }
    );

    logger.info("Member notified", { uid, channel: result.delivered, short: message.short });
  } catch (err) {
    // Deliberately swallowed. See the note at the top.
    logger.warn("Could not notify member", { uid, err });
  }
}
