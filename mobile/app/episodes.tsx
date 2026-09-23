/**
 * Episodes — the slate. One percentage for everything, then one per episode.
 */

import { useMemo } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { AppShell } from "../src/components/AppShell";
import { AppText } from "../src/components/AppText";
import { Card } from "../src/components/Card";
import { EmptyState } from "../src/components/EmptyState";
import { ProgressBar } from "../src/components/ProgressBar";
import { SectionCaption } from "../src/components/SectionCaption";
import { StatusPill } from "../src/components/StatusPill";
import { useSession } from "../src/lib/auth";
import { byAirDate, completionOf, overdueCount, tasksForEpisode } from "../src/lib/completion.ts";
import { countByStatus, isBroadcast, isInProgress } from "../src/lib/episode-status.ts";
import { useEpisodes, useNow, useTasks } from "../src/lib/data";
import type { Episode, Task } from "../src/lib/model";
import { airLabel, pluralise } from "../src/lib/format.ts";
import { colors, fontFamily, layout, radii, spacing } from "../src/theme/tokens";
import { type } from "../src/theme/typography";

export default function Episodes() {
  const now = useNow();
  const { isAdmin } = useSession();

  const { data: episodes, loading } = useEpisodes(isAdmin);
  const { data: tasks } = useTasks({ enabled: isAdmin });

  // In progress first, then what has gone out. Both keep their air-date
  // order inside the group: the slate is a schedule, and a broadcast episode
  // is still worth opening — its work and its payments do not stop existing.
  const ordered = useMemo(() => byAirDate(episodes), [episodes]);
  const live = useMemo(() => ordered.filter(isInProgress), [ordered]);
  const aired = useMemo(() => ordered.filter(isBroadcast), [ordered]);
  const counts = useMemo(() => countByStatus(episodes), [episodes]);
  const slate = useMemo(() => completionOf(tasks), [tasks]);

  return (
    <AppShell
      title="Episodes"
      subtitle={`${counts.inProgress} in progress · ${counts.broadcast} broadcast`}
      activeTab="episodes"
      showFab
    >
      <View style={{ padding: spacing.screen, gap: spacing.cards }}>
        {/* Slate completion. A violet fill rather than the near-black the
            header already is: two near-black blocks stacked read as one, and
            the percentage on it was the brand violet — which is pitched for
            white and disappeared against it. */}
        <View
          style={{
            backgroundColor: colors.brandFill,
            borderRadius: radii.cardHero,
            paddingVertical: 16,
            paddingHorizontal: 17,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: spacing.card,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <SectionCaption onInk>Slate completion</SectionCaption>
              <AppText
                style={{
                  fontFamily: fontFamily.regular,
                  fontSize: 11,
                  lineHeight: 15.4,
                  color: "rgba(255,255,255,.82)",
                  marginTop: 7,
                }}
              >
                {`${slate.done} of ${slate.total} tasks closed across ${pluralise(episodes.length, "episode")}`}
              </AppText>
            </View>
            <AppText
              style={[
                type.slatePercent,
                { fontFamily: fontFamily.monoSemibold, lineHeight: 42, color: colors.white },
              ]}
            >
              {`${slate.percent}%`}
            </AppText>
          </View>

          <ProgressBar
            value={slate.percent / 100}
            height={layout.progressBarLarge}
            fill={colors.white}
            track="rgba(255,255,255,.26)"
            style={{ marginTop: spacing.card }}
          />
        </View>

        {ordered.length === 0 && !loading ? (
          <EmptyState
            title="No episodes yet"
            detail="Episodes appear here as soon as the first task is assigned to one."
          />
        ) : null}

        {live.map((episode) => (
          <EpisodeCard key={episode.id} episode={episode} tasks={tasks} now={now} />
        ))}

        {aired.length ? (
          <SectionCaption style={{ marginTop: spacing.cards }}>Broadcast</SectionCaption>
        ) : null}

        {aired.map((episode) => (
          <EpisodeCard key={episode.id} episode={episode} tasks={tasks} now={now} />
        ))}
      </View>
    </AppShell>
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
