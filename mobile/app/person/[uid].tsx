/**
 * Person detail — everything one member owes, across every episode.
 */

import { useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppShell } from "../../src/components/AppShell";
import { AppText } from "../../src/components/AppText";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { EmptyState } from "../../src/components/EmptyState";
import { HeatBadge } from "../../src/components/HeatBadge";
import { useSession } from "../../src/lib/auth";
import {
  channelWord,
  nudgeAllOpen,
  nudgeAllToast,
  nothingOpenToast,
} from "../../src/lib/actions";
import { bestChannelFor, channelLabel, CHANNEL_LABELS } from "../../src/lib/channels.ts";
import { byDueDate, tasksForMember } from "../../src/lib/completion.ts";
import { indexBy, useEpisodes, useNow, useSettings, useTasks, useTeam } from "../../src/lib/data";
import { countdownLabel, dueLabel } from "../../src/lib/escalation.ts";
import type { ChannelId } from "../../src/lib/model";
import { ChannelPicker } from "../../src/components/ChannelPicker";
import { channelPinnedToast, setPreferredChannel } from "../../src/lib/registrations";
import { useToast } from "../../src/lib/toast";
import { colors, fontFamily, radii, spacing } from "../../src/theme/tokens";

export default function PersonDetail() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const { isAdmin } = useSession();

  const { data: team } = useTeam(isAdmin);
  const { data: tasks } = useTasks({ enabled: isAdmin });
  const { data: episodes } = useEpisodes(isAdmin);
  const { data: settings } = useSettings(isAdmin);

  const member = useMemo(() => team.find((m) => m.uid === uid), [team, uid]);
  const byEpisode = useMemo(() => indexBy(episodes, (e) => e.id), [episodes]);
  const mine = useMemo(() => byDueDate(tasksForMember(tasks, uid ?? ""), now), [tasks, uid, now]);
  const channel = member ? bestChannelFor(member, settings) : null;
  const [busy, setBusy] = useState(false);
  const [pinning, setPinning] = useState(false);

  async function pinChannel(channel: ChannelId | null) {
    if (!member || pinning) return;
    setPinning(true);
    try {
      await setPreferredChannel(member.uid, channel);
      toast(channelPinnedToast(member.name, channel ? CHANNEL_LABELS[channel] : null));
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setPinning(false);
    }
  }

  async function nudgeAll() {
    if (!member || busy) return;
    setBusy(true);
    try {
      const sent = await nudgeAllOpen(member.uid);
      toast(
        sent.count === 0
          ? nothingOpenToast(member.name)
          : sent.channel
            ? nudgeAllToast(sent.count, member.name, channelWord(sent.channel))
            : `Could not reach ${member.name} — nothing was delivered`
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={member?.name ?? "Member"}
      subtitle={`${member?.craft ?? "no craft"} · reminders via ${channelLabel(channel)}`}
      activeTab="team"
      showFab
      assignHref={`/assign?uid=${uid}`}
      onBack={() => router.back()}
    >
      <View
        style={{
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.hairline,
          paddingVertical: spacing.card,
          paddingHorizontal: 16,
          flexDirection: "row",
          gap: spacing.cardsTight,
        }}
      >
        <Button
          label={busy ? "Sending…" : "Nudge all open"}
          disabled={busy}
          onPress={() => void nudgeAll()}
          radius={radii.cardSmall}
          style={{ flex: 1 }}
          accessibilityLabel={`Nudge ${member?.name ?? "them"} about every open task`}
        />
        <Button
          label="Assign task"
          variant="ink"
          radius={radii.cardSmall}
          onPress={() => router.push(`/assign?uid=${uid}`)}
          style={{ flex: 1 }}
        />
      </View>

      {member ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.hairline,
            paddingVertical: spacing.card,
            paddingHorizontal: 16,
          }}
        >
          <ChannelPicker
            member={member}
            settings={settings}
            busy={pinning}
            onChange={(channel) => void pinChannel(channel)}
          />
        </View>
      ) : null}

      <View style={{ padding: spacing.screen, gap: spacing.cardsTight }}>
        {mine.length === 0 ? (
          <EmptyState
            title="Nothing assigned"
            detail="Give them their first task with Assign task above."
          />
        ) : null}

        {mine.map((task) => {
          const episode = byEpisode.get(task.episodeId);
          return (
            <Card key={task.id} radius={11} style={{ paddingVertical: 12, paddingHorizontal: 13 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.cards }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText
                    weight="semibold"
                    style={{
                      fontFamily: fontFamily.semibold,
                      fontSize: 13,
                      lineHeight: 16.25,
                      color: task.done ? "rgba(27,26,23,.4)" : colors.ink,
                      textDecorationLine: task.done ? "line-through" : "none",
                    }}
                  >
                    {task.type}
                  </AppText>
                  {/* Bengali title inside a monospace meta line: AppText
                      gives the whole line the family that can draw it. */}
                  <AppText
                    numberOfLines={2}
                    style={{
                      fontFamily: fontFamily.mono,
                      fontSize: 10.5,
                      lineHeight: 14.7,
                      color: "rgba(27,26,23,.5)",
                      marginTop: 3,
                    }}
                  >
                    {[episode?.code, episode?.title, dueLabel(task, now)].filter(Boolean).join(" · ")}
                  </AppText>
                </View>
                <HeatBadge step={task.remindersSent} done={task.done} />
              </View>

              <View
                style={{
                  backgroundColor: colors.surfaceAlt,
                  borderRadius: 7,
                  paddingVertical: 7,
                  paddingHorizontal: 9,
                  marginTop: 9,
                }}
              >
                <AppText
                  style={{
                    fontFamily: fontFamily.monoMedium,
                    fontSize: 10.5,
                    lineHeight: 13.65,
                    color: colors.ink,
                  }}
                >
                  {countdownLabel(task, settings.plan, now)}
                </AppText>
              </View>
            </Card>
          );
        })}
      </View>
    </AppShell>
  );
}
