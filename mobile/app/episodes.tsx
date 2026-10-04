/**
 * Episodes — the slate, in two halves.
 *
 * It used to load every episode ever made and every task ever assigned, to put
 * two numbers in a subtitle and draw one percentage. That is a page which gets
 * slower every month a channel runs, and the numbers it was adding up are the
 * two on the tiles below.
 *
 * Now nothing is loaded until it is asked for. Two counts come back as
 * aggregations; opening **In progress** subscribes to the slate, which is
 * bounded by what is in production; opening **Broadcast** asks for one month at
 * a time. Tasks are fetched only for the episodes actually on screen.
 */

import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { AppShell } from "../src/components/AppShell";
import { AppText } from "../src/components/AppText";
import { Card } from "../src/components/Card";
import { EmptyState } from "../src/components/EmptyState";
import { MonthFilter, YearFilter } from "../src/components/MonthFilter";
import { Note } from "../src/components/Note";
import { ProgressBar } from "../src/components/ProgressBar";
import { SectionCaption } from "../src/components/SectionCaption";
import { StatusPill } from "../src/components/StatusPill";
import { useSession } from "../src/lib/auth";
import { byAirDate, completionOf, overdueCount, tasksForEpisode } from "../src/lib/completion.ts";
import {
  useBroadcastInMonth,
  useEarliestBroadcastYear,
  useEpisodeCounts,
  useEpisodesInProgress,
  useNow,
  useTasksForEpisodes,
} from "../src/lib/data";
import {
  broadcastGapNote,
  countLabel,
  listedSummary,
  monthEmptyNote,
  monthUnreadableNote,
  slateSubtitle,
  strandedNote,
  tileLabel,
  type SlateHalf,
} from "../src/lib/slate.ts";
import { lastMonths, monthLong, monthsOfYear, yearsFrom, type MonthSlot } from "../src/lib/months.ts";
import type { Episode, Task } from "../src/lib/model";
import { airLabel } from "../src/lib/format.ts";
import {
  colors,
  flavours,
  fontFamily,
  layout,
  radii,
  spacing,
  MIN_TAP_TARGET,
  type FlavourName,
} from "../src/theme/tokens";
import { type } from "../src/theme/typography";

