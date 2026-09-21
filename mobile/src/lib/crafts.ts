/**
 * Crafts: what a person actually does.
 *
 * One person is rarely one thing — the same voice artist edits, the
 * translator proofreads — so a member holds a list rather than a single
 * value. Records written before this existed have a `craft` string instead,
 * and are read as a list of one: a migration that never has to be run.
 *
 * Pure: no Firebase, no React. Unit tested.
 */

import { CRAFTS } from "./model.ts";

/** At most this many, so the chips stay one or two lines on a phone. */
export const MAX_CRAFTS = 5;

/** Read the list off a raw document, tolerating the single-value shape. */
export function craftsFrom(crafts: unknown, craft?: unknown): string[] {
  if (Array.isArray(crafts)) {
    const cleaned = crafts.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0
    );
    return dedupe(cleaned).slice(0, MAX_CRAFTS);
  }
  if (typeof craft === "string" && craft.trim().length > 0) return [craft];
  return [];
}

/** "Voice · Editing", or "no craft" — never an empty string on screen. */
export function craftLabel(crafts: string[]): string {
  return crafts.length > 0 ? crafts.join(" · ") : "no craft";
}

/**
 * What the approve button agrees to. One craft reads naturally; several read
 * better counted than listed, because the button is narrow.
 */
export function approveLabel(crafts: string[]): string {
  if (crafts.length === 0) return "Approve";
  if (crafts.length === 1) return `Approve as ${crafts[0]}`;
  return `Approve as ${crafts[0]} +${crafts.length - 1}`;
}

/** Toggle one craft in a selection, keeping the offered order and the cap. */
export function toggleCraft(selected: string[], craft: string): string[] {
  if (selected.includes(craft)) return selected.filter((c) => c !== craft);
  if (selected.length >= MAX_CRAFTS) return selected;
  const order = CRAFTS as readonly string[];
  return dedupe([...selected, craft]).sort(
    (a, b) => order.indexOf(a) - order.indexOf(b)
  );
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}
