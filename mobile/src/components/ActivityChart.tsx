/**
 * Six months of work given out against work handed in.
 *
 * Drawn with plain views rather than a charting library: six pairs of bars is
 * not worth a dependency, and every library that draws them wants either SVG
 * or a native module — a new build, for a chart.
 *
 * The two bars are deliberately not stacked. Stacking would make the total
 * the shape you read, and the thing worth reading here is the *gap* between
 * what arrived and what went back.
 */

import { View } from "react-native";

import { AppText } from "./AppText";
import type { MonthActivity } from "../lib/member-summary.ts";
import { peakOf } from "../lib/member-summary.ts";
import { colors, fontFamily, radii, spacing } from "../theme/tokens";

const HEIGHT = 86;

export function ActivityChart({ months }: { months: readonly MonthActivity[] }) {
  const peak = peakOf(months);

  // Nothing yet. A chart of six empty columns says "no work" more clearly
  // than a sentence does, so the axis is kept and only the scale is faked.
  const scale = (value: number) => (peak === 0 ? 0 : (value / peak) * HEIGHT);

  return (
    <View style={{ gap: spacing.chips }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, height: HEIGHT }}>
        {months.map((month) => (
          <View key={month.key} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3 }}>
              <Bar height={scale(month.assigned)} color={colors.brand} count={month.assigned} />
              <Bar height={scale(month.submitted)} color={colors.money} count={month.submitted} />
            </View>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        {months.map((month) => (
          <AppText
            key={month.key}
            style={{
              flex: 1,
              textAlign: "center",
              fontFamily: fontFamily.mono,
              fontSize: 9.5,
              lineHeight: 12,
              color: colors.faint,
            }}
          >
            {month.label}
          </AppText>
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.cards, marginTop: 2 }}>
        <Key color={colors.brand} label="Assigned" />
        <Key color={colors.money} label="Submitted" />
      </View>
    </View>
  );
}

function Bar({ height, color, count }: { height: number; color: string; count: number }) {
  return (
    <View style={{ alignItems: "center", gap: 3 }}>
      {count > 0 ? (
        <AppText
          style={{
            fontFamily: fontFamily.monoMedium,
            fontSize: 9,
            lineHeight: 10,
            color: colors.faint,
          }}
        >
          {count}
        </AppText>
      ) : null}
      <View
        style={{
          width: 11,
          // A month with work in it never draws as nothing: two pixels of
          // colour is the difference between "one task" and "no data".
          height: count > 0 ? Math.max(height, 3) : 2,
          borderRadius: 3,
          backgroundColor: count > 0 ? color : colors.hairlineStrong,
        }}
      />
    </View>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: radii.pill, backgroundColor: color }} />
      <AppText
        style={{
          fontFamily: fontFamily.medium,
          fontSize: 10.5,
          lineHeight: 12,
          color: colors.muted,
        }}
      >
        {label}
      </AppText>
    </View>
  );
}
