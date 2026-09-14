/**
 * Push. Free, unlimited, and first in the chain.
 *
 * It fails when the app has been uninstalled or the token has gone stale,
 * which is exactly the moment the fallback matters — so a dead token is
 * pruned from the user record rather than left to fail every morning.
 */

import { getMessaging } from "firebase-admin/messaging";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

import type { ChannelAdapter, Recipient, ReminderMessage, SendOutcome } from "./types";

/** Tokens Firebase tells us will never work again. */
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

export const pushAdapter: ChannelAdapter = {
  id: "push",

  canReach: (to: Recipient) => to.fcmTokens.length > 0,

  async send(to: Recipient, message: ReminderMessage): Promise<SendOutcome> {
    const response = await getMessaging().sendEachForMulticast({
      tokens: to.fcmTokens,
      notification: { title: "Kahiniscope", body: message.short },
      data: {
        uid: to.uid,
        taskId: message.actionableTaskId ?? "",
        taskIds: message.taskIds.join(","),
      },
      android: {
        priority: "high",
        notification: { channelId: "reminders", color: "#ffc20a" },
      },
    });

    const dead: string[] = [];
    response.responses.forEach((result, index) => {
      if (!result.success && DEAD_TOKEN_CODES.has(result.error?.code ?? "")) {
        dead.push(to.fcmTokens[index]);
      }
    });

    if (dead.length) {
      await getFirestore()
        .collection("users")
        .doc(to.uid)
        .update({ fcmTokens: FieldValue.arrayRemove(...dead) })
        .catch((err) => logger.warn("Could not prune dead tokens", { uid: to.uid, err }));
      logger.info("Pruned dead FCM tokens", { uid: to.uid, count: dead.length });
    }

    if (response.successCount > 0) {
      return { result: "delivered", channel: "push", detail: `${response.successCount} device(s)` };
    }

    return {
      result: "failed",
      channel: "push",
      error:
        response.responses.find((r) => !r.success)?.error?.message ??
        "no device accepted the message",
    };
  },
};
