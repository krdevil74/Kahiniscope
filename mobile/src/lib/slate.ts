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

/**
 * A count that did not answer. A dash rather than a zero, because "0 broadcast"
 * is a statement about the channel and this is a statement about the asking.
 */
export function countLabel(count: number | null): string {
  return count === null ? "—" : String(count);
}

/** The screen's own subtitle: the two halves, each as honest as it can be. */
export function slateSubtitle(inProgress: number | null, broadcast: number | null): string {
  return `${countLabel(inProgress)} in progress · ${countLabel(broadcast)} broadcast`;
}

/** How many broadcast episodes carry no date, and so cannot be filtered. */
export function undatedBroadcast(broadcast: number | null, dated: number | null): number {
  if (broadcast === null || dated === null) return 0;
  return Math.max(0, broadcast - dated);
}

/**
 * Episodes in neither half.
 *
 * Both halves ask the server for named status spellings — `in_progress` or
 * `production`, `broadcast` or `released` — because a Firestore query cannot
 * fold the old words into the new pair the way reading one document can. An
 * episode stored as anything else is in neither query and so appears **nowhere
 * on this screen**, where before the slate was split it was folded into "in
 * progress" on the phone and at least visible.
 *
 * That is worth saying out loud rather than leaving somebody to count the
 * tiles and wonder. `null` when any of the three counts did not answer: a gap
 * worked out from a number that failed is not a gap.
 */
export function strandedEpisodes(
  total: number | null,
  inProgress: number | null,
  broadcast: number | null
): number | null {
  if (total === null || inProgress === null || broadcast === null) return null;
  return Math.max(0, total - inProgress - broadcast);
}

export function strandedNote(
  total: number | null,
  inProgress: number | null,
  broadcast: number | null
): string | null {
  const stranded = strandedEpisodes(total, inProgress, broadcast);
  if (!stranded) return null;
  return `${stranded} ${
    stranded === 1 ? "episode is" : "episodes are"
  } in neither half — the status written on ${
    stranded === 1 ? "it" : "them"
  } is a spelling this screen does not know. Open ${
    stranded === 1 ? "it" : "them"
  } from a task or a payment row and set the status to put ${
    stranded === 1 ? "it" : "them"
  } back.`;
}

/**
 * The line under the month chips, when some episodes went out before the app
 * started recording when.
 */
export function broadcastGapNote(broadcast: number | null, dated: number | null): string | null {
  const missing = undatedBroadcast(broadcast, dated);
  if (missing === 0) return null;
  return `${missing} of ${countLabel(broadcast)} broadcast ${
    missing === 1 ? "episode has" : "episodes have"
  } no broadcast date and will not appear in any month. They were marked broadcast before the app recorded it.`;
}

/** Why a month came back empty — which is a different sentence if dates are missing. */
export function monthEmptyNote(
  month: MonthSlot | null,
  broadcast: number | null,
  dated: number | null
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

/** Why a month came back with nothing because it could not be asked at all. */
export function monthUnreadableNote(month: MonthSlot | null): string {
  const where = month ? monthLong(month) : "that month";
  return `${where} could not be read — nothing has been lost. Tap the month again to retry.`;
}
