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

/**
 * Where a piece of work has got to.
 *
 *   open      → nobody has handed anything in. Reminders climb the ladder.
 *   submitted → handed in, waiting on an admin. Reminders stop: the member
 *               has done their part and chasing them would be wrong.
 *   approved  → accepted. A payment record exists and is pending.
 *   paid      → the money has gone out.
 *
 * Rejection is not a state: it puts the task back to `open` and leaves
 * `rejectedAt` and `rejectionNote` behind, which is what turns the ladder
 * into the every-other-day chase.
 */
export type TaskStatus = "open" | "submitted" | "approved" | "paid";

/** Everything is in rupees. One currency, no conversion anywhere. */
export const CURRENCY = "₹";

/**
 * What one person is paid per unit. Null means they are not on a rate for
 * that kind of work, and the admin types a figure instead. Lives here
 * because it is part of the shape of a person; the arithmetic is in
 * lib/payments.ts.
 */
export interface Rates {
  /** Per minute of finished audio, performing a character. */
  voiceCharacter: number | null;
  /** Per minute of finished audio, reading narration. */
  voiceNarration: number | null;
  /** Per minute, for the mix. */
  soundDesign: number | null;
  /** Per cover delivered. */
  cover: number | null;
}

export const EMPTY_RATES: Rates = {
  voiceCharacter: null,
  voiceNarration: null,
  soundDesign: null,
  cover: null,
};

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
  status: TaskStatus;
  /**
   * Accepted work: `status` is approved or paid. Stored alongside the status
   * rather than derived on the fly, because every percentage on every screen
   * and the escalation job's own query were written against it, and a
   * rewrite of all of them would have been a much larger change than this
   * feature is.
   */
  done: boolean;
  doneAt: Date | null;
  submittedAt: Date | null;
  /** Set when an admin sent it back. Cleared on the next submission. */
  rejectedAt: Date | null;
  rejectionNote: string | null;
  /** How many times it has come back. Shown to both sides; never reset. */
  rejectedCount: number;
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
  /** What this person works in. Several are allowed — see lib/crafts.ts. */
  crafts: string[];
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
  /** What this person is paid per unit. See lib/payments.ts. */
  rates: Rates;
  /**
   * Money already handed over and not yet worked off, in rupees.
   *
   * An advance is paid before the work exists, so it cannot be attached to a
   * task. It sits here as a credit, and approving that person's work spends
   * it — which is why the balance is server-owned and no client may write it.
   */
  balance: number;
  /**
   * Added by an admin against a phone number, with no Firebase Auth account
   * behind it: somebody who does the work but has not installed the app.
   * Assignable and remindable like anyone else, but never signs in, so push
   * is not a channel that can reach them.
   */
  accountless: boolean;
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
