/**
 * WhatsApp Cloud API.
 *
 * Business-initiated messages must use a template that Meta has approved in
 * advance — free text is refused outside a 24-hour window opened by the
 * recipient. So the reminder is sent as a template with three positional
 * parameters, matching the one the handoff proposes:
 *
 *   Reminder: {{1}} for {{2}} is {{3}} days overdue.
 *
 * Cost, plainly: Meta bills per business-initiated template message. The
 * "1,000 free service conversations a month" the prototype assumed is Meta's
 * older model and should not be relied on — check the current Bangladesh
 * utility rate before switching this on. It ships switched off for that
 * reason, and Telegram is the workhorse.
 */

import type { ChannelAdapter, Recipient, ReminderMessage, SendOutcome } from "./types";
import { WHATSAPP_PHONE_ID, WHATSAPP_TOKEN } from "./pending-channels";

const GRAPH = "https://graph.facebook.com/v21.0";

/** The approved template's name and language. */
export const TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || "task_overdue";
export const TEMPLATE_LANGUAGE = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en";

function secret(param: { value: () => string }, envName: string): string {
  try {
    return param.value() || process.env[envName] || "";
  } catch {
    return process.env[envName] || "";
  }
}

/** E.164 without the plus, which is what the Graph API wants. */
export function toWhatsAppNumber(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/**
 * The three positional parameters. Meta rejects a template message whose
 * parameter count does not match the approved body exactly, so this is built
 * in one place and tested.
 */
export function templateParameters(message: ReminderMessage): string[] {
  const t = message.template;
  if (!t) {
    // A digest has no single task to name. Send it as one parameter set that
    // still reads as a sentence.
    return [message.short, "your open tasks", "0"];
  }
  return [t.taskType, t.episode || "an episode", String(Math.max(0, t.daysOverdue))];
}

export const whatsappAdapter: ChannelAdapter = {
  id: "whatsapp",

  canReach: (to: Recipient) =>
    Boolean(to.phone) &&
    Boolean(secret(WHATSAPP_TOKEN, "WHATSAPP_TOKEN")) &&
    Boolean(secret(WHATSAPP_PHONE_ID, "WHATSAPP_PHONE_ID")),

  async send(to: Recipient, message: ReminderMessage): Promise<SendOutcome> {
    const token = secret(WHATSAPP_TOKEN, "WHATSAPP_TOKEN");
    const phoneId = secret(WHATSAPP_PHONE_ID, "WHATSAPP_PHONE_ID");

    if (!token || !phoneId || !to.phone) {
      return { result: "skipped", channel: "whatsapp", error: "not configured" };
    }

    try {
      const response = await fetch(`${GRAPH}/${phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toWhatsAppNumber(to.phone),
          type: "template",
          template: {
            name: TEMPLATE_NAME,
            language: { code: TEMPLATE_LANGUAGE },
            components: [
              {
                type: "body",
                parameters: templateParameters(message).map((text) => ({ type: "text", text })),
              },
            ],
          },
        }),
      });

      const json = (await response.json()) as {
        messages?: { id: string }[];
        error?: { message?: string; code?: number };
      };

      if (!response.ok || json.error) {
        return {
          result: "failed",
          channel: "whatsapp",
          error: json.error?.message ?? `HTTP ${response.status}`,
        };
      }

      return {
        result: "delivered",
        channel: "whatsapp",
        detail: json.messages?.[0]?.id,
      };
    } catch (err) {
      return {
        result: "failed",
        channel: "whatsapp",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
