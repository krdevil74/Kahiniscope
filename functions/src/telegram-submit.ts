/**
 * What a tap on a reminder's Telegram button does to a task.
 *
 * It submits the task for review — exactly what Submit for review does in
 * the app — and nothing more. It used to set `done: true`, which skipped the
 * admin's review and with it the payment that approving opens, and which the
 * escalation engine (it reads `status`) did not even see, so the reminders
 * carried on. A member hands work in; only an admin accepts it, on any channel.
 *
 * Pure, so the decision is tested apart from the webhook.
 */

export type TapOutcome = "submit" | "already-submitted" | "already-accepted";

export function tapOutcome(task: { status?: unknown; done?: unknown }): TapOutcome {
  // `done` alone is how tasks closed from Telegram before this fix look.
  if (task.status === "approved" || task.status === "paid" || task.done === true) {
    return "already-accepted";
  }
  if (task.status === "submitted") return "already-submitted";
  return "submit";
}

/** What the admin reads where the app would show the member's own note. */
export const TELEGRAM_SUBMISSION_NOTE = "Submitted from Telegram.";

/** The toast Telegram shows on the member's phone after the tap. */
export function tapAnswer(outcome: TapOutcome): string {
  switch (outcome) {
    case "submit":
      return "Submitted for review. Reminders stopped.";
    case "already-submitted":
      return "Already submitted — the admin will review it.";
    case "already-accepted":
      return "Already approved. Nothing more to do.";
  }
}
