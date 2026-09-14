/**
 * The type scale, as used. Two families and nothing else: Space Grotesk for
 * words, IBM Plex Mono for every number, count, percentage, countdown, code,
 * endpoint, timestamp and uppercase caption.
 *
 * React Native takes line height in pixels rather than as a ratio, so the
 * ratios from the handoff (1.2 for headings, 1.4–1.65 for body) are applied
 * here once and never recomputed at the call site.
 */

import type { TextStyle } from "react-native";

import { colors, fontFamily, lineHeight } from "./tokens";
import { scriptOf } from "../lib/bengali";

const round = (n: number) => Math.round(n * 100) / 100;

type Family = keyof typeof fontFamily;

function style(size: number, family: Family, ratio: number, extra?: TextStyle): TextStyle {
  return {
    fontFamily: fontFamily[family],
    fontSize: size,
    lineHeight: round(size * ratio),
    color: colors.ink,
    ...extra,
  };
}

/**
 * Nothing below 9px. The smallest thing in the design is 9.5px monospace
 * meta, and this is the guard that keeps it that way.
 */
export const MIN_FONT_SIZE = 9;

export const type = {
  /** Headings — 24/20/17/16 semibold. */
  h1: style(24, "semibold", lineHeight.heading),
  h2: style(20, "semibold", lineHeight.heading),
  h3: style(17, "semibold", lineHeight.heading),
  h4: style(16, "semibold", lineHeight.heading),

  /** Card titles — 13.5/13/12.5 semibold. */
  cardTitle: style(13.5, "semibold", lineHeight.body),
  cardTitleSmall: style(13, "semibold", lineHeight.body),
  cardTitleXSmall: style(12.5, "semibold", lineHeight.body),

  /** Body — 12/11.5/11. */
  body: style(12, "regular", lineHeight.body),
  bodySmall: style(11.5, "regular", lineHeight.body),
  bodyXSmall: style(11, "regular", lineHeight.body),
  bodyLoose: style(12, "regular", lineHeight.loose),

  /** Monospace meta — 10.5/10/9.5. */
  meta: style(10.5, "mono", lineHeight.body),
  metaSmall: style(10, "mono", lineHeight.body),
  metaXSmall: style(9.5, "mono", lineHeight.body),

  /** Section captions — 10px uppercase monospace, .1em tracking. */
  caption: style(10, "mono", lineHeight.body, {
    textTransform: "uppercase",
    letterSpacing: 1,
  }),

  /** Percentages and stat numbers — 42/38/26/24/22/15 monospace. */
  slatePercent: style(42, "mono", lineHeight.heading),
  episodePercent: style(38, "mono", lineHeight.heading),
  statNumber: style(26, "mono", lineHeight.heading),
  cardPercent: style(24, "mono", lineHeight.heading),
  stepperNumber: style(22, "mono", lineHeight.heading),
  memberPercent: style(15, "mono", lineHeight.body),

  /** Stat cell labels — 10px. */
  statLabel: style(10, "regular", lineHeight.body),
} as const;

/**
 * Swap in the Bengali family when a string needs it, keeping the weight.
 *
 * Pass the result to a Text's style after the preset:
 *   <Text style={[type.h3, bengaliFallback(title, "semibold")]}>
 */
export function bengaliFallback(
  text: unknown,
  weight: "regular" | "medium" | "semibold" = "regular"
): TextStyle | undefined {
  if (scriptOf(text) !== "bengali") return undefined;
  const family =
    weight === "semibold"
      ? fontFamily.bengaliSemibold
      : weight === "medium"
        ? fontFamily.bengaliMedium
        : fontFamily.bengali;
  return { fontFamily: family };
}
