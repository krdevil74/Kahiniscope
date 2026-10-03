/**
 * The Episodes screen's two halves, in words.
 *
 * The screen asks the server three bounded questions instead of loading the
 * slate — see lib/data.ts — and this is the copy that makes the answers
 * readable, plus the one piece of arithmetic that matters: how many broadcast
 * episodes the month filter cannot see.
 *
 * That gap is real and it is not a bug to hide. `broadcastAt` is written when
 * an episode is marked broadcast, and an episode marked before that field
 * existed has none — a query ordered by it skips them entirely. Saying "4 of 11
 * have no broadcast date" is the difference between a filter somebody can trust
 * and one that quietly loses things.
 *
 * Pure: no Firebase, no React. Unit tested.
 */

import { monthLong, type MonthSlot } from "./months.ts";

/** Which half of the slate is open. */
export type SlateHalf = "in-progress" | "broadcast";

export function tileLabel(half: SlateHalf): string {
  return half === "in-progress" ? "In progress" : "Broadcast";
}

/** How many broadcast episodes carry no date, and so cannot be filtered. */
export function undatedBroadcast(broadcast: number, dated: number): number {
  return Math.max(0, broadcast - dated);
}

/**
 * The line under the month chips, when some episodes went out before the app
 * started recording when.
 */
export function broadcastGapNote(broadcast: number, dated: number): string | null {
  const missing = undatedBroadcast(broadcast, dated);
  if (missing === 0) return null;
  return `${missing} of ${broadcast} broadcast ${
    missing === 1 ? "episode has" : "episodes have"
  } no broadcast date and will not appear in any month. They were marked broadcast before the app recorded it.`;
}

/** Why a month came back empty — which is a different sentence if dates are missing. */
export function monthEmptyNote(
  month: MonthSlot | null,
  broadcast: number,
  dated: number
): string {
  const where = month ? monthLong(month) : "that month";
  const missing = undatedBroadcast(broadcast, dated);
  if (missing > 0) {
    return `Nothing went out in ${where} — though ${missing} older ${
      missing === 1 ? "episode has" : "episodes have"
    } no broadcast date and cannot appear in any month.`;
  }
  return `Nothing went out in ${where}. Try another month or year.`;
}

/**
 * "6 episodes · 48 of 61 tasks done".
 *
 * Counted over what is on screen rather than over everything, and says so by
 * naming the number of episodes first — a percentage with no denominator in
 * sight is the kind of number people quote at each other wrongly.
 */
export function listedSummary(
  half: SlateHalf,
  episodes: number,
  completion: { done: number; total: number }
): string {
  if (episodes === 0) {
    return half === "in-progress" ? "Nothing in progress" : "Nothing that month";
  }
  const slate = `${episodes} ${episodes === 1 ? "episode" : "episodes"}`;
  if (completion.total === 0) return `${slate} · no tasks yet`;
  return `${slate} · ${completion.done} of ${completion.total} tasks done`;
}
