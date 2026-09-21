/**
 * The welcome a member gets the moment they are approved.
 *
 * The holding screen promises it — "We will message you on WhatsApp the
 * moment it is approved" — so it is a promise the app has been failing to
 * keep since step 4. It keeps it now.
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";

import { REGION } from "./config";
import { deliver } from "./escalation/send";
import { welcomeBody } from "./messaging/copy";
import { TELEGRAM_BOT_TOKEN } from "./messaging/telegram";
import { TEXTBELT_KEY, WHATSAPP_PHONE_ID, WHATSAPP_TOKEN } from "./messaging/pending-channels";
import type { ChannelId, Recipient } from "./messaging/types";

export const welcomeOnApproval = onDocumentUpdated(
  {
    document: "users/{uid}",
    region: REGION,
    secrets: [TELEGRAM_BOT_TOKEN, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, TEXTBELT_KEY],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only the crossing, and only in that direction. Revoke-then-approve
    // sends again, which is correct: they were told they were out.
    if (before.status === "approved" || after.status !== "approved") return;

    const to: Recipient = {
      uid: event.params.uid,
      name: after.name ?? "",
      phone: after.phone ?? null,
      telegramChatId: after.telegramChatId ?? null,
      fcmTokens: Array.isArray(after.fcmTokens) ? after.fcmTokens : [],
    };

    const settings = (await getFirestore().doc("settings/global").get()).data() ?? {};

    const result = await deliver(
      to,
      {
        short: "You are approved on Kahiniscope",
        body: welcomeBody(to.name, Array.isArray(after.crafts) ? after.crafts : null),
        taskIds: [],
        actionableTaskId: null,
        template: null,
      },
      {
        enabled: (settings.channels ?? {}) as Partial<Record<ChannelId, boolean>>,
        preferred: (after.preferredChannel as ChannelId) ?? null,
        // Nothing to step up, and SMS is worth spending on a welcome — it is
        // the one message that tells somebody the app is now worth opening.
        bumpTasks: false,
        escalationStep: Number.POSITIVE_INFINITY,
      }
    );

    logger.info("Welcome sent", { uid: to.uid, channel: result.delivered });
  }
);
