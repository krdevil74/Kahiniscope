/**
 * Which channel would actually reach a person.
 *
 * The Team screen and the person header both show a channel, but there is no
 * channel field on a user — there cannot be, because the answer depends on
 * what that person has connected and which channels the owner has switched
 * on. So it is derived, in the same order the sender falls through:
 *
 *   push → telegram → whatsapp → sms
 *
 * Pure: no Firebase, no React. Unit tested.
 */

import type { ChannelId, Settings, TeamMember } from "./model";

export const CHANNEL_LABELS: Record<ChannelId, string> = {
  push: "Push",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  sms: "SMS",
};

/** Short tags for the reminder feed. */
export const CHANNEL_TAGS: Record<ChannelId, string> = {
  push: "PUSH",
  telegram: "TG",
  whatsapp: "WA",
  sms: "SMS",
};

const ORDER: ChannelId[] = ["push", "telegram", "whatsapp", "sms"];

function reachable(member: TeamMember, channel: ChannelId): boolean {
  switch (channel) {
    case "push":
      return member.fcmTokens.length > 0;
    case "telegram":
      return Boolean(member.telegramChatId);
    case "whatsapp":
    case "sms":
      return Boolean(member.phone);
  }
}

/**
 * The first channel that is both switched on and actually connected for this
 * person. Null when nothing would reach them — which is worth showing rather
 * than hiding, because it means reminders are going nowhere.
 */
export function bestChannelFor(
  member: TeamMember,
  settings: Settings,
  preferred?: ChannelId | null
): ChannelId | null {
  const enabled = (c: ChannelId) => settings.channels[c] !== false;

  // A channel pinned to this task wins; otherwise the one the admin pinned
  // to this person; otherwise the chain decides.
  const wanted = preferred ?? member.preferredChannel ?? null;
  if (wanted && enabled(wanted) && reachable(member, wanted)) return wanted;

  return ORDER.find((c) => enabled(c) && reachable(member, c)) ?? null;
}

export function channelLabel(channel: ChannelId | null): string {
  return channel ? CHANNEL_LABELS[channel] : "no channel";
}

/** Every channel that could reach this person, in fallback order. */
export function reachableChannels(member: TeamMember, settings: Settings): ChannelId[] {
  return ORDER.filter((c) => settings.channels[c] !== false && reachable(member, c));
}
