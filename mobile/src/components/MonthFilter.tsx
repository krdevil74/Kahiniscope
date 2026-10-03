/**
 * Year and month chips, for the two screens that filter by when something
 * happened: the Payments chart and the Episodes slate.
 *
 * One row each, above what they filter, which is where a filter belongs. The
 * months stop at the current one when the year is this year — eight chips for
 * months that have not happened are eight ways to get an empty list.
 */

import { Pressable, View } from "react-native";

import { AppText } from "./AppText";
import { monthShort, type MonthSlot } from "../lib/months.ts";
import { colors, fontFamily, radii, MIN_TAP_TARGET } from "../theme/tokens";

function Chip({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={{
        paddingVertical: 7,
        paddingHorizontal: 11,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: on ? colors.ink : colors.hairlineStrong,
        backgroundColor: on ? colors.ink : colors.surface,
        minHeight: Math.min(34, MIN_TAP_TARGET),
        justifyContent: "center",
      }}
    >
      <AppText
        style={{
          fontFamily: fontFamily.monoMedium,
          fontSize: 10.5,
          lineHeight: 13,
          color: on ? colors.white : colors.muted,
        }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * The year chips above the chart, and the way back to the rolling window.
 *
 * One row, above the plot, as a filter should be. "Last 12 months" is first
 * because it is the default and the thing somebody wants back after wandering
 * into 2025.
 */
export function YearFilter({
  years,
  selected,
  onSelect,
}: {
  years: readonly number[];
  /** `null` is the rolling twelve months rather than a calendar year. */
  selected: number | null;
  onSelect: (year: number | null) => void;
}) {
  const options: { label: string; value: number | null }[] = [
    { label: "Last 12 months", value: null },
    ...years.map((year) => ({ label: String(year), value: year })),
  ];

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {options.map((option) => (
        <Chip
          key={option.label}
          label={option.label}
          on={option.value === selected}
          onPress={() => onSelect(option.value)}
        />
      ))}
    </View>
  );
}

/**
 * The twelve months of a year, or as many as have happened.
 *
 * Shown under the year chips rather than behind a picker: twelve three-letter
 * chips are two rows on a phone, and a month is one tap rather than two taps
 * and a scroll wheel.
 */
export function MonthFilter({
  months,
  selected,
  onSelect,
}: {
  months: readonly MonthSlot[];
  selected: MonthSlot | null;
  onSelect: (slot: MonthSlot) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {months.map((slot) => (
        <Chip
          key={`${slot.year}-${slot.month}`}
          label={monthShort(slot)}
          on={selected?.year === slot.year && selected?.month === slot.month}
          onPress={() => onSelect(slot)}
        />
      ))}
    </View>
  );
}
