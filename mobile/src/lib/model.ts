/**
 * The shapes the app works in.
 *
 * Firestore timestamps are converted to plain Dates at the edge (data.ts), so
 * nothing below the data layer has to know about Firestore at all — which is
 * what lets the escalation and completion rules be tested on their own.
 */

export type Role = "owner" | "admin" | "member";
export type AccountStatus = "pending" | "approved";
export type ChannelId = "push" | "telegram" | "whatsapp" | "sms";

/** The nine task types, exactly as written. */
export const TASK_TYPES = [
  "Script writing",
  "Translation",
  "Voice recording",
  "Dubbing / mixing",
  "Editing",
  "Thumbnail / graphics",
  "Upload & SEO",
  "Music / SFX",
  "Proofreading",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

/** The crafts a member registers under. */
export const CRAFTS = [
  "Script",
  "Translation",
  "Voice",
  "Post / mix",
  "Graphics",
  "Proofreading",
  "Editing",
] as const;

export type Craft = (typeof CRAFTS)[number];

export interface Episode {
  id: string;
  code: string;
  /** Bengali. */
  title: string;
  airDate: Date | null;
  status: "production" | "released";
}

export interface Task {
  id: string;
  episodeId: string;
  assigneeUid: string;
  type: string;
  dueDate: Date | null;
  done: boolean;
  doneAt: Date | null;
  /** 0-based escalation step: how many reminders have gone out. */
  remindersSent: number;
  lastReminderAt: Date | null;
  assignedAt: Date | null;
  preferredChannel: ChannelId | null;
}

export interface TeamMember {
  uid: string;
  name: string;
  email: string;
  phone: string | null;
  telegramChatId: string | null;
  craft: string | null;
  status: AccountStatus;
  role: Role;
  fcmTokens: string[];
  note: string | null;
  /**
   * Which channel the admin wants this person reminded on. A preference, not
   * a restriction — the chain still falls through if it fails. Null means
   * "whatever reaches them first".
   */
  preferredChannel: ChannelId | null;
  createdAt: Date | null;
}

export interface ReminderLogEntry {
  id: string;
  taskId: string;
  uid: string;
  channel: string;
  sentAt: Date | null;
  result: "delivered" | "failed";
  error: string | null;
}

export interface QuietHours {
  enabled: boolean;
  from: number;
  to: number;
  sendQueuedAt: number;
}

export interface Settings {
  /** The escalation ladder. [7, 4, 3, 2, 1], then the last value forever. */
  plan: number[];
  quietHours: QuietHours;
  channels: Record<ChannelId | "email", boolean>;
}

export const DEFAULT_SETTINGS: Settings = {
  plan: [7, 4, 3, 2, 1],
  quietHours: { enabled: true, from: 22, to: 8, sendQueuedAt: 9 },
  // Only the free channels are on by default — see functions/src/config.ts.
  channels: { push: true, telegram: true, whatsapp: false, sms: false, email: false },
};