export default function Episodes() {
  const now = useNow();
  const { isAdmin } = useSession();

  /** Neither half is open until one is tapped — that is the whole point. */
  const [half, setHalf] = useState<SlateHalf | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<MonthSlot | null>(null);

  const { data: counts, loading: countsLoading } = useEpisodeCounts(isAdmin);

  const { data: inProgress, loading: slateLoading } = useEpisodesInProgress(
    isAdmin && half === "in-progress"
  );
  const {
    data: broadcast,
    loading: monthLoading,
    error: monthError,
  } = useBroadcastInMonth(half === "broadcast" ? month : null, isAdmin);
  const earliestYear = useEarliestBroadcastYear(isAdmin && half === "broadcast");

  const listed = useMemo<Episode[]>(
    () => (half === "in-progress" ? byAirDate(inProgress) : broadcast),
    [half, inProgress, broadcast]
  );

  // Only the episodes on screen, and only once there are some.
  const listedIds = useMemo(() => listed.map((e) => e.id), [listed]);
  const { data: tasks } = useTasksForEpisodes(listedIds, isAdmin);
  const completion = useMemo(() => completionOf(tasks), [tasks]);

  const years = useMemo(() => yearsFrom(earliestYear, now), [earliestYear, now]);
  const monthsIn = useCallback(
    (of: number | null) => (of === null ? lastMonths(now) : monthsOfYear(of, now)),
    [now]
  );
  const months = useMemo(() => monthsIn(year), [monthsIn, year]);

  /**
   * The newest month of a range — the one somebody picking a year wants to see
   * first, and the one this screen must never be without while Broadcast is
   * open. A year chosen with no month is an empty list with nothing on screen
   * saying why, which is how picking "2026" came to look like a filter that
   * had lost the episodes.
   */
  const newestOf = (range: readonly MonthSlot[]) => range[range.length - 1] ?? null;

  function openHalf(next: SlateHalf) {
    setHalf((current) => (current === next ? null : next));
    // Opening Broadcast with no month chosen would be an empty list and no
    // reason for it, so it starts on the month somebody is most likely to want.
    if (next === "broadcast" && !month) setMonth(newestOf(months));
  }

  return (
    <AppShell
      title="Episodes"
      subtitle={slateSubtitle(counts.inProgress, counts.broadcast)}
      activeTab="episodes"
      showFab
    >
      <View style={{ padding: spacing.screen, gap: spacing.cards }}>
        {/* The two halves. Counts come from two aggregations, so this pair
            costs the same whether the channel has made ten episodes or ten
            thousand. */}
        <View style={{ flexDirection: "row", gap: spacing.cardsTight }}>
          <SlateTile
            label={tileLabel("in-progress")}
            count={countLabel(counts.inProgress)}
            loading={countsLoading}
            open={half === "in-progress"}
            flavour="info"
            onPress={() => openHalf("in-progress")}
          />
          <SlateTile
            label={tileLabel("broadcast")}
            count={countLabel(counts.broadcast)}
            loading={countsLoading}
            open={half === "broadcast"}
            flavour="money"
            onPress={() => openHalf("broadcast")}
          />
        </View>

        {half === null ? (
          <AppText style={[type.metaXSmall, { color: colors.faint, paddingHorizontal: 2 }]}>
            Tap either half to list it. Nothing is loaded until you do.
          </AppText>
        ) : null}

        {/* Broadcast is filtered by when it went out, so it needs a month. */}
        {half === "broadcast" ? (
          <View style={{ gap: 8 }}>
            {/* Blue, because the slate is information — the same blue as the
                dashboard's Open tasks tile and the review queue banner. */}
            <YearFilter
              years={years}
              selected={year}
              flavour="info"
              onSelect={(next) => {
                setYear(next);
                // Not cleared: a year with no month showed an empty list
                // labelled "Nothing that month" about a month nobody had
                // picked. Land on the newest month of the year instead.
                setMonth(newestOf(monthsIn(next)));
              }}
            />
            <MonthFilter months={months} selected={month} flavour="info" onSelect={setMonth} />
            {/* Episodes this filter cannot see. Pink, because that is what
                this palette's pink is for, and because grey at 9.5px under a
                row of chips is where a sentence goes to be unread. */}
            {broadcastGapNote(counts.broadcast, counts.dated) ? (
              <Note>{broadcastGapNote(counts.broadcast, counts.dated)}</Note>
            ) : null}
            {/* An episode in neither half is invisible on this screen. Said
                here rather than left for somebody to work out from the tiles. */}
            {strandedNote(counts.total, counts.inProgress, counts.broadcast) ? (
              <Note>{strandedNote(counts.total, counts.inProgress, counts.broadcast)}</Note>
            ) : null}
          </View>
        ) : null}

        {half !== null ? (
          <SectionCaption>
            {half === "broadcast" && month
              ? monthLong(month)
              : listedSummary(half, listed.length, completion)}
          </SectionCaption>
        ) : null}

        {half === "broadcast" && month && listed.length > 0 ? (
          <AppText style={[type.metaXSmall, { color: colors.faint, marginTop: -6 }]}>
            {listedSummary(half, listed.length, completion)}
          </AppText>
        ) : null}

        {half !== null && listed.length === 0 && !slateLoading && !monthLoading ? (
          <EmptyState
            title={
              half === "in-progress"
                ? "Nothing in progress"
                : monthError
                  ? "That month would not load"
                  : "Nothing that month"
            }
            detail={
              half === "in-progress"
                ? "Episodes appear here as soon as the first task is assigned to one."
                : monthError
                  ? monthUnreadableNote(month)
                  : monthEmptyNote(month, counts.broadcast, counts.dated)
            }
          />
        ) : null}

        {listed.map((episode) => (
          <EpisodeCard key={episode.id} episode={episode} tasks={tasks} now={now} />
        ))}
      </View>
    </AppShell>
  );
}

