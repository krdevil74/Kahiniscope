/**
 * What may be deleted, and what the app says when it may not.
 *
 * The server decides — `functions/src/removal.ts` makes the same two checks
 * against the database and is the one that counts. This exists so the screen
 * can grey a control out and say why, instead of offering a button that fails.
 *
 * The line is money. A task that has been accepted has a payment record naming
 * it, and deleting the task leaves the payment pointing at nothing: an amount
 * owed to somebody for a job that is no longer there. An episode whose work has
 * been accepted is the same thing one level up. Neither is a warning to click
 * through — the way to get finished work off the board is to mark the episode
 * broadcast, which keeps every record and stops it being offered for new tasks.
 *
 * Pure: no Firebase, no React. Unit tested.
 */

import type { Task } from "./model.ts";

/** Accepted, by the status or by the `done` an older build left behind. */
export function isAccepted(task: Pick<Task, "status" | "done">): boolean {
  return task.status === "approved" || task.status === "paid" || task.done;
}

export interface Deletable {
  ok: boolean;
  /** Why not, in a sentence that fits under a button. */
  reason: string | null;
}

export function taskDeletable(task: Pick<Task, "status" | "done">): Deletable {
  if (isAccepted(task)) {
    return { ok: false, reason: "Approved work cannot be deleted — there is a payment against it." };
  }
  return { ok: true, reason: null };
}

/**
 * An episode goes only if nothing on it has been accepted. The count is in the
 * reason because "one of eleven" and "nine of eleven" are different decisions.
 */
export function episodeDeletable(tasks: readonly Pick<Task, "status" | "done">[]): Deletable {
  const accepted = tasks.filter(isAccepted).length;
  if (accepted === 0) return { ok: true, reason: null };
  return {
    ok: false,
    reason: `${accepted} ${accepted === 1 ? "task has" : "tasks have"} been approved — mark the episode broadcast instead.`,
  };
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * What the episode's delete button says before it is pressed.
 *
 * It names the number of tasks going with it, because that is the part nobody
 * expects: deleting EP-61 deletes the nine tasks on it, and a button that says
 * only "Delete episode" has not said so.
 */
export function deleteEpisodeLabel(taskCount: number, confirming: boolean): string {
  if (!confirming) return "Delete this episode";
  if (taskCount === 0) return "Delete it — tap again";
  return `Delete it and ${taskCount} ${taskCount === 1 ? "task" : "tasks"} — tap again`;
}

export function taskDeletedToast(type: string): string {
  return `${type} deleted`;
}

export function episodeDeletedToast(code: string, taskCount: number): string {
  if (taskCount === 0) return `${code} deleted`;
  return `${code} deleted, with ${taskCount} ${taskCount === 1 ? "task" : "tasks"}`;
}
