/**
 * The Assign form's rules: what makes a valid task, what the ladder preview
 * says, and what gets written.
 *
 * Pure: no Firebase, no React. Unit tested.
 */

import type { ChannelId } from "./model";

export interface AssignDraft {
  assigneeUid: string | null;
  episodeId: string | null;
  type: string | null;
  /** Days from today. Minimum 1 — a task due today has already run out of time. */
  dueInDays: number;
  channel: ChannelId | null;
}

export const MIN_DUE_DAYS = 1;

export const INITIAL_DRAFT: AssignDraft = {
  assigneeUid: null,
  episodeId: null,
  type: null,
  dueInDays: 5,
  channel: null,
};

/** The stepper never goes below one day. */
export function stepDueDays(current: number, delta: number): number {
  return Math.max(MIN_DUE_DAYS, Math.trunc(current) + delta);
}

export function isComplete(draft: AssignDraft): boolean {
  return Boolean(
    draft.assigneeUid && draft.episodeId && draft.type && draft.dueInDays >= MIN_DUE_DAYS
  );
}

/** What is still missing, for the button to say so instead of going grey in silence. */
export function missingFrom(draft: AssignDraft): string | null {
  if (!draft.assigneeUid) return "Pick a person";
  if (!draft.episodeId) return "Pick an episode";
  if (!draft.type) return "Pick a task";
  return null;
}

export function dueDateFrom(now: Date, dueInDays: number): Date {
  const due = new Date(now);
  due.setDate(due.getDate() + Math.max(MIN_DUE_DAYS, Math.trunc(dueInDays)));
  return due;
}

/**
 * The five bars in the ladder preview. Heights rise left to right exactly as
 * the design draws them; the colour is the heat scale's foreground for that
 * step, which the component looks up.
 */
export interface LadderBar {
  days: number;
  height: number;
  step: number;
}

export function ladderBars(plan: readonly number[]): LadderBar[] {
  return plan.map((days, index) => ({ days, height: 22 + index * 8, step: index }));
}

/** "First nudge 7 days after assigning, then 4, 3, 2, 1 day gaps, then daily until done." */
export function ladderNote(plan: readonly number[]): string {
  if (plan.length === 0) return "No ladder set — reminders will not go out.";
  if (plan.length === 1) {
    return `A nudge every ${plan[0]} day${plan[0] === 1 ? "" : "s"} until the task is done.`;
  }
  return (
    `First nudge ${plan[0]} days after assigning, then ${plan.slice(1).join(", ")} day gaps, ` +
    `then ${plan[plan.length - 1] === 1 ? "daily" : `every ${plan[plan.length - 1]} days`} until done.`
  );
}

export function submitLabel(firstName: string): string {
  return firstName ? `Assign to ${firstName} & notify` : "Assign & notify";
}

/** "Voice recording assigned to Rizu Ahmed · first reminder in 7 days" */
export function assignedToast(type: string, name: string, plan: readonly number[]): string {
  const first = plan[0] ?? 1;
  return `${type} assigned to ${name} · first reminder in ${first} day${first === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// Episodes
// ---------------------------------------------------------------------------

/**
 * The next code in the run: EP-41, EP-42, EP-43 → EP-44.
 *
 * There is no screen in the handoff for creating an episode, but tasks cannot
 * exist without one, so the Assign form offers it. Suggesting the next number
 * keeps the codes in sequence without making anybody remember where they were.
 */
export function nextEpisodeCode(existing: readonly { code: string }[]): string {
  const numbers = existing
    .map((e) => /^EP-(\d+)$/i.exec(e.code.trim())?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number);

  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `EP-${String(next).padStart(2, "0")}`;
}

export interface EpisodeDraft {
  code: string;
  title: string;
  airInDays: number;
}

export function isEpisodeValid(draft: EpisodeDraft): boolean {
  return draft.code.trim().length > 0 && draft.title.trim().length > 0 && draft.airInDays >= 0;
}

// ---------------------------------------------------------------------------
// Finding a person once there are more than a screenful
// ---------------------------------------------------------------------------

/**
 * How many people the "Assign to" row shows before it collapses behind a
 * "+ n more". Six is two comfortable rows of chips on a narrow phone; past
 * that the row starts pushing the rest of the form off the screen, which is
 * the actual problem — not the number of people.
 */
export const COLLAPSED_PEOPLE = 6;

/**
 * Match on name or craft, because "who does the voices" is as natural a way
 * to look somebody up as their name. Case and surrounding space are ignored;
 * an empty query is not a filter.
 *
 * Pure: no React, no Firebase. Unit tested.
 */
export function searchPeople<T extends { name: string; crafts: string[] }>(
  people: readonly T[],
  query: string
): T[] {
  const needle = (query ?? "").trim().toLowerCase();
  if (!needle) return [...people];
  return people.filter((person) => {
    const haystack = [person.name, ...person.crafts].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}
