/**
 * What a channel is, from the sender's point of view.
 */

export type ChannelId = "push" | "telegram" | "whatsapp" | "sms";

/** The fallback chain, in the order the handoff's escalation engine tries it. */
export const CHAIN: ChannelId[] = ["push", "telegram", "whatsapp", "sms"];

export interface Recipient {
  uid: string;
  name: string;
  phone: string | null;
  telegramChatId: string | null;
  fcmTokens: string[];
}

export interface ReminderMessage {
  /** One line, for push titles and SMS. */
  short: string;
  /** The full text, for Telegram and WhatsApp. */
  body: string;
  /** Tasks this message covers. One for a reminder, several for Nudge all. */
  taskIds: string[];
  /** Set when a single task can be closed from the message itself. */
  actionableTaskId: string | null;
  /** For the WhatsApp template's positional parameters. */
  template: { taskType: string; episode: string; daysOverdue: number } | null;
}

export type SendOutcome =
  /** It went. */
  | { result: "delivered"; channel: ChannelId; detail?: string }
  /** It could have gone but did not — try the next channel. */
  | { result: "failed"; channel: ChannelId; error: string }
  /** Nothing to try: switched off, or this person has no address for it. */
  | { result: "skipped"; channel: ChannelId; error: string };

export interface ChannelAdapter {
  id: ChannelId;
  /** Can this channel reach this person at all? */
  canReach: (to: Recipient) => boolean;
  send: (to: Recipient, message: ReminderMessage) => Promise<SendOutcome>;
}
