/**
 * What was paid, month by month.
 *
 * One series, so there is no legend: the heading above already says what is
 * plotted, and a box with a single swatch would only restate it. The bars carry
 * the money colour and every piece of text stays in the ink tokens — a value
 * written in the series colour is the first thing that makes a chart look
 * cheap, and it is unreadable at 10px besides.
 *
 * Labelled selectively, on purpose — and the label sits in the caption rather
 * than over a bar. Twelve months across a phone leaves each column about 26px,
 * and "₹1,200" needs nearer 40: written over the bar it would be truncated, and
 * a clipped figure is worse than no figure. So the caption names one month —
 * the tallest, or the one being asked about — and every other value is one tap
 * away. Each bar carries its own figure in its accessibility label, so a screen
 * reader is never the one left guessing.
 *
 * Bars are capped rather than stretched to fill their slot, are square where
 * they meet the baseline and rounded at the data end, and are separated by
 * surface rather than by an outline. A month with nothing in it draws a stub,
 * because a bar of no height is indistinguishable from a month that was never
 * drawn — and "nobody was paid in July" is worth being able to see.
 */

import { Pressable, View } from "react-native";

import { AppText } from "./AppText";
import {
  barsFrom,
  busiestMonth,
  monthLong,
  sameMonth,
  type MonthSlot,
  type MonthTotal,
} from "../lib/payment-history.ts";
import { money } from "../lib/payments.ts";
import { colors, fontFamily } from "../theme/tokens";
import { type } from "../theme/typography";

/** Tall enough to show a shape, short enough to leave the list above the fold. */
const PLOT_HEIGHT = 104;

/** Capped, never stretched to the slot — the leftover is the air between bars. */
const MAX_BAR_WIDTH = 24;

export function MonthlyPaidChart({
  totals,
  selected,
  loading,
  onSelect,
}: {
  totals: readonly MonthTotal[];
  selected: MonthSlot | null;
  loading: boolean;
  onSelect: (slot: MonthSlot) => void;
}) {
  const bars = barsFrom(totals, PLOT_HEIGHT);
  const peak = busiestMonth(totals);
  const anySelected = selected !== null;

  const open = anySelected ? totals.find((t) => sameMonth(selected, t)) ?? null : null;
  const named = open
    ? `${monthLong(open)} · ${open.total > 0 ? money(open.total) : "nothing paid"}`
    : peak
      ? `Highest: ${monthLong(peak)} · ${money(peak.total)}`
      : "Nothing paid yet";

  if (totals.length === 0) {
    return (
      <View style={{ paddingVertical: 18, alignItems: "center" }}>
        <AppText style={[type.metaXSmall, { color: colors.faint }]}>
          {loading ? "Adding it up…" : "No payments yet"}
        </AppText>
      </View>
    );
  }

  return (
    <View>
      {/* The one direct label, and the scale. Which month it names depends on
          what is being asked: the month under the finger, or the tallest one,
          which is the shape of the year. */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <AppText numberOfLines={1} style={[type.metaXSmall, { flex: 1, color: colors.muted }]}>
          {named}
        </AppText>
        {loading ? (
          <AppText style={[type.metaXSmall, { color: colors.faint }]}>updating…</AppText>
        ) : null}
      </View>

      {/* The plot. Bars grow from a single baseline; the hairline under them is
          that baseline and the only rule on the chart. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 2,
          height: PLOT_HEIGHT,
          marginTop: 6,
          borderBottomWidth: 1,
          borderBottomColor: colors.hairline,
        }}
      >
        {bars.map((bar) => {
          const on = sameMonth(selected, bar);
          return (
            <Pressable
              key={bar.key}
              onPress={() => onSelect({ year: bar.year, month: bar.month })}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${monthLong(bar)}, ${
                bar.empty ? "nothing paid" : `${money(bar.total)} across ${bar.count} payments`
              }`}
              // The tap target is the whole column, not the drawn bar: a thin
              // February is otherwise a 3px target.
              hitSlop={{ top: 8, bottom: 8 }}
              style={{
                flex: 1,
                minWidth: 0,
                height: "100%",
                justifyContent: "flex-end",
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: "100%",
                  maxWidth: MAX_BAR_WIDTH,
                  height: bar.height,
                  // Square where it meets the baseline, rounded at the data end.
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                  backgroundColor: bar.empty ? colors.hairlineStronger : colors.money,
                  // A month that is not the one being asked about steps back
                  // rather than changing colour: same hue, less of it.
                  opacity: !anySelected || on ? 1 : 0.28,
                }}
              />
            </Pressable>
          );
        })}
      </View>

      {/* The ticks. Every month is named — twelve three-letter labels fit, and
          a bar you cannot name is a bar you cannot use. */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 2, marginTop: 5 }}>
        {bars.map((bar) => (
          <AppText
            key={bar.key}
            numberOfLines={1}
            style={{
              flex: 1,
              textAlign: "center",
              fontFamily: fontFamily.mono,
              fontSize: 8.5,
              lineHeight: 11,
              color: sameMonth(selected, bar) ? colors.ink : colors.faint,
            }}
          >
            {bar.label}
          </AppText>
        ))}
      </View>
    </View>
  );
}