/**
 * Half the row, and a count.
 *
 * The open one fills, so which list is on screen is answered by the tile rather
 * than by reading the caption under it.
 *
 * These are the same device as the three tiles an admin opens the board on, in
 * the same soft fills — which is the point. The board's own note says the admin
 * and the member are looking at two views of one set of tasks and "until now
 * the two screens did not look related"; the slate was the screen still left
 * out, drawn in white and near-black while everything around it was pink, blue
 * and mint. Blue for the work in hand, because the slate is information. Mint
 * for what has gone out, because in this palette mint is what is done.
 *
 * Open is the raw fill rather than a darker neutral, so a tile emphasises in
 * its own colour instead of leaving the hue behind the moment it is tapped.
 */
function SlateTile({
  label,
  count,
  loading,
  open,
  flavour,
  onPress,
}: {
  label: string;
  /** Already a string, so a count that did not answer can be a dash. */
  count: string;
  loading: boolean;
  open: boolean;
  flavour: FlavourName;
  onPress: () => void;
}) {
  const tone = flavours[flavour];
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${count} ${label}. ${open ? "Hide" : "Show"} them`}
      style={{
        flex: 1,
        minWidth: 0,
        padding: spacing.card,
        minHeight: MIN_TAP_TARGET + 28,
        justifyContent: "center",
        backgroundColor: open ? tone.fill : tone.soft,
        borderRadius: radii.card,
      }}
    >
      <AppText
        style={{
          fontFamily: fontFamily.monoMedium,
          fontSize: 9,
          lineHeight: 11,
          letterSpacing: 1.1,
          textTransform: "uppercase",
          color: open ? tone.onFill : tone.text,
        }}
      >
        {label}
      </AppText>
      <AppText
        weight="semibold"
        style={{
          fontFamily: fontFamily.extrabold,
          fontSize: 32,
          lineHeight: 36,
          letterSpacing: -1.4,
          marginTop: 4,
          color: open ? tone.onFill : tone.text,
        }}
      >
        {loading ? "—" : count}
      </AppText>
    </Card>
  );
}

/**
 * One episode. The same card in both groups — a broadcast episode is not a
 * lesser thing, it is a finished one, and its percentages still matter.
 */
function EpisodeCard({
  episode,
  tasks,
  now,
}: {
  episode: Episode;
  tasks: readonly Task[];
  now: Date;
}) {
  const router = useRouter();
  const episodeTasks = tasksForEpisode(tasks, episode.id);
  const completion = completionOf(episodeTasks);
  const late = overdueCount(episodeTasks, now);

  return (
    <Card
      onPress={() => router.push(`/episode/${episode.id}`)}
      accessibilityLabel={`${episode.code} ${episode.title}`}
      style={{ padding: spacing.card }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.cards,
        }}
      >
        <AppText
          style={{
            fontFamily: fontFamily.monoSemibold,
            fontSize: 10,
            lineHeight: 12,
            letterSpacing: 0.8,
            color: colors.yellowDeep,
          }}
        >
          {episode.code}
        </AppText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <AppText
            style={{
              fontFamily: fontFamily.mono,
              fontSize: 10,
              lineHeight: 12,
              color: colors.faint,
            }}
          >
            {airLabel(episode.airDate)}
          </AppText>
          <StatusPill status={episode.status} />
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: spacing.cardTight,
          marginTop: 7,
          marginBottom: 11,
        }}
      >
        {/* Bengali: AppText swaps in Noto Sans Bengali. */}
        <AppText weight="semibold" style={[type.h4, { flex: 1, lineHeight: 20 }]}>
          {episode.title}
        </AppText>
        <AppText style={[type.cardPercent, { fontFamily: fontFamily.monoSemibold, lineHeight: 24 }]}>
          {`${completion.percent}%`}
        </AppText>
      </View>

      <ProgressBar value={completion.percent / 100} height={layout.progressBar} />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 9,
          gap: spacing.cardTight,
        }}
      >
        <AppText
          style={{
            fontFamily: fontFamily.mono,
            fontSize: 11,
            lineHeight: 11,
            color: colors.muted,
          }}
        >
          {`${completion.done} of ${completion.total} tasks done`}
        </AppText>
        <AppText
          style={{
            fontFamily: fontFamily.monoSemibold,
            fontSize: 10,
            lineHeight: 10,
            color: late ? colors.danger : colors.faint,
          }}
        >
          {late ? `${late} overdue` : "on schedule"}
        </AppText>
      </View>
    </Card>
  );
}
