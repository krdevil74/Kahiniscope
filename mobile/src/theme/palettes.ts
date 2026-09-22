/**
 * The two palettes, and the rule that keeps five loud colours from becoming
 * a poster.
 *
 *   #9B5DE5  purple   the brand. Primary actions, headers.
 *   #F15BB5  pink     attention. Overdue, sent back, registrations waiting.
 *   #FEE440  yellow   heat. The escalation ladder, and an estimate.
 *   #00BBF9  blue     information. The review queue, a contact match.
 *   #00F5D4  mint     money. Paid, done, earned.
 *
 * Each colour has one job and nothing else, so a screen means something at a
 * glance: mint is always money, pink is always something wanting attention.
 * Purple and pink appear together only as the primary-action gradient, which
 * is what makes that gradient read as "the button".
 *
 * The client's yellow mark is untouched by any of this. It is the one thing
 * everybody already recognises, so the palette works around it rather than
 * over it — which is also why the brand accent here is purple and not another
 * yellow that would compete with it.
 *
 * Both palettes carry exactly the same keys. A screen never asks which one is
 * in use; it asks for `colors.danger` and gets something that reads as danger
 * on whatever background it is sitting on.
 */

export interface Palette {
  /**
   * Primary text. In the light theme this is also the colour of the header
   * and nav bars, which is why the two were one token for a long time — in
   * the dark theme they are opposites, so they are two now.
   */
  ink: string;
  /** The header, the nav bar, and anything else drawn as a dark slab. */
  bar: string;
  /** Text on `bar`. */
  onBar: string;
  brandYellow: string;
  yellowHover: string;
  yellowDeep: string;
  page: string;
  surface: string;
  surfaceAlt: string;
  surfaceSunken: string;
  fill: string;
  hairline: string;
  hairlineStrong: string;
  hairlineStronger: string;
  gutter: string;
  danger: string;
  successFg: string;
  successBg: string;
  selectedFill: string;
  onInkMuted: string;
  white: string;
  /** New, and named for the job rather than the hue. */
  brand: string;
  brandPressed: string;
  /**
   * The primary action, as two stops. Purple and pink appear together only
   * here — that is what makes the gradient read as "the button" rather than
   * as decoration, and why nothing else in the app uses both at once.
   */
  brandGradient: readonly [string, string];
  brandGradientPressed: readonly [string, string];
  brandSoft: string;
  /** Pressed state on the dark bar. */
  barPressed: string;
  info: string;
  infoSoft: string;
  money: string;
  moneySoft: string;
  attention: string;
  attentionSoft: string;
  /** Body text and its two quieter degrees, already composited. */
  text: string;
  muted: string;
  faint: string;
  /** Android touch feedback. Dark ink on light, light ink on dark. */
  ripple: string;
  /** A heavier ripple, for the yellow "+" and other filled controls. */
  rippleStrong: string;
}

const PURPLE = "#9B5DE5";
const PINK = "#F15BB5";
const YELLOW = "#FEE440";
const BLUE = "#00BBF9";
const MINT = "#00F5D4";

export const DARK: Palette = {
  ink: "#F6F3FB",
  bar: "#1E1829",
  onBar: "#F6F3FB",
  brandYellow: "#FFC20A",
  yellowHover: "#FFD451",
  yellowDeep: YELLOW,
  page: "#08060C",
  surface: "#17121F",
  surfaceAlt: "#0D0A14",
  surfaceSunken: "#1E1829",
  fill: "#251E33",
  hairline: "rgba(255,255,255,.09)",
  hairlineStrong: "rgba(255,255,255,.13)",
  hairlineStronger: "rgba(255,255,255,.18)",
  gutter: "rgba(255,255,255,.07)",
  danger: PINK,
  successFg: MINT,
  successBg: "rgba(0,245,212,.12)",
  selectedFill: "rgba(155,93,229,.18)",
  onInkMuted: "rgba(246,243,251,.55)",
  white: "#FFFFFF",
  brand: PURPLE,
  brandPressed: "#8A4CD8",
  brandGradient: [PURPLE, PINK],
  brandGradientPressed: ["#8A4CD8", "#D94FA1"],
  brandSoft: "rgba(155,93,229,.16)",
  barPressed: "#2A2138",
  info: BLUE,
  infoSoft: "rgba(0,187,249,.14)",
  money: MINT,
  moneySoft: "rgba(0,245,212,.13)",
  attention: PINK,
  attentionSoft: "rgba(241,91,181,.14)",
  text: "#F6F3FB",
  muted: "rgba(246,243,251,.58)",
  faint: "rgba(246,243,251,.38)",
  ripple: "rgba(255,255,255,.10)",
  rippleStrong: "rgba(255,255,255,.18)",
};

