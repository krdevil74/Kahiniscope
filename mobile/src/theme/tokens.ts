/**
 * Design tokens, transcribed from the handoff.
 *
 * Colours, typography, spacing and radii are final, so this file is the only
 * place any of them are written down. Nothing in the app hard-codes a hex
 * value or a pixel size that appears here.
 */

export const colors = {
  /** Text, header bar, nav bar, primary buttons, progress fill. */
  ink: "#1b1a17",
  /** Accent, FAB, primary action buttons, member header, verified badge. */
  brandYellow: "#ffc20a",
  /** Pressed state on yellow. */
  yellowHover: "#ffd451",
  /** Episode codes, links. */
  yellowDeep: "#b57f00",
  /** Canvas behind the phones. */
  page: "#f4f1ea",
  /** Cards. */
  surface: "#ffffff",
  /** Screen background, inset chips. */
  surfaceAlt: "#f7f5f0",
  /** Quote blocks, done rows. */
  surfaceSunken: "#f9f7f2",
  /** Stepper squares, unselected avatars. */
  fill: "#f0ece2",
  /** Card borders. */
  hairline: "#e8e3d8",
  /** Input borders. */
  hairlineStrong: "#e0dacd",
  /** Tick boxes. */
  hairlineStronger: "#ddd5c4",
  /** Stat cell gutters. */
  gutter: "#e6e1d6",
  /** Overdue counts. */
  danger: "#a3210f",
  /** Done / clear badges. */
  successFg: "#2f6b45",
  successBg: "#edf3ee",
  /** Selected episode row on the Assign form. */
  selectedFill: "#fff8e3",
  /** Header subtitle, on ink. */
  onInkMuted: "rgba(255,255,255,.5)",
  white: "#ffffff",
} as const;

/**
 * The escalation heat scale, indexed by reminders sent. Step 4 is the last
 * entry and every step past it reuses that entry — the ladder caps at daily.
 */
export interface HeatStep {
  bg: string;
  fg: string;
  label: string;
  /** Fill width of the 3px heat bar, as a fraction. */
  bar: number;
}

export const heat: readonly HeatStep[] = [
  { bg: "#eef1f4", fg: "#3f5261", label: "On track", bar: 0.12 },
  { bg: "#fff4d6", fg: "#8a6400", label: "Reminded", bar: 0.32 },
  { bg: "#ffe7cd", fg: "#8d4500", label: "Chasing", bar: 0.56 },
  { bg: "#ffdbd0", fg: "#94331a", label: "Escalated", bar: 0.8 },
  { bg: "#fdd0cc", fg: "#a3210f", label: "Daily", bar: 1 },
] as const;

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
