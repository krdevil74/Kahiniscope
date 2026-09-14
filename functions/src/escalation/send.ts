/**
 * One place where a reminder actually goes out and gets written down.
 *
 * The scheduled job, the Nudge button and the welcome message all come
 * through here, so the bookkeeping — step up, timestamp, a log row per
 * attempt — cannot drift between them.
 */

import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

import { sendThroughChain, type ChainOptions } from "../messaging/chain";
import { pushAdapter } from "../messaging/fcm";
import { telegramAdapter } from "../messaging/telegram";
import { whatsappAdapter } from "../messaging/whatsapp";
import { smsAdapter } from "../messaging/sms";
import type { ChannelAdapter, ChannelId, Recipient, ReminderMessage } from "../messaging/types";

export const ADAPTERS: ChannelAdapter[] = [
  pushAdapter,
  telegramAdapter,
  whatsappAdapter,
  smsAdapter,
];

export interface DeliverOptions extends ChainOptions {
  /** Move the tasks up the ladder. False for a welcome message. */
  bumpTasks?: boolean;
  /** Write a row per attempt. */
  log?: boolean;
  adapters?: readonly ChannelAdapter[];
}

export interface DeliveryResult {
  delivered: ChannelId | null;
  attempts: number;
}

/**
 * Send, then record.
 *
 * Every attempt is logged, not just the one that worked — "they say they
 * never got it" is answered by the log, and only a full log can answer it.
 * The task is stepped up whether or not anything was delivered: a person who
 * cannot be reached at all is a fact about the day, and leaving the task on
 * step 0 would mean trying the same dead channel at the same cadence forever.
 */
export async function deliver(
  to: Recipient,
  message: ReminderMessage,
  options: DeliverOptions
): Promise<DeliveryResult> {
  const db = getFirestore();
  const { delivered, attempts } = await sendThroughChain(
    options.adapters ?? ADAPTERS,
    to,
    message,
    options
  );

  if (options.log !== false) {
    const batch = db.batch();
    const sentAt = Timestamp.now();
    for (const attempt of attempts) {
      batch.set(db.collection("reminderLog").doc(), {
        taskId: message.taskIds[0] ? db.collection("tasks").doc(message.taskIds[0]) : null,
        uid: to.uid,
        channel: attempt.channel,
        sentAt,
        result: attempt.result === "delivered" ? "delivered" : "failed",
        error: attempt.result === "delivered" ? null : attempt.error,
      });
    }
    await batch.commit();
  }

  if (options.bumpTasks !== false && message.taskIds.length) {
    const batch = db.batch();
    const now = Timestamp.now();
    for (const taskId of message.taskIds) {
      batch.update(db.collection("tasks").doc(taskId), {
        remindersSent: FieldValue.increment(1),
        lastReminderAt: now,
      });
    }
    await batch.commit();
  }

  if (!delivered) {
    logger.warn("Nothing reached this person", {
      uid: to.uid,
      attempts: attempts.map((a) => `${a.channel}:${a.result}`),
    });
  }

  return { delivered, attempts: attempts.length };
}
