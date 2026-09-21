/**
 * Board — the admin's home. What is late, who is being chased, and what went
 * out this morning.
 */

import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";

import { AppText } from "../src/components/AppText";
import { AppShell } from "../src/components/AppShell";
import { Avatar } from "../src/components/Avatar";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { EmptyState } from "../src/components/EmptyState";
import { HeatBadge } from "../src/components/HeatBadge";
import { ProgressBar } from "../src/components/ProgressBar";
import { reviewQueueLabel, submittedTasks } from "../src/lib/review.ts";
import { useSession } from "../src/lib/auth";
import { channelWord, nudgeFailedToast, nudgeTask, nudgeToast } from "../src/lib/actions";
import { CHANNEL_TAGS } from "../src/lib/channels.ts";
import { boardStats, openTasks } from "../src/lib/completion.ts";
import {
  indexBy,
  useEpisodes,
  useNow,
  useReminderFeed,
  useSettings,
  useTasks,
  useTeam,
} from "../src/lib/data";
import { boardDateLabel, feedTimeLabel } from "../src/lib/format.ts";
import { byChaseOrder, countdownLabel, dueLabel } from "../src/lib/escalation.ts";
import type { ChannelId, Task } from "../src/lib/model";
import { useToast } from "../src/lib/toast";
import { colors, fontFamily, heatFor, layout, radii, spacing, MIN_TAP_TARGET} from "../src/theme/tokens";
import { type } from "../src/theme/typography";

