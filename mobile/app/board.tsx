/**
 * Board — the admin's home. What is late, who is being chased, and what went
 * out this morning.
 */

import { useMemo, useState } from "react";
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
import { groupByEpisode, groupSummary } from "../src/lib/episode-groups.ts";
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
  const groups = useMemo(() => groupByEpisode(chase, episodes, now), [chase, episodes, now]);
  /** Only one open at a time: the point is to stop it being a wall. */
  const [expanded, setExpanded] = useState<string | null>(null);
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
      {/* The same three tiles the member's summary opens on, in the same
          soft fills. An admin and a member are looking at two views of one
          set of tasks, and until now the two screens did not look related. */}
      <View
        style={{
          flexDirection: "row",
          gap: spacing.cardTight,
          paddingHorizontal: spacing.screen,
          paddingTop: spacing.cards,
          marginBottom: spacing.cards,
        }}
      >
        <StatCell
          value={stats.overdue}
          label="Overdue"
          fill={colors.attentionSoft}
          tone={colors.attention}
        />
        <StatCell value={stats.open} label="Open tasks" fill={colors.infoSoft} tone={colors.info} />
        <StatCell value={stats.done} label="Done" fill={colors.moneySoft} tone={colors.money} />
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
          android_ripple={{ color: colors.ripple }}
          style={{
            marginTop: 8,
            marginHorizontal: spacing.screen,
            backgroundColor: colors.infoSoft,
            borderWidth: 1,
            borderColor: colors.info,
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
          <AppText style={{ fontFamily: fontFamily.mono, fontSize: 11, color: colors.muted }}>
            Review
          </AppText>
        </Pressable>
      ) : null}

      {pending.length > 0 ? (
        <Pressable
          onPress={() => router.push("/requests")}
          accessibilityRole="button"
          accessibilityLabel={`${pending.length} registrations awaiting approval`}
          android_ripple={{ color: colors.ripple }}
          style={{
            marginTop: 8,
            marginHorizontal: spacing.screen,
            // Somebody waiting to be let in is attention, not information.
            backgroundColor: colors.attentionSoft,
            borderWidth: 1,
            borderColor: colors.attention,
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
              backgroundColor: colors.attention,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AppText
              style={{ fontFamily: fontFamily.monoSemibold, fontSize: 12, lineHeight: 12, color: colors.white }}
            >
              {String(pending.length)}
            </AppText>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText
              weight="semibold"
              style={{ fontFamily: fontFamily.semibold, fontSize: 12.5, lineHeight: 15, color: colors.ink }}
            >
              Registrations awaiting approval
            </AppText>
            <AppText
              numberOfLines={1}
              style={{
                fontFamily: fontFamily.mono,
                fontSize: 10,
                lineHeight: 13.5,
                color: colors.muted,
                marginTop: 3,
              }}
            >
              {pending.map((p) => p.name.split(" ")[0]).join(", ")} · from Play Store
            </AppText>
          </View>
          <AppText style={{ fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 16, color: colors.attention }}>
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
          style={{ fontFamily: fontFamily.mono, fontSize: 10, lineHeight: 10, color: colors.faint }}
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

        {/* By episode, not a flat list. The same episode's script, voice and
            mix used to sit three rows apart, and the one question an admin
            actually has — which episode is in trouble — could not be answered
            by scanning it. */}
        {groups.map((group) => {
          const open = expanded === group.episodeId;
          return (
            <Card key={group.episodeId} clip>
              <ProgressBar
                value={heatFor(group.worstStep).bar}
                height={layout.heatBar}
                track={colors.hairline}
                rounded={false}
              />

              <Pressable
                onPress={() => setExpanded(open ? null : group.episodeId)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`${group.code}, ${groupSummary(group)}`}
                android_ripple={{ color: colors.ripple }}
                style={{
                  paddingTop: 12,
                  paddingHorizontal: 13,
                  paddingBottom: 11,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.cards,
                  minHeight: MIN_TAP_TARGET,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText weight="semibold" style={type.cardTitle}>
                    {group.code}
                  </AppText>
                  {/* Bengali title: AppText gives it Noto Sans Bengali. */}
                  {group.title ? (
                    <AppText
                      numberOfLines={1}
                      style={{
                        fontFamily: fontFamily.regular,
                        fontSize: 11.5,
                        lineHeight: 16,
                        color: colors.muted,
                        marginTop: 2,
                      }}
                    >
                      {group.title}
                    </AppText>
                  ) : null}
                  <AppText
                    style={{
                      fontFamily: fontFamily.mono,
                      fontSize: 10.5,
                      lineHeight: 14,
                      color: colors.faint,
                      marginTop: 3,
                    }}
                  >
                    {groupSummary(group)}
                  </AppText>
                </View>

                <HeatBadge step={group.worstStep} />
                <AppText
                  style={{
                    fontFamily: fontFamily.mono,
                    fontSize: 13,
                    lineHeight: 14,
                    color: colors.faint,
                  }}
                >
                  {open ? "\u2212" : "+"}
                </AppText>
              </Pressable>

              {open
                ? group.tasks.map((task) => {
                    const member = byUid.get(task.assigneeUid);
                    const heat = heatFor(task.remindersSent);
                    return (
                      <View
                        key={task.id}
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: colors.hairline,
                          paddingVertical: 11,
                          paddingHorizontal: 13,
                          gap: 9,
                        }}
                      >
                        <Pressable
                          onPress={() => router.push(`/person/${task.assigneeUid}`)}
                          accessibilityRole="button"
                          accessibilityLabel={`${task.type} for ${member?.name ?? "unassigned"}`}
                          style={{
                            flexDirection: "row",
                            alignItems: "flex-start",
                            gap: spacing.cards,
                            minHeight: MIN_TAP_TARGET - 12,
                          }}
                        >
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
                                color: colors.faint,
                                marginTop: 3,
                              }}
                            >
                              {[member?.name, dueLabel(task, now)].filter(Boolean).join(" \u00b7 ")}
                            </AppText>
                          </View>
                          <HeatBadge step={task.remindersSent} />
                        </Pressable>

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
                    );
                  })
                : null}
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
                      color: entry.result === "failed" ? colors.danger : colors.muted,
                    }}
                  >
                    {summary || "Reminder sent"}
                    {entry.result === "failed" ? " · failed" : ""}
                  </AppText>
                  <AppText
                    style={{ fontFamily: fontFamily.mono, fontSize: 9.5, lineHeight: 9.5, color: colors.faint }}
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

function StatCell({
  value,
  label,
  fill,
  tone,
}: {
  value: number;
  label: string;
  fill: string;
  tone: string;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: fill, borderRadius: radii.card, padding: 13 }}>
      <AppText
        style={{
          fontFamily: fontFamily.monoMedium,
          fontSize: 9.5,
          lineHeight: 11,
          letterSpacing: 0.9,
          textTransform: "uppercase",
          color: tone,
        }}
      >
        {label}
      </AppText>
      <AppText
        weight="semibold"
        style={{
          fontFamily: fontFamily.extrabold,
          fontSize: 28,
          lineHeight: 32,
          letterSpacing: -1.2,
          color: tone,
          marginTop: 3,
        }}
      >
        {String(value)}
      </AppText>
    </View>
  );
}
