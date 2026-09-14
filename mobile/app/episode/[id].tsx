/**
 * Episode detail — the segmentation the client asked for: episode, then the
 * members working on it, then their tasks, with a percentage at every level.
 */

import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppShell } from "../../src/components/AppShell";
import { AppText } from "../../src/components/AppText";
import { Avatar } from "../../src/components/Avatar";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { HeatBadge } from "../../src/components/HeatBadge";
import { ProgressBar } from "../../src/components/ProgressBar";
import { SectionCaption } from "../../src/components/SectionCaption";
import { useSession } from "../../src/lib/auth";
import {
  channelWord,
  doneToast,
  nudgeFailedToast,
  nudgeTask,
  nudgeToast,
  setTaskDone,
} from "../../src/lib/actions";
import { bestChannelFor, channelLabel } from "../../src/lib/channels.ts";
import { completionOf, membersInEpisode, tasksForEpisode } from "../../src/lib/completion.ts";
import { useEpisodes, useNow, useSettings, useTasks, useTeam } from "../../src/lib/data";
import { rowNote } from "../../src/lib/escalation.ts";
import { airLabel } from "../../src/lib/format.ts";
import type { Task } from "../../src/lib/model";
import { useToast } from "../../src/lib/toast";
import { colors, fontFamily, layout, radii, spacing, MIN_TAP_TARGET } from "../../src/theme/tokens";
import { type } from "../../src/theme/typography";