export default function Board() {
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const { isAdmin } = useSession();

  const { data: tasks, loading: tasksLoading } = useTasks({ enabled: isAdmin });
  const { data: team } = useTeam(isAdmin);
  const { data: episodes } = useEpisodes(isAdmin);
  const { data: feed } = useReminderFeed(12, isAdmin);
  const { data: settings } = useSettings(isAdmin);

  const byUid = useMemo(() => indexBy(team, (m) => m.uid), [team]);
  const byEpisode = useMemo(() => indexBy(episodes, (e) => e.id), [episodes]);
  const byTask = useMemo(() => indexBy(tasks, (t) => t.id), [tasks]);

  const stats = useMemo(() => boardStats(tasks, now), [tasks, now]);
  const chase = useMemo(() => byChaseOrder(openTasks(tasks), now), [tasks, now]);
  const pending = useMemo(() => team.filter((m) => m.status === "pending"), [team]);
  const review = useMemo(() => submittedTasks(tasks), [tasks]);

  async function nudge(task: Task) {
    const code = byEpisode.get(task.episodeId)?.code ?? "";
    try {
      const sent = await nudgeTask(task);
      toast(
        sent.channel
          ? nudgeToast(sent.name, channelWord(sent.channel), task.type, code)
          : nudgeFailedToast(sent.name, task.type)
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not send.");
    }
  }

  return (
    <AppShell
      title="Production board"
      subtitle={boardDateLabel(now)}
      activeTab="board"
      showFab
    >
      {/* Three equal cells, separated by 1px gutters showing through. */}
      <View style={{ flexDirection: "row", gap: 1, backgroundColor: colors.gutter, marginBottom: 8 }}>
        <StatCell value={stats.overdue} label="Overdue" tone={colors.danger} />
        <StatCell value={stats.open} label="Open tasks" />
        <StatCell value={stats.done} label="Done" />
      </View>

      {/* Work handed in and waiting on a decision. Above the registrations
          banner on purpose: somebody who has finished a job and is waiting to
          be paid for it is a more pressing queue than somebody who has just
          installed the app. */}
      {review.length > 0 ? (
        <Pressable
          onPress={() => router.push("/review")}
          accessibilityRole="button"
          accessibilityLabel={reviewQueueLabel(review.length)}
          android_ripple={{ color: "rgba(27,26,23,.08)" }}
          style={{
            marginTop: 8,
            marginHorizontal: spacing.screen,
            backgroundColor: colors.brandYellow,
            borderRadius: radii.cardLarge,
            paddingVertical: 12,
            paddingHorizontal: 13,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: MIN_TAP_TARGET,
          }}
        >
          <AppText weight="semibold" style={{ fontFamily: fontFamily.semibold, fontSize: 12.5, lineHeight: 15 }}>
            {reviewQueueLabel(review.length)}
          </AppText>
          <AppText style={{ fontFamily: fontFamily.mono, fontSize: 11, color: "rgba(27,26,23,.6)" }}>
            Review
          </AppText>
        </Pressable>
      ) : null}

      {pending.length > 0 ? (
        <Pressable
          onPress={() => router.push("/requests")}
          accessibilityRole="button"
          accessibilityLabel={`${pending.length} registrations awaiting approval`}
          android_ripple={{ color: "rgba(255,255,255,.08)" }}
          style={{
            marginTop: 8,
            marginHorizontal: spacing.screen,
            backgroundColor: colors.ink,
            borderRadius: radii.card,
            paddingVertical: 13,
            paddingHorizontal: spacing.card,
            flexDirection: "row",
            alignItems: "center",
            gap: 11,
          }}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: radii.pill,
              backgroundColor: colors.brandYellow,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AppText
              style={{ fontFamily: fontFamily.monoSemibold, fontSize: 12, lineHeight: 12, color: colors.ink }}
            >
              {String(pending.length)}
            </AppText>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText
              weight="semibold"
              style={{ fontFamily: fontFamily.semibold, fontSize: 12.5, lineHeight: 15, color: colors.white }}
            >
              Registrations awaiting approval
            </AppText>
            <AppText
              numberOfLines={1}
              style={{
                fontFamily: fontFamily.mono,
                fontSize: 10,
                lineHeight: 13.5,
                color: colors.onInkMuted,
                marginTop: 3,
              }}
            >
              {pending.map((p) => p.name.split(" ")[0]).join(", ")} · from Play Store
            </AppText>
          </View>
          <AppText style={{ fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 16, color: colors.brandYellow }}>
            →
          </AppText>
        </Pressable>
      ) : null}

      <View
        style={{
          paddingTop: spacing.card,
          paddingHorizontal: 16,
          paddingBottom: 8,
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: spacing.cards,
        }}
      >
        <AppText weight="semibold" style={{ fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 13 }}>
          Needs chasing
        </AppText>
        <AppText
          style={{ fontFamily: fontFamily.mono, fontSize: 10, lineHeight: 10, color: "rgba(27,26,23,.45)" }}
        >
          {settings.plan.join(" → ")} days
        </AppText>
      </View>

      <View style={{ paddingHorizontal: spacing.screen, gap: spacing.cardsTight }}>
        {chase.length === 0 && !tasksLoading ? (
          <EmptyState
            title="Nothing to chase"
            detail="Every assigned task is closed. New work goes out with the + button."
          />
        ) : null}

        {chase.map((task) => {
          const member = byUid.get(task.assigneeUid);
          const episode = byEpisode.get(task.episodeId);
          const heat = heatFor(task.remindersSent);
          return (
            <Card
              key={task.id}
              clip
              onPress={() => router.push(`/person/${task.assigneeUid}`)}
              accessibilityLabel={`${task.type} for ${member?.name ?? "unassigned"}`}
            >
              {/* The heat bar: how far up the ladder this one has climbed. */}
              <ProgressBar value={heat.bar} height={layout.heatBar} track={colors.hairline} rounded={false} />

              <View style={{ paddingTop: 12, paddingHorizontal: 13, paddingBottom: 11, gap: 9 }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.cards }}>
                  <Avatar name={member?.name ?? ""} size={layout.avatar} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="semibold" style={type.cardTitle}>
                      {task.type}
                    </AppText>
                    <AppText
                      numberOfLines={1}
                      style={{
                        fontFamily: fontFamily.mono,
                        fontSize: 11,
                        lineHeight: 15.4,
                        color: "rgba(27,26,23,.5)",
                        marginTop: 3,
                      }}
                    >
                      {[episode?.code, member?.name, dueLabel(task, now)].filter(Boolean).join(" · ")}
                    </AppText>
                  </View>
                  <HeatBadge step={task.remindersSent} />
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View
                    style={{
                      flex: 1,
                      minWidth: 0,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.chips,
                      backgroundColor: colors.surfaceAlt,
                      borderRadius: radii.chipLarge,
                      paddingVertical: 7,
                      paddingHorizontal: 9,
                    }}
                  >
                    <View
                      style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: heat.fg }}
                    />
                    <AppText
                      numberOfLines={1}
                      style={{
                        fontFamily: fontFamily.monoMedium,
                        fontSize: 10.5,
                        lineHeight: 13.65,
                        color: colors.ink,
                        flex: 1,
                      }}
                    >
                      {countdownLabel(task, settings.plan, now)}
                    </AppText>
                  </View>
                  <Button label="Nudge now" size="compact" onPress={() => void nudge(task)} />
                </View>
              </View>
            </Card>
          );
        })}
      </View>

      <View style={{ paddingTop: 20, paddingHorizontal: 16, paddingBottom: 8 }}>
        <AppText weight="semibold" style={{ fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 13 }}>
          Reminder feed
        </AppText>
      </View>

      <View style={{ paddingHorizontal: spacing.screen }}>
        {feed.length === 0 ? (
          <EmptyState
            title="Nothing sent yet"
            detail="Every reminder the app sends is listed here, with the channel that carried it."
          />
        ) : (
          <View style={{ borderRadius: 10, overflow: "hidden", gap: 1, backgroundColor: colors.hairline }}>
            {feed.map((entry) => {
              const task = byTask.get(entry.taskId);
              const member = byUid.get(entry.uid);
              const code = task ? byEpisode.get(task.episodeId)?.code : undefined;
              const summary = [member?.name, task ? `${task.type}, ${code ?? ""}`.trim() : null]
                .filter(Boolean)
                .join(" — ");
              return (
                <View
                  key={entry.id}
                  style={{
                    backgroundColor: colors.surface,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 9,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: colors.fill,
                      borderRadius: 3,
                      paddingVertical: 4,
                      paddingHorizontal: 5,
                    }}
                  >
                    <AppText
                      style={{ fontFamily: fontFamily.monoSemibold, fontSize: 9, lineHeight: 9, color: colors.ink }}
                    >
                      {CHANNEL_TAGS[entry.channel as ChannelId] ?? entry.channel.toUpperCase()}
                    </AppText>
                  </View>
                  <AppText
                    numberOfLines={2}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: fontFamily.regular,
                      fontSize: 11,
                      lineHeight: 15.4,
                      color: entry.result === "failed" ? colors.danger : "rgba(27,26,23,.75)",
                    }}
                  >
                    {summary || "Reminder sent"}
                    {entry.result === "failed" ? " · failed" : ""}
                  </AppText>
                  <AppText
                    style={{ fontFamily: fontFamily.mono, fontSize: 9.5, lineHeight: 9.5, color: "rgba(27,26,23,.35)" }}
                  >
                    {feedTimeLabel(entry.sentAt, now)}
                  </AppText>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </AppShell>
  );
}

function StatCell({ value, label, tone = colors.ink }: { value: number; label: string; tone?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingVertical: 14, paddingHorizontal: 12 }}>
      <AppText style={[type.statNumber, { fontFamily: fontFamily.monoSemibold, lineHeight: 26, color: tone }]}>
        {String(value)}
      </AppText>
      <AppText
        style={{
          fontFamily: fontFamily.regular,
          fontSize: 10,
          lineHeight: 13,
          color: "rgba(27,26,23,.55)",
          marginTop: 5,
        }}
      >
        {label}
      </AppText>
    </View>
  );
}
