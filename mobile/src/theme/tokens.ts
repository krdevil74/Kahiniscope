/**
 * Design tokens.
 *
 * Colours come from one palette — see palettes.ts — and there is no theme to
 * switch. An earlier version carried a light and a dark palette swapped in
 * place at runtime; that is gone, along with the rule it imposed about never
 * reading a colour at module scope. `colors` is an ordinary constant again.
 *
 * Sizes and spacing are final and always were.
 */

import { HEAT, PALETTE, type HeatStep, type Palette } from "./palettes.ts";

export type { HeatStep, Palette };

export const colors = PALETTE;
export const heat = HEAT;

/** The heat for a task, capped at the last step. */
export function heatFor(remindersSent: number): HeatStep {
  const index = Math.min(Math.max(Math.trunc(remindersSent) || 0, 0), heat.length - 1);
  return heat[index];
}

export const radii = {
  badge: 4,
  chip: 6,
  tick: 6,
  chipLarge: 8,
  cardSmall: 9,
  card: 12,
  cardLarge: 13,
  cardHero: 14,
  /** Compact buttons: Nudge now, Approve, Decline. */
  button: 8,
  /** Full-width primary buttons: Assign, Mark done. */
  buttonLarge: 12,
  pill: 99,
} as const;

export const spacing = {
  /** Screen padding, left and right. */
  screen: 14,
  /** Between cards in a list. */
  cards: 10,
  cardsTight: 8,
  /** Inside a card. */
  card: 14,
  cardTight: 12,
  /** Between chips in a row. */
  chips: 7,
  chipsTight: 6,
} as const;

/**
 * Nothing below 9px, and no tap target below 44px. The tick boxes in episode
 * detail are 20px, so their rows carry the padding that gets them to 44.
 */
export const MIN_TAP_TARGET = 44;

export const layout = {
  headerLogo: 40,
  pendingLogo: 76,
  fab: 54,
  fabRight: 18,
  fabBottom: 96,
  toastBottom: 104,
  toastInset: 16,
  /** Milliseconds a toast stays up. */
  toastDuration: 2600,
  avatarLarge: 38,
  avatar: 32,
  avatarSmall: 36,
  avatarTiny: 22,
  tickBox: 20,
  toggleWidth: 44,
  toggleHeight: 26,
  heatBar: 3,
  progressBar: 6,
  progressBarLarge: 7,
  memberTaskBar: 4,
} as const;

/** Two families, no others. */
export const fontFamily = {
  /** All UI text and headings. */
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  /** For the few places that need to shout: a total, a seal. */
  extrabold: "PlusJakartaSans_800ExtraBold",
  /** Every number, count, percentage, countdown, code, endpoint, timestamp. */
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
  monoSemibold: "IBMPlexMono_600SemiBold",
  /**
   * Space Grotesk has no Bengali coverage, and episode titles are Bengali.
   * Applied by fontForText() rather than chosen by hand.
   */
  bengali: "NotoSansBengali_400Regular",
  bengaliMedium: "NotoSansBengali_500Medium",
  bengaliSemibold: "NotoSansBengali_600SemiBold",
} as const;

export const lineHeight = {
  heading: 1.2,
  body: 1.45,
  loose: 1.65,
} as const;

export const opacity = {
  pressed: 0.82,
  disabled: 0.45,
} as const;
