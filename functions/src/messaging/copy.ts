/**
 * What the messages say.
 *
 * The handoff sets the pattern:
 *   {TaskType} for {EP-code} {Bengali title} is {n} days overdue. Reply/tap when done.
 *
 * Pure. Unit tested — this text is the product as far as most of the team is
 * concerned, since it is all they ever see of the app.
 */

export interface TaskLine {
  taskType: string;
  episodeCode: string;
  episodeTitle: string;
  daysOverdue: number;
}

/** "4 days overdue", "due today", "due in 3 days". */
export function overduePhrase(daysOverdue: number): string {
  if (daysOverdue > 0) return `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`;
  if (daysOverdue === 0) return "due today";
  const days = Math.abs(daysOverdue);
  return `due in ${days} day${days === 1 ? "" : "s"}`;
}

/** "Voice recording for EP-41 রক্তমুখী নীলা is 4 days overdue." */
export function taskSentence(task: TaskLine): string {
  const what = [task.taskType, "for", task.episodeCode, task.episodeTitle]
    .filter(Boolean)
    .join(" ")
    .trim();
  return `${what} is ${overduePhrase(task.daysOverdue)}.`;
}

export function reminderShort(task: TaskLine): string {
  return `${task.taskType} · ${task.episodeCode} · ${overduePhrase(task.daysOverdue)}`;
}

/** A single overdue task. */
export function reminderBody(name: string, task: TaskLine): string {
  const greeting = name ? `${name.split(" ")[0]}, ` : "";
  return `${greeting}${taskSentence(task)} Tap Mark done when it is finished.`;
}

/** One message covering everything a person owes — the Nudge all button. */
export function digestBody(name: string, tasks: readonly TaskLine[]): string {
  const greeting = name ? `${name.split(" ")[0]}, ` : "";
  if (tasks.length === 0) return `${greeting}nothing is open for you right now.`;
  if (tasks.length === 1) return reminderBody(name, tasks[0]);

  const lines = tasks.map((t) => `• ${t.taskType} — ${t.episodeCode} ${t.episodeTitle} (${overduePhrase(t.daysOverdue)})`);
  return (
    `${greeting}you have ${tasks.length} open tasks:\n${lines.join("\n")}\n` +
    `Open Kahiniscope to close them.`
  );
}

export function digestShort(tasks: readonly TaskLine[]): string {
  return tasks.length === 1
    ? reminderShort(tasks[0])
    : `${tasks.length} open tasks · ${tasks.filter((t) => t.daysOverdue > 0).length} overdue`;
}

/** The welcome a member gets the moment they are approved. */
export function welcomeBody(name: string, crafts: readonly string[] | null): string {
  const craft = crafts && crafts.length > 0 ? crafts.join(" · ") : null;
  const greeting = name ? `${name.split(" ")[0]}, ` : "";
  return (
    `${greeting}you are approved${craft ? ` as ${craft}` : ""} on Kahiniscope. ` +
    `Open the app to see anything assigned to you — reminders will arrive here too.`
  );
}

// ---------------------------------------------------------------------------
// What an admin just did to somebody's work
// ---------------------------------------------------------------------------

/** Rupees, written the way they are written in India. */
function money(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function firstName(name: string): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

export function approvedShort(taskType: string): string {
  return `${taskType} approved`;
}

/**
 * Approved, and what happens to the money. The two cases read differently on
 * purpose: one is a promise of payment, the other is payment.
 */
export function approvedBody(
  name: string,
  taskType: string,
  outcome: { settledFromAdvance: boolean; amount: number | null; balanceAfter: number }
): string {
  const opening = `${firstName(name)}, your ${taskType} has been approved.`;
  if (outcome.settledFromAdvance && outcome.amount !== null) {
    return (
      `${opening} ${money(outcome.amount)} has been taken off the advance you were ` +
      `already paid, leaving ${money(outcome.balanceAfter)}.`
    );
  }
  if (outcome.amount !== null) {
    return (
      `${opening} ${money(outcome.amount)} is now pending — the final amount is set by ` +
      `the admin and can differ depending on what the work needed.`
    );
  }
  return `${opening} The amount will be settled by the admin.`;
}

export function rejectedShort(taskType: string): string {
  return `${taskType} needs another look`;
}

export function rejectedBody(name: string, taskType: string, note: string): string {
  return (
    `${firstName(name)}, your ${taskType} has come back for changes: ${note} ` +
    `Submit it again in the app when it is ready.`
  );
}

export function paidShort(amount: number): string {
  return `${money(amount)} paid`;
}

export function paidBody(name: string, taskType: string, amount: number): string {
  return `${firstName(name)}, ${money(amount)} has been paid to you for ${taskType}.`;
}

export function advanceShort(amount: number): string {
  return `${money(amount)} advanced`;
}

export function advanceBody(name: string, amount: number, balance: number, note: string | null): string {
  const reason = note ? ` (${note})` : "";
  return (
    `${firstName(name)}, ${money(amount)} has been advanced to you${reason}. ` +
    `Your balance is ${money(balance)}, and approved work is taken off it.`
  );
}
