/**
 * The Telegram bot's ear.
 *
 * Two things arrive here:
 *
 *  1. `/start <token>` — a member opening the bot for the first time. The
 *     token ties this chat to a user, and the chat id is written to their
 *     record so reminders can find them.
 *  2. A tap on the inline "Mark done" button, which closes the task from the
 *     chat. That is the highest-value part of the whole channel: it removes
 *     the need to open the app at all.
 *
 * The URL carries a secret path segment and Telegram is asked to send a
 * secret header, because a webhook is public by nature.
 */

import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

import { REGION } from "./config";
import { parseCallbackData, telegramCall, TELEGRAM_BOT_TOKEN } from "./messaging/telegram";

/** Sent by Telegram as X-Telegram-Bot-Api-Secret-Token on every update. */
export const TELEGRAM_WEBHOOK_SECRET = defineSecret("TELEGRAM_WEBHOOK_SECRET");

interface TelegramUpdate {
  message?: {
    chat?: { id?: number };
    from?: { first_name?: string };
    text?: string;
  };
  callback_query?: {
    id?: string;
    data?: string;
    message?: { chat?: { id?: number }; message_id?: number };
  };
}

export const telegramWebhook = onRequest(
  { region: REGION, secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET] },
  async (request, response) => {
    const expected = TELEGRAM_WEBHOOK_SECRET.value() || process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expected && request.get("x-telegram-bot-api-secret-token") !== expected) {
      logger.warn("Rejected a webhook call with a bad secret");
      response.status(403).send("no");
      return;
    }

    const update = request.body as TelegramUpdate;

    try {
      if (update.message?.text) {
        await handleMessage(update);
      } else if (update.callback_query) {
        await handleCallback(update);
      }
    } catch (err) {
      // Always 200: a non-200 makes Telegram retry the same update forever.
      logger.error("Telegram update failed", { err });
    }

    response.status(200).send("ok");
  }
);

/** `/start <link token>` — tie this chat to a member. */
async function handleMessage(update: TelegramUpdate): Promise<void> {
  const chatId = update.message?.chat?.id;
  const text = (update.message?.text ?? "").trim();
  if (!chatId) return;

  const start = /^\/start(?:\s+(\S+))?$/.exec(text);
  if (!start) {
    await telegramCall("sendMessage", {
      chat_id: chatId,
      text: "Open the Kahiniscope app and tap Connect Telegram — it will bring you back here with a link that ties this chat to your account.",
    });
    return;
  }

  const linkToken = start[1];
  if (!linkToken) {
    await telegramCall("sendMessage", {
      chat_id: chatId,
      text: "This chat is not linked to a Kahiniscope account yet. Open the app and tap Connect Telegram.",
    });
    return;
  }

  const db = getFirestore();
  const matches = await db
    .collection("users")
    .where("telegramLinkToken", "==", linkToken)
    .limit(1)
    .get();

  if (matches.empty) {
    await telegramCall("sendMessage", {
      chat_id: chatId,
      text: "That link has expired. Open the app and tap Connect Telegram again.",
    });
    return;
  }

  const user = matches.docs[0];
  await user.ref.update({
    telegramChatId: String(chatId),
    // One use only.
    telegramLinkToken: null,
  });

  logger.info("Telegram chat linked", { uid: user.id });
  await telegramCall("sendMessage", {
    chat_id: chatId,
    text: `Linked. Reminders for ${user.data().name ?? "you"} will arrive here, and you can close a task with the button on each one.`,
  });
}

/** A tap on "Mark done". */
async function handleCallback(update: TelegramUpdate): Promise<void> {
  const query = update.callback_query;
  const chatId = query?.message?.chat?.id;
  const parsed = parseCallbackData(query?.data ?? "");

  const answer = (text: string) =>
    telegramCall("answerCallbackQuery", { callback_query_id: query?.id, text });

  if (!parsed || !chatId) {
    await answer("That button is no longer valid.");
    return;
  }

  const db = getFirestore();

  // The chat is the credential here — there is no ID token in a Telegram tap.
  // So the task must belong to the account this chat is linked to, and only
  // to that account.
  const owners = await db
    .collection("users")
    .where("telegramChatId", "==", String(chatId))
    .limit(1)
    .get();

  if (owners.empty) {
    await answer("This chat is not linked to a Kahiniscope account.");
    return;
  }

  const uid = owners.docs[0].id;
  const taskRef = db.collection("tasks").doc(parsed.taskId);
  const task = await taskRef.get();

  if (!task.exists) {
    await answer("That task is gone.");
    return;
  }
  if (task.data()?.assigneeUid !== uid) {
    logger.warn("Telegram tap on somebody else's task", { uid, taskId: parsed.taskId });
    await answer("That task is not yours.");
    return;
  }
  if (task.data()?.done === true) {
    await answer("Already done — thank you.");
    return;
  }

  await taskRef.update({ done: true, doneAt: Timestamp.now() });
  logger.info("Task closed from Telegram", { uid, taskId: parsed.taskId });

  await answer("Marked done. Reminders stopped.");

  // Take the button away so it cannot be tapped twice.
  await telegramCall("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: query?.message?.message_id,
    reply_markup: { inline_keyboard: [] },
  }).catch(() => undefined);
}
