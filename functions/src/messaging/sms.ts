/**
 * Textbelt SMS — the genuine last resort.
 *
 * The free key allows **one message a day across the whole key**, not per
 * recipient. That is a demo, not a channel: if SMS matters, a local
 * Bangladeshi gateway bought in bulk will cost less and deliver better than
 * any international free tier, and `sendSms` below is the one function that
 * would need replacing.
 *
 * It ships switched off, and the chain holds it back until a task has reached
 * the daily stage — spending the day's only message on something two days
 * late would waste it on the wrong task.
 */

import { logger } from "firebase-functions/v2";

import type { ChannelAdapter, Recipient, ReminderMessage, SendOutcome } from "./types";
import { TEXTBELT_KEY } from "./pending-channels";
import { readSecret } from "./configured";

const TEXTBELT = "https://textbelt.com/text";

/** Textbelt counts characters; a truncated reminder is better than none. */
export const SMS_MAX_LENGTH = 160;

export function smsText(message: ReminderMessage): string {
  const text = message.short || message.body;
  if (text.length <= SMS_MAX_LENGTH) return text;
  return `${text.slice(0, SMS_MAX_LENGTH - 1).trimEnd()}…`;
}

function key(): string {
  return readSecret(TEXTBELT_KEY, "TEXTBELT_KEY");
}

export const smsAdapter: ChannelAdapter = {
  id: "sms",

  canReach: (to: Recipient) => Boolean(to.phone) && Boolean(key()),

  async send(to: Recipient, message: ReminderMessage): Promise<SendOutcome> {
    const apiKey = key();
    if (!apiKey || !to.phone) {
      return { result: "skipped", channel: "sms", error: "not configured" };
    }

    try {
      const response = await fetch(TEXTBELT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: to.phone,
          message: smsText(message),
          key: apiKey,
        }),
      });

      const json = (await response.json()) as {
        success?: boolean;
        error?: string;
        quotaRemaining?: number;
      };

      if (!json.success) {
        return {
          result: "failed",
          channel: "sms",
          error: json.error ?? `HTTP ${response.status}`,
        };
      }

      // The free key's quota is one a day. Worth knowing before the morning
      // it silently stops.
      if (typeof json.quotaRemaining === "number" && json.quotaRemaining <= 1) {
        logger.warn("Textbelt quota nearly spent", { quotaRemaining: json.quotaRemaining });
      }

      return { result: "delivered", channel: "sms", detail: `quota ${json.quotaRemaining ?? "?"}` };
    } catch (err) {
      return {
        result: "failed",
        channel: "sms",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
