/**
 * Design tokens.
 *
 * Colours are no longer constants: the app carries a light and a dark theme
 * and either can be chosen at runtime, so `colors` is a live object whose
 * contents are swapped by `applyPalette` when the choice changes.
 *
 * That is a deliberate trade, and worth being honest about. The textbook
 * answer is a `useTheme()` hook — but 308 references across 34 files read
 * `colors.x` directly, several of them from style helpers that sit outside a
 * component and cannot call a hook at all. Rewriting every one of those to
 * thread a theme through would have been a far larger and riskier change
 * than the feature warranted, and a half-converted app is worse than either
 * end of it.
 *
 * What makes the swap safe is that nothing here is captured: every screen
 * reads `colors.x` during render, into an inline style object, so a mutation
 * followed by a re-render is picked up everywhere at once. ThemeProvider does
 * exactly that — mutate, then bump a context value that re-renders the tree.
 * The one thing to avoid is hoisting a style object to module scope with a
 * colour baked into it; do that and it will not follow the theme.
 *
 * Sizes and spacing are genuinely final and stay constants.
 */

import { DARK, DARK_HEAT, LIGHT, LIGHT_HEAT, type HeatStep, type Palette } from "./palettes.ts";

export type { HeatStep, Palette };
export type ColorScheme = "light" | "dark";

/** Live. Read during render; never destructured into module scope. */
export const colors: Palette = { ...DARK };

let heatSteps: readonly HeatStep[] = DARK_HEAT;

/** Swap the palette in place. ThemeProvider re-renders the tree afterwards. */
export function applyPalette(scheme: ColorScheme): void {
  Object.assign(colors, scheme === "light" ? LIGHT : DARK);
  heatSteps = scheme === "light" ? LIGHT_HEAT : DARK_HEAT;
}

/**
 * The escalation heat scale, indexed by reminders sent. Step 4 is the last
 * entry and every step past it reuses that entry — the ladder caps at daily.
 */
/** The active heat scale. Swapped with the palette. */
export const heat = { get steps(): readonly HeatStep[] { return heatSteps; } };

/** The heat for a task, capped at the last step. */
export function heatFor(remindersSent: number): HeatStep {
  const steps = heatSteps;
  const index = Math.min(Math.max(Math.trunc(remindersSent) || 0, 0), steps.length - 1);
  return steps[index];
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
  regular: "SpaceGrotesk_400Regular",
  medium: "SpaceGrotesk_500Medium",
  semibold: "SpaceGrotesk_600SemiBold",
  bold: "SpaceGrotesk_700Bold",
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