export const LIGHT: Palette = {
  ink: "#171225",
  bar: "#171225",
  onBar: "#FFFFFF",
  brandYellow: "#FFC20A",
  yellowHover: "#FFD451",
  // The raw yellow is unreadable on white, so the light theme darkens it for
  // anything that is text rather than a surface.
  yellowDeep: "#8A6400",
  page: "#EFEBF7",
  surface: "#FFFFFF",
  surfaceAlt: "#F7F5FC",
  surfaceSunken: "#F1ECFA",
  fill: "#EBE4F7",
  hairline: "rgba(23,18,31,.09)",
  hairlineStrong: "rgba(23,18,31,.13)",
  hairlineStronger: "rgba(23,18,31,.18)",
  gutter: "rgba(23,18,31,.07)",
  // The neon versions of these fail contrast on white, so each one is taken
  // down until it passes while staying recognisably the same colour.
  danger: "#C4247F",
  successFg: "#00806C",
  successBg: "rgba(0,245,212,.16)",
  selectedFill: "rgba(155,93,229,.12)",
  onInkMuted: "rgba(255,255,255,.62)",
  white: "#FFFFFF",
  brand: "#7B3FD4",
  brandPressed: "#6A32BE",
  // Taken down to pass contrast against white text on a light page.
  brandGradient: ["#7B3FD4", "#D6399B"],
  brandGradientPressed: ["#6A32BE", "#BE2C89"],
  brandSoft: "rgba(155,93,229,.13)",
  barPressed: "#2A2138",
  info: "#0090C7",
  infoSoft: "rgba(0,187,249,.14)",
  money: "#00806C",
  moneySoft: "rgba(0,245,212,.18)",
  attention: "#C4247F",
  attentionSoft: "rgba(241,91,181,.12)",
  text: "#171225",
  muted: "rgba(23,18,31,.62)",
  faint: "rgba(23,18,31,.42)",
  ripple: "rgba(23,18,31,.08)",
  rippleStrong: "rgba(23,18,31,.18)",
};

/** The escalation heat scale, per theme. Yellow through pink, either way. */
export interface HeatStep {
  bg: string;
  fg: string;
  label: string;
  /** Fill width of the 3px heat bar, as a fraction. */
  bar: number;
}

export const DARK_HEAT: readonly HeatStep[] = [
  { bg: "rgba(0,187,249,.14)", fg: BLUE, label: "On track", bar: 0.12 },
  { bg: "rgba(254,228,64,.14)", fg: YELLOW, label: "Reminded", bar: 0.32 },
  { bg: "rgba(254,228,64,.2)", fg: "#FFD02E", label: "Chasing", bar: 0.56 },
  { bg: "rgba(241,91,181,.16)", fg: "#FF87C9", label: "Escalated", bar: 0.8 },
  { bg: "rgba(241,91,181,.22)", fg: PINK, label: "Daily", bar: 1 },
] as const;

export const LIGHT_HEAT: readonly HeatStep[] = [
  { bg: "#E4F6FE", fg: "#0072A0", label: "On track", bar: 0.12 },
  { bg: "#FFF8D9", fg: "#8A6400", label: "Reminded", bar: 0.32 },
  { bg: "#FFF0C2", fg: "#7A4F00", label: "Chasing", bar: 0.56 },
  { bg: "#FDE4F1", fg: "#B0246F", label: "Escalated", bar: 0.8 },
  { bg: "#FBD5E9", fg: "#C4247F", label: "Daily", bar: 1 },
] as const;
