/**
 * Year and month chips, for the two screens that filter by when something
 * happened: the Payments chart and the Episodes slate.
 *
 * One row each, above what they filter, which is where a filter belongs. The
 * months stop at the current one when the year is this year — eight chips for
 * months that have not happened are eight ways to get an empty list.
 *
 * **Flavoured, because every other block in this app is.** These were the last
 * controls still drawn in the monochrome they were prototyped in — a black
 * pill when chosen, a grey-bordered white one when not, and a grey label on
 * both. Beside the dashboard's pink, blue and mint tiles they read as a
 * different product, which is the one thing this palette exists to prevent.
 *
 * So a chip takes a flavour and the row carries the colour of what it filters:
 * mint on Payments because that panel is money, blue on Episodes because the
 * slate is information. The quiet state is the tinted block the dashboard
 * tiles are made of; the chosen one is the raw neon, which is this design's
 * own idea of emphasis — "large fills rather than timid accents". Both states
 * carry the same 1px edge so choosing a chip never moves the row by a pixel.
 *
 * Sizes and the face come from the type scale (`type.meta`, the 10.5px
 * monospace meta step) rather than from numbers typed here, which is the other
 * half of why these looked foreign.
 */

import { Pressable, View } from "react-native";

import { AppText } from "./AppText";
import { monthShort, type MonthSlot } from "../lib/months.ts";
import {
  flavours,
  fontFamily,
  radii,
  spacing,
  MIN_TAP_TARGET,
  type FlavourName,
} from "../theme/tokens";
import { type } from "../theme/typography";

function Chip({
  label,
  on,
  flavour,
  onPress,
}: {
  label: string;
  on: boolean;
  flavour: FlavourName;
  onPress: () => void;
}) {
  const tone = flavours[flavour];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={{
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: radii.pill,
        // The unchosen edge is the fill it sits on, so the border is there for
        // the geometry and invisible until a chip is chosen.
        borderWidth: 1,
        borderColor: on ? tone.text : tone.soft,
        backgroundColor: on ? tone.fill : tone.soft,
        minHeight: Math.min(34, MIN_TAP_TARGET),
        justifyContent: "center",
      }}
    >
      <AppText
        style={[
          type.meta,
          {
            fontFamily: fontFamily.monoMedium,
            lineHeight: 13,
            color: on ? tone.onFill : tone.text,
          },
        ]}
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
  flavour,
  onSelect,
}: {
  years: readonly number[];
  /** `null` is the rolling twelve months rather than a calendar year. */
  selected: number | null;
  /** The colour of whatever is being filtered — money on Payments, information on Episodes. */
  flavour: FlavourName;
  onSelect: (year: number | null) => void;
}) {
  const options: { label: string; value: number | null }[] = [
    { label: "Last 12 months", value: null },
    ...years.map((year) => ({ label: String(year), value: year })),
  ];

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.chipsTight }}>
      {options.map((option) => (
        <Chip
          key={option.label}
          label={option.label}
          on={option.value === selected}
          flavour={flavour}
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
  flavour,
  onSelect,
}: {
  months: readonly MonthSlot[];
  selected: MonthSlot | null;
  flavour: FlavourName;
  onSelect: (slot: MonthSlot) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.chipsTight }}>
      {months.map((slot) => (
        <Chip
          key={`${slot.year}-${slot.month}`}
          label={monthShort(slot)}
          on={selected?.year === slot.year && selected?.month === slot.month}
          flavour={flavour}
          onPress={() => onSelect(slot)}
        />
      ))}
    </View>
  );
}
