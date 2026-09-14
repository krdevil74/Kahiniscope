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
export function welcomeBody(name: string, craft: string | null): string {
  const greeting = name ? `${name.split(" ")[0]}, ` : "";
  return (
    `${greeting}you are approved${craft ? ` as ${craft}` : ""} on Kahiniscope. ` +
    `Open the app to see anything assigned to you — reminders will arrive here too.`
  );
}