export default function EpisodeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const { isAdmin } = useSession();

  const { data: episodes } = useEpisodes(isAdmin);
  const { data: tasks } = useTasks({ enabled: isAdmin });
  const { data: team } = useTeam(isAdmin);
  const { data: settings } = useSettings(isAdmin);

  const episode = useMemo(() => episodes.find((e) => e.id === id), [episodes, id]);
  const episodeTasks = useMemo(() => tasksForEpisode(tasks, id ?? ""), [tasks, id]);
  const completion = useMemo(() => completionOf(episodeTasks), [episodeTasks]);
  const approved = useMemo(() => team.filter((m) => m.status === "approved"), [team]);
  const slices = useMemo(
    () => membersInEpisode(episodeTasks, approved, now),
    [episodeTasks, approved, now]
  );

  async function toggle(task: Task) {
    await setTaskDone(task, !task.done);
    toast(doneToast(task.type, !task.done));
  }

  async function nudge(task: Task) {
    try {
      const sent = await nudgeTask(task);
      toast(
        sent.channel
          ? nudgeToast(sent.name, channelWord(sent.channel), task.type, episode?.code ?? "")
          : nudgeFailedToast(sent.name, task.type)
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not send.");
    }
  }

  return (
    <AppShell
      title={episode ? `${episode.code} · ${episode.title}` : "Episode"}
      subtitle={airLabel(episode?.airDate ?? null)}
      activeTab="episodes"
      showFab
      assignHref={`/assign?episodeId=${id}`}
      onBack={() => router.back()}
    >
      <View
        style={{
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.hairline,
          paddingVertical: 15,
          paddingHorizontal: 16,
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
            <SectionCaption>Episode completion</SectionCaption>
            <AppText
              style={{
                fontFamily: fontFamily.mono,
                fontSize: 11,
                lineHeight: 15.4,
                color: "rgba(27,26,23,.55)",
                marginTop: 7,
              }}
            >
              {`${completion.done} of ${completion.total} tasks closed · tap a box to close one`}
            </AppText>
          </View>
          <AppText
            style={[type.episodePercent, { fontFamily: fontFamily.monoSemibold, lineHeight: 38 }]}
          >
            {`${completion.percent}%`}
          </AppText>
        </View>

        <ProgressBar
          value={completion.percent / 100}
          height={layout.progressBarLarge}
          style={{ marginTop: 13 }}
        />
      </View>

      <View style={{ padding: spacing.screen, gap: spacing.cards }}>
        <SectionCaption>Member status</SectionCaption>

        {slices.length === 0 ? (
          <EmptyState
            title="Nothing assigned yet"
            detail="Use the + button to give this episode its first task."
          />
        ) : null}

        {slices.map(({ member, tasks: memberTasks, completion: own, overdue, worstStep, allDone }) => (
          <View
            key={member.uid}
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.hairline,
              borderRadius: radii.cardLarge,
              overflow: "hidden",
            }}
          >
            <Pressable
              onPress={() => router.push(`/person/${member.uid}`)}
              accessibilityRole="button"
              accessibilityLabel={member.name}
              android_ripple={{ color: "rgba(27,26,23,.06)" }}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 13,
                flexDirection: "row",
                alignItems: "center",
                gap: 11,
                borderBottomWidth: 1,
                borderBottomColor: colors.page,
              }}
            >
              <Avatar name={member.name} size={layout.avatar} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText weight="semibold" style={type.cardTitleSmall}>
                  {member.name}
                </AppText>
                <AppText
                  numberOfLines={1}
                  style={{
                    fontFamily: fontFamily.mono,
                    fontSize: 10,
                    lineHeight: 13.5,
                    color: "rgba(27,26,23,.5)",
                    marginTop: 3,
                  }}
                >
                  {`${member.craft ?? "no craft"} · ${own.done}/${own.total} done · via ${channelLabel(
                    bestChannelFor(member, settings)
                  )}`}
                </AppText>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                <HeatBadge
                  step={worstStep}
                  done={allDone}
                  label={allDone ? "Clear" : overdue ? `${overdue} overdue` : undefined}
                />
                <AppText
                  style={[
                    type.memberPercent,
                    { fontFamily: fontFamily.monoSemibold, lineHeight: 15, width: 38, textAlign: "right" },
                  ]}
                >
                  {`${own.percent}%`}
                </AppText>
              </View>
            </Pressable>

            {memberTasks.map((task) => (
              <View
                key={task.id}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 13,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 11,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.surfaceSunken,
                  minHeight: MIN_TAP_TARGET,
                }}
              >
                <Pressable
                  onPress={() => void toggle(task)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: task.done }}
                  accessibilityLabel={`${task.type}, ${task.done ? "done" : "not done"}`}
                  hitSlop={12}
                  style={{
                    width: layout.tickBox,
                    height: layout.tickBox,
                    borderRadius: radii.tick,
                    borderWidth: 1.5,
                    borderColor: task.done ? colors.ink : colors.hairlineStronger,
                    backgroundColor: task.done ? colors.ink : colors.surface,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {task.done ? (
                    <AppText
                      style={{
                        fontFamily: fontFamily.monoSemibold,
                        fontSize: 11,
                        lineHeight: 12,
                        color: colors.brandYellow,
                      }}
                    >
                      ✓
                    </AppText>
                  ) : null}
                </Pressable>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText
                    weight="medium"
                    style={{
                      fontFamily: fontFamily.medium,
                      fontSize: 12.5,
                      lineHeight: 15.6,
                      color: task.done ? "rgba(27,26,23,.4)" : colors.ink,
                      textDecorationLine: task.done ? "line-through" : "none",
                    }}
                  >
                    {task.type}
                  </AppText>
                  <AppText
                    numberOfLines={1}
                    style={{
                      fontFamily: fontFamily.mono,
                      fontSize: 10,
                      lineHeight: 14,
                      color: "rgba(27,26,23,.45)",
                      marginTop: 3,
                    }}
                  >
                    {rowNote(task, settings.plan, now)}
                  </AppText>
                </View>

                <Button
                  label={task.done ? "Done" : "Nudge"}
                  size="compact"
                  variant={task.done ? "quiet" : "yellow"}
                  radius={7}
                  disabled={task.done}
                  onPress={() => void nudge(task)}
                  style={{ paddingVertical: 7, paddingHorizontal: 9 }}
                  accessibilityLabel={`Nudge ${member.name} about ${task.type}`}
                />
              </View>
            ))}
          </View>
        ))}
      </View>
    </AppShell>
  );
}
