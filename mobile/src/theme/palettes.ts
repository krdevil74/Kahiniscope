/**
 * One palette. One interface.
 *
 *   #9B5DE5  purple   the brand — primary actions
 *   #F15BB5  pink     attention — overdue, sent back, registrations waiting
 *   #FEE440  yellow   heat — the escalation ladder, and an estimate
 *   #00BBF9  blue     information — the review queue, a contact match
 *   #00F5D4  mint     money — paid, done, earned
 *
 * Each colour has exactly one job, so a screen means something at a glance:
 * mint is always money, pink is always something wanting attention. The
 * palette is used as large fills rather than timid accents — that is the
 * whole character of this design.
 *
 * Two versions of each exist and they are not interchangeable. The raw neons
 * fill surfaces; the darkened ones are for text, because #00F5D4 on white is
 * unreadable and #00806C is the same colour that can be read.
 *
 * The client's yellow mark is untouched, and nothing else uses its yellow at
 * full strength — so the logo is always the brightest thing on screen. That
 * is also why the bar is a near-black neutral with no violet in it: the last
 * attempt put purple behind the mark and it was wrong.
 */

export interface Palette {
  /** Primary text. */
  ink: string;
  /** The header and nav bar: a true neutral, never tinted. */
  bar: string;
  barPressed: string;
  onBar: string;
  onInkMuted: string;

  page: string;
  surface: string;
  surfaceAlt: string;
  surfaceSunken: string;
  fill: string;

  hairline: string;
  hairlineStrong: string;
  hairlineStronger: string;
  gutter: string;

  text: string;
  muted: string;
  faint: string;

  /** The mark's own colour. Used for the mark, and for nothing else. */
  brandYellow: string;
  yellowHover: string;

  /** Readable on a light surface. */
  brand: string;
  brandPressed: string;
  info: string;
  money: string;
  attention: string;
  heat: string;

  /** Fills. The raw palette, for blocks and bars rather than for words. */
  brandFill: string;
  infoFill: string;
  moneyFill: string;
  /** Text on moneyFill. */
  onMoneyFill: string;
  attentionFill: string;
  heatFill: string;

  /** Tinted card backgrounds — the "blocks" this design is built from. */
  brandSoft: string;
  infoSoft: string;
  moneySoft: string;
  attentionSoft: string;
  heatSoft: string;

  /** Borders for those blocks. */
  infoEdge: string;
  attentionEdge: string;

  danger: string;
  successFg: string;
  successBg: string;
  selectedFill: string;
  yellowDeep: string;
  white: string;

  ripple: string;
  rippleStrong: string;
}

export const PALETTE: Palette = {
  ink: "#1B1B2B",
  bar: "#16161C",
  barPressed: "#24242E",
  onBar: "#FFFFFF",
  onInkMuted: "rgba(255,255,255,.60)",

  page: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceAlt: "#FFFFFF",
  surfaceSunken: "#F4F4F7",
  fill: "#EDEDF2",

  hairline: "#E8E8EE",
  hairlineStrong: "#DADAE4",
  hairlineStronger: "#CFCFDB",
  gutter: "#EDEDF2",

  text: "#1B1B2B",
  muted: "rgba(27,27,43,.62)",
  faint: "rgba(27,27,43,.42)",

  brandYellow: "#FFC20A",
  yellowHover: "#FFD451",

  brand: "#7B3FD4",
  brandPressed: "#6A32BE",
  info: "#0090C7",
  money: "#00806C",
  attention: "#C4247F",
  heat: "#8A6400",

  brandFill: "#9B5DE5",
  infoFill: "#00BBF9",
  moneyFill: "#00F5D4",
  /** Text on moneyFill: the mint is too bright for `money` to carry it. */
  onMoneyFill: "#06342C",
  attentionFill: "#F15BB5",
  heatFill: "#FEE440",

  brandSoft: "#F1E9FD",
  infoSoft: "#E0F5FE",
  moneySoft: "#DFFAF4",
  attentionSoft: "#FDE7F3",
  heatSoft: "#FFF7CC",

  infoEdge: "#9CDFFB",
  attentionEdge: "#F6BCDD",

  danger: "#C4247F",
  successFg: "#00806C",
  successBg: "#DFFAF4",
  selectedFill: "#F1E9FD",
  yellowDeep: "#8A6400",
  white: "#FFFFFF",

  ripple: "rgba(27,27,43,.08)",
  rippleStrong: "rgba(27,27,43,.18)",
};

export interface HeatStep {
  bg: string;
  fg: string;
  label: string;
  /** Fill width of the 3px heat bar, as a fraction. */
  bar: number;
}

/** Blue through yellow to pink: cool when on track, hot when it is not. */
export const HEAT: readonly HeatStep[] = [
  { bg: "#E4F6FE", fg: "#0072A0", label: "On track", bar: 0.12 },
  { bg: "#FFF8D9", fg: "#8A6400", label: "Reminded", bar: 0.32 },
  { bg: "#FFF0C2", fg: "#7A4F00", label: "Chasing", bar: 0.56 },
  { bg: "#FDE4F1", fg: "#B0246F", label: "Escalated", bar: 0.8 },
  { bg: "#FBD5E9", fg: "#C4247F", label: "Daily", bar: 1 },
] as const;
