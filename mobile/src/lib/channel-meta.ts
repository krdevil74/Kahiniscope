/**
 * What each delivery channel is, for the Notify screen.
 *
 * The order here is the order the sender actually tries, as specified by the
 * escalation engine: push, then Telegram, then WhatsApp, then SMS. The status
 * tags — Primary, Fallback, Last resort — are derived from that order and from
 * which channels are switched on, rather than being fixed strings, so a screen
 * that says "Primary" is naming the channel that would really go first.
 *
 * Pure: no imports beyond types. Unit tested.
 */

import type { ChannelId } from "./model";

export interface ChannelMeta {
  id: ChannelId | "email";
  name: string;
  /** What it costs and what it caps at, in monospace on the card. */
  limit: string;
  /** False for anything that bills per message or is effectively a demo. */
  free: boolean;
  /** Where it sends. Shown only while the channel is on. */
  endpoint: string;
  /** Email is a digest, not a rung on the fallback chain. */
  inChain: boolean;
}

export const CHANNEL_META: ChannelMeta[] = [
  {
    id: "push",
    name: "Push notification",
    limit: "Free, unlimited — needs the app installed",
    endpoint: "fcm.googleapis.com/v1/…/messages:send",
    free: true,
    inChain: true,
  },
  {
    id: "telegram",
    name: "Telegram bot",
    limit: "Free, unlimited — needs /start once",
    endpoint: "api.telegram.org/bot•••/sendMessage",
    free: true,
    inChain: true,
  },
  {
    id: "whatsapp",
    name: "WhatsApp Cloud API",
    limit: "Billed per message — check Meta's Bangladesh rates",
    endpoint: "graph.facebook.com/v21.0/•••/messages",
    free: false,
    inChain: true,
  },
  {
    id: "sms",
    name: "Textbelt SMS",
    limit: "Free key: 1 SMS / day for the whole team",
    endpoint: "textbelt.com/text · key ••••free",
    free: false,
    inChain: true,
  },
  {
    id: "email",
    name: "Email digest",
    limit: "Daily 9am roll-up of everything overdue",
    endpoint: "smtp · noreply@kahiniscope",
    free: true,
    inChain: false,
  },
];

export type ChannelTag = "Primary" | "Fallback" | "Last resort" | "Digest" | "Off";

/**
 * The tag each card wears, given which channels are on.
 *
 * The first channel that is on is the Primary; the last one on is the Last
 * resort; anything between is a Fallback. Switch WhatsApp off and Telegram
 * does not stop being first — but SMS becomes the last resort instead of
 * WhatsApp, and the screen says so.
 */
export function channelTags(
  enabled: Partial<Record<ChannelId | "email", boolean>>
): Record<ChannelId | "email", ChannelTag> {
  const chain = CHANNEL_META.filter((c) => c.inChain);
  const on = chain.filter((c) => enabled[c.id] !== false).map((c) => c.id);

  const tags = {} as Record<ChannelId | "email", ChannelTag>;

  for (const channel of CHANNEL_META) {
    if (enabled[channel.id] === false) {
      tags[channel.id] = "Off";
      continue;
    }
    if (!channel.inChain) {
      tags[channel.id] = "Digest";
      continue;
    }
    if (on.length === 1) tags[channel.id] = "Primary";
    else if (channel.id === on[0]) tags[channel.id] = "Primary";
    else if (channel.id === on[on.length - 1]) tags[channel.id] = "Last resort";
    else tags[channel.id] = "Fallback";
  }

  return tags;
}

/** "Push, then Telegram, then WhatsApp, then SMS." */
export function chainSentence(
  enabled: Partial<Record<ChannelId | "email", boolean>>
): string {
  const short: Record<string, string> = {
    push: "push",
    telegram: "Telegram",
    whatsapp: "WhatsApp",
    sms: "SMS",
  };
  const on = CHANNEL_META.filter((c) => c.inChain && enabled[c.id] !== false).map(
    (c) => short[c.id]
  );

  if (on.length === 0) return "Every channel is off — no reminders will go out.";
  if (on.length === 1) return `Only ${on[0]} is on. If it fails, nothing else is tried.`;

  return (
    `Channels are tried in order: ${on.slice(0, -1).join(", then ")}, then ` +
    `${on[on.length - 1]}. The first one that succeeds wins, and every attempt is logged.`
  );
}

/**
 * The member-facing version: "Reminders arrive on push, then Telegram, then
 * WhatsApp." Shorter than the admin's sentence, and without the word
 * "logged" — a member does not need to know there is a log.
 */
export function memberChainSentence(
  enabled: Partial<Record<ChannelId | "email", boolean>>
): string {
  const short: Record<string, string> = {
    push: "push",
    telegram: "Telegram",
    whatsapp: "WhatsApp",
    sms: "SMS",
  };
  const on = CHANNEL_META.filter((c) => c.inChain && enabled[c.id] !== false).map(
    (c) => short[c.id]
  );

  if (on.length === 0) return "Reminders are switched off at the moment.";
  if (on.length === 1) return `Reminders arrive on ${on[0]}.`;
  return `Reminders arrive on ${on.slice(0, -1).join(", then ")}, then ${on[on.length - 1]}.`;
}

/** The five rows of the escalation schedule. */
export const PLAN_LABELS = [
  "First reminder after",
  "Then every",
  "Then every",
  "Then every",
  "Then every",
];

export function planLabel(index: number): string {
  return PLAN_LABELS[index] ?? "Then every";
}

/** Bump one rung of the ladder, never below a day. */
export function stepPlan(plan: readonly number[], index: number, delta: number): number[] {
  return plan.map((value, i) => (i === index ? Math.max(1, value + delta) : value));
}
