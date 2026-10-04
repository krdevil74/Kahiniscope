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

  /**
   * `info` is the one tone light enough to fail on its own tint — 3.2:1 on
   * `infoSoft`, where money manages 4.4 and attention 4.6. This is the same
   * blue taken down until it reads, for small text on a blue block.
   */
  infoDeep: string;

  /** Fills. The raw palette, for blocks and bars rather than for words. */
  brandFill: string;
  infoFill: string;
  moneyFill: string;
  /**
   * Text on the raw fills. Never white: white on mint is 1.4:1, on blue 2.2
   * and on pink 3.0 — fine for an 8px glyph in a 26px square, unreadable for
   * a word somebody has to read. Each of these is its own hue taken down far
   * enough to carry text, the way `onMoneyFill` always was.
   */
  onMoneyFill: string;
  onInfoFill: string;
  onAttentionFill: string;
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

  /** 5.2:1 on infoSoft, where `info` itself is 3.2. */
  infoDeep: "#006C92",

  brandFill: "#9B5DE5",
  infoFill: "#00BBF9",
  moneyFill: "#00F5D4",
  /** Text on moneyFill: the mint is too bright for `money` to carry it. 9.8:1. */
  onMoneyFill: "#06342C",
  /** 5.9:1 on infoFill. */
  onInfoFill: "#04344A",
  /** 5.0:1 on attentionFill. */
  onAttentionFill: "#4A0B2E",
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

/**
 * A flavour: one colour doing its one job, in the four shades a block needs.
 *
 * This is the device the dashboard is built from — a soft tinted fill with its
 * own hue as the text, and the raw neon when something is chosen or wants
 * saying loudly. The three tiles an admin opens on are pink, blue and mint in
 * exactly this form, and until now the filter chips on Episodes and Payments
 * were the only controls in the app that did not know about it: black-filled
 * pills with grey labels, which read as a different product.
 *
 * Grouping the shades here rather than picking them at each call site is what
 * keeps that from happening again — a chip asks for "money" and cannot end up
 * with an unreadable pairing, because the pairing is decided once, with the
 * contrast measured.
 *
 * Which flavour a screen takes is not decoration. `money` is money, so the
 * Payments chips are mint; `info` is information, so the Episodes month
 * filter is blue; `attention` is something wanting attention, which is what
 * the notes under both filters are for. Purple stays the brand's, and the
 * mark's yellow stays the mark's.
 */
export type FlavourName = "money" | "info" | "attention";

export interface Flavour {
  /** The quiet state: a tinted block, the way the dashboard tiles are. */
  soft: string;
  /** Text on `soft`, and the edge of the chosen one. */
  text: string;
  /** The loud state: the raw palette, as a fill rather than as an accent. */
  fill: string;
  /** Text on `fill`. Measured, never white — see the note above. */
  onFill: string;
}

export const FLAVOURS: Record<FlavourName, Flavour> = {
  money: {
    soft: PALETTE.moneySoft,
    text: PALETTE.money,
    fill: PALETTE.moneyFill,
    onFill: PALETTE.onMoneyFill,
  },
  info: {
    soft: PALETTE.infoSoft,
    text: PALETTE.infoDeep,
    fill: PALETTE.infoFill,
    onFill: PALETTE.onInfoFill,
  },
  attention: {
    soft: PALETTE.attentionSoft,
    text: PALETTE.attention,
    fill: PALETTE.attentionFill,
    onFill: PALETTE.onAttentionFill,
  },
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
