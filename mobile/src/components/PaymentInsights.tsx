/**
 * "Who did we pay most in the last three months?" — answered on the admin's
 * Payments screen.
 *
 * Four rows of chips make the question: what to measure, grouped by what, over
 * which period, and how many to show. The answer is a ranked list underneath.
 * No free text: every question this can ask is one it can answer exactly.
 *
 * Folded by default and reads nothing until opened, because this is the one
 * panel on the screen that fetches documents rather than sums — see
 * `usePaidBetween` and lib/insights.ts.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { AppText } from "./AppText";
import { Button } from "./Button";
import { Card } from "./Card";
import { Chip, MonthFilter, YearFilter } from "./MonthFilter";
import { Note } from "./Note";
import { SectionCaption } from "./SectionCaption";
import { usePaidBetween, WINDOW_READ_LIMIT } from "../lib/data";
import { episodeLabel } from "../lib/format.ts";
import {
  GROUPS,
  MEASURES,
  PERIODS,
  TOP_CHOICES,
  periodLabel,
  periodRange,
  rankPayments,
  samePeriod,
  type InsightGroup,
  type InsightMeasure,
  type InsightPeriod,
} from "../lib/insights.ts";
import type { Episode, TeamMember } from "../lib/model";
import { monthSlotOf, monthsOfYear } from "../lib/months.ts";
import { money } from "../lib/payments.ts";
import { colors, fontFamily, radii, spacing } from "../theme/tokens";
import { type } from "../theme/typography";

export function PaymentInsights({
  byUid,
  byEpisode,
  years,
  now,
}: {
  byUid: Map<string, TeamMember>;
  byEpisode: Map<string, Episode>;
  /** The years there have been payments in, newest first — as the chart offers. */
  years: readonly number[];
  now: Date;
}) {
  const [open, setOpen] = useState(false);
  const [measure, setMeasure] = useState<InsightMeasure>("total");
  const [group, setGroup] = useState<InsightGroup>("person");
  const [period, setPeriod] = useState<InsightPeriod>({ kind: "recent", months: 3 });
  const [top, setTop] = useState<number>(3);
  /** "Pick a month" is open: the year and month chips show under the periods. */
  const [picking, setPicking] = useState(false);
  const [pickYear, setPickYear] = useState(now.getFullYear());

  const range = useMemo(() => periodRange(period, now), [period, now]);
  const { data: payments, loading, error, partial, reload } = usePaidBetween(range, open);
  const result = useMemo(
    () => rankPayments(payments, measure, group, top),
    [payments, measure, group, top]
  );

  const labelFor = (key: string) => {
    if (group === "person") return byUid.get(key)?.name ?? "Removed member";
    if (group === "episode") return episodeLabel(byEpisode.get(key)) || "Deleted episode";
    return key;
  };
  const show = (value: number) =>
    measure === "count" ? `${value} ${value === 1 ? "payment" : "payments"}` : money(value);

  return (
    <Card radius={radii.card} style={{ paddingVertical: 14, paddingHorizontal: 15, gap: 12 }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${open ? "Hide" : "Show"} payment insights`}
        style={{ flexDirection: "row", alignItems: "center", gap: spacing.chips }}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <SectionCaption>Ask the payments</SectionCaption>
          <AppText style={[type.metaXSmall, { color: colors.faint }]}>
            {open ? "Pick a question below" : "Top people, episodes and kinds of work, by period"}
          </AppText>
        </View>
        <AppText style={{ fontFamily: fontFamily.monoSemibold, fontSize: 13, lineHeight: 15 }}>
          {open ? "▴" : "▾"}
        </AppText>
      </Pressable>

      {open ? (
        <>
          <ChipRow label="Measure">
            {MEASURES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                on={measure === option.value}
                flavour="money"
                onPress={() => setMeasure(option.value)}
              />
            ))}
          </ChipRow>

          <ChipRow label="By">
            {GROUPS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                on={group === option.value}
                flavour="money"
                onPress={() => setGroup(option.value)}
              />
            ))}
          </ChipRow>

          <ChipRow label="When">
            {PERIODS.map((option) => (
              <Chip
                key={option.label}
                label={option.label}
                on={!picking && samePeriod(period, option.period)}
                flavour="money"
                onPress={() => {
                  setPicking(false);
                  setPeriod(option.period);
                }}
              />
            ))}
            <Chip
              label={period.kind === "month" ? periodLabel(period, now) : "Pick a month"}
              on={picking || period.kind === "month"}
              flavour="money"
              onPress={() => {
                setPicking(true);
                const slot = period.kind === "month" ? period.slot : monthSlotOf(now);
                setPickYear(slot.year);
                setPeriod({ kind: "month", slot });
              }}
            />
          </ChipRow>

          {picking ? (
            <View style={{ gap: spacing.chipsTight }}>
              <YearFilter
                years={years}
                selected={pickYear}
                flavour="info"
                hideRolling
                onSelect={(year) => {
                  if (year === null) return;
                  setPickYear(year);
                  const months = monthsOfYear(year, now);
                  setPeriod({ kind: "month", slot: months[months.length - 1] });
                }}
              />
              <MonthFilter
                months={monthsOfYear(pickYear, now)}
                selected={period.kind === "month" ? period.slot : null}
                flavour="info"
                onSelect={(slot) => setPeriod({ kind: "month", slot })}
              />
            </View>
          ) : null}

          <ChipRow label="Show">
            {TOP_CHOICES.map((choice) => (
              <Chip
                key={choice}
                label={`Top ${choice}`}
                on={top === choice}
                flavour="money"
                onPress={() => setTop(choice)}
              />
            ))}
          </ChipRow>

          {/* The answer. */}
          <View style={{ gap: 6, paddingTop: 4 }}>
            <AppText weight="semibold" style={[type.bodySmall]}>
              {`${MEASURES.find((m) => m.value === measure)?.label} by ${GROUPS.find(
                (g) => g.value === group
              )?.label.toLowerCase()} · ${periodLabel(period, now)}`}
            </AppText>

            {partial ? (
              <Note>
                {`Only the latest ${WINDOW_READ_LIMIT} payments in this period were read, so the oldest are missing. Pick a shorter period for an exact answer.`}
              </Note>
            ) : null}

            {error ? (
              <View style={{ gap: 6 }}>
                <AppText style={[type.metaXSmall, { color: colors.faint }]}>
                  Those payments would not load. Nothing has been lost.
                </AppText>
                <Button label="Try again" variant="quiet" onPress={reload} />
              </View>
            ) : loading ? (
              <AppText style={[type.metaXSmall, { color: colors.faint }]}>Adding it up…</AppText>
            ) : result.rows.length === 0 ? (
              <AppText style={[type.metaXSmall, { color: colors.faint }]}>
                Nothing was paid in this period.
              </AppText>
            ) : (
              <>
                {result.rows.map((row, index) => (
                  <View
                    key={row.key}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.chips,
                      backgroundColor: colors.surfaceSunken,
                      borderRadius: radii.chipLarge,
                      paddingVertical: 9,
                      paddingHorizontal: 11,
                    }}
                  >
                    <AppText style={[type.meta, { color: colors.faint, width: 18 }]}>
                      {`${index + 1}.`}
                    </AppText>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <AppText weight="semibold" style={[type.bodySmall]} numberOfLines={2}>
                        {labelFor(row.key)}
                      </AppText>
                      {measure !== "count" || row.total > 0 ? (
                        <AppText style={[type.metaXSmall, { color: colors.muted }]}>
                          {measure === "count"
                            ? `${money(row.total)} in all`
                            : `${row.count} ${row.count === 1 ? "payment" : "payments"}${
                                measure === "largest" ? ` · ${money(row.total)} in all` : ""
                              }`}
                        </AppText>
                      ) : null}
                    </View>
                    <AppText
                      weight="semibold"
                      style={[type.bodySmall, { fontFamily: fontFamily.monoSemibold }]}
                    >
                      {show(row.value)}
                    </AppText>
                  </View>
                ))}
                <AppText style={[type.metaXSmall, { color: colors.faint }]}>
                  {`${money(result.total)} paid in this period across ${result.payments} ${
                    result.payments === 1 ? "payment" : "payments"
                  }${result.groups > result.rows.length ? ` · ${result.groups} in all, top ${result.rows.length} shown` : ""}.`}
                </AppText>
              </>
            )}
          </View>
        </>
      ) : null}
    </Card>
  );
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 5 }}>
      <AppText style={[type.metaXSmall, { color: colors.faint }]}>{label}</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.chipsTight }}>
        {children}
      </View>
    </View>
  );
}
