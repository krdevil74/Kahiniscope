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
import { useSession } from "../src/lib/auth";
import { byAirDate, completionOf, overdueCount, tasksForEpisode } from "../src/lib/completion.ts";
import { useEpisodes, useNow, useTasks } from "../src/lib/data";
import { airLabel, pluralise } from "../src/lib/format.ts";
import { colors, fontFamily, layout, radii, spacing } from "../src/theme/tokens";
import { type } from "../src/theme/typography";

export default function Episodes() {
  const router = useRouter();
  const now = useNow();
  const { isAdmin } = useSession();

  const { data: episodes, loading } = useEpisodes(isAdmin);
  const { data: tasks } = useTasks({ enabled: isAdmin });

  const ordered = useMemo(() => byAirDate(episodes), [episodes]);
  const slate = useMemo(() => completionOf(tasks), [tasks]);

  return (
    <AppShell
      title="Episodes"
      subtitle={`${episodes.length} in production`}
      activeTab="episodes"
      showFab
    >
      <View style={{ padding: spacing.screen, gap: spacing.cards }}>
        {/* Slate completion. */}
        <View
          style={{
            backgroundColor: colors.ink,
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
                  color: "rgba(255,255,255,.65)",
                  marginTop: 7,
                }}
              >
                {`${slate.done} of ${slate.total} tasks closed across ${pluralise(episodes.length, "episode")}`}
              </AppText>
            </View>
            <AppText
              style={[
                type.slatePercent,
                { fontFamily: fontFamily.monoSemibold, lineHeight: 42, color: colors.brandYellow },
              ]}
            >
              {`${slate.percent}%`}
            </AppText>
          </View>

          <ProgressBar
            value={slate.percent / 100}
            height={layout.progressBarLarge}
            fill={colors.brandYellow}
            track="rgba(255,255,255,.14)"
            style={{ marginTop: spacing.card }}
          />
        </View>

        {ordered.length === 0 && !loading ? (
          <EmptyState
            title="No episodes yet"
            detail="Episodes appear here as soon as the first task is assigned to one."
          />
        ) : null}

        {ordered.map((episode) => {
          const episodeTasks = tasksForEpisode(tasks, episode.id);
          const completion = completionOf(episodeTasks);
          const late = overdueCount(episodeTasks, now);

          return (
            <Card
              key={episode.id}
              onPress={() => router.push(`/episode/${episode.id}`)}
              accessibilityLabel={`${episode.code} ${episode.title}`}
              style={{ padding: spacing.card }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: spacing.cards,
                }}
              >
                <AppText
                  style={{
                    fontFamily: fontFamily.monoSemibold,
                    fontSize: 10,
                    lineHeight: 10,
                    letterSpacing: 0.8,
                    color: colors.yellowDeep,
                  }}
                >
                  {episode.code}
                </AppText>
                <AppText
                  style={{
                    fontFamily: fontFamily.mono,
                    fontSize: 10,
                    lineHeight: 10,
                    color: "rgba(27,26,23,.45)",
                  }}
                >
                  {airLabel(episode.airDate)}
                </AppText>
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
                <AppText
                  style={[type.cardPercent, { fontFamily: fontFamily.monoSemibold, lineHeight: 24 }]}
                >
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
                    color: "rgba(27,26,23,.55)",
                  }}
                >
                  {`${completion.done} of ${completion.total} tasks done`}
                </AppText>
                <AppText
                  style={{
                    fontFamily: fontFamily.monoSemibold,
                    fontSize: 10,
                    lineHeight: 10,
                    color: late ? colors.danger : "#3f5261",
                  }}
                >
                  {late ? `${late} overdue` : "on schedule"}
                </AppText>
              </View>
            </Card>
          );
        })}
      </View>
    </AppShell>
  );
}
