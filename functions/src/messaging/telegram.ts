/**
 * Telegram. Free, unlimited, and the workhorse of the chain.
 *
 * The message carries an inline "Mark done" button, so a member can close a
 * task from the chat without opening the app at all. The handoff calls that
 * the highest-value extra, and it is: the whole point of the escalation
 * ladder is to stop having to chase people, and a one-tap reply in a chat
 * they are already reading is the shortest path to done.
 */

import { defineSecret } from "firebase-functions/params";

import type { ChannelAdapter, Recipient, ReminderMessage, SendOutcome } from "./types";

/**
 * From @BotFather. Set with:
 *   firebase functions:secrets:set TELEGRAM_BOT_TOKEN
 */
export const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");

const API = "https://api.telegram.org";

export function botToken(): string {
  return TELEGRAM_BOT_TOKEN.value() || process.env.TELEGRAM_BOT_TOKEN || "";
}

export async function telegramCall(
  method: string,
  payload: unknown,
  token = botToken()
): Promise<{ ok: boolean; description?: string; result?: unknown }> {
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = (await response.json()) as { ok: boolean; description?: string; result?: unknown };
  if (!json.ok) throw new Error(json.description ?? `Telegram ${method} failed`);
  return json;
}

/** The callback payload behind the inline button, kept under Telegram's 64 bytes. */
export function doneCallbackData(taskId: string): string {
  return `done:${taskId}`;
}

export function parseCallbackData(data: string): { action: "done"; taskId: string } | null {
  const match = /^done:(.+)$/.exec(data ?? "");
  return match ? { action: "done", taskId: match[1] } : null;
}

export const telegramAdapter: ChannelAdapter = {
  id: "telegram",

  canReach: (to: Recipient) => Boolean(to.telegramChatId),

  async send(to: Recipient, message: ReminderMessage): Promise<SendOutcome> {
    const replyMarkup = message.actionableTaskId
      ? {
          inline_keyboard: [
            [{ text: "✓ Mark done", callback_data: doneCallbackData(message.actionableTaskId) }],
          ],
        }
      : undefined;

    try {
      await telegramCall("sendMessage", {
        chat_id: to.telegramChatId,
        text: message.body,
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      return { result: "delivered", channel: "telegram" };
    } catch (err) {
      return {
        result: "failed",
        channel: "telegram",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
