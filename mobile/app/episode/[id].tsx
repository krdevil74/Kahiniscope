/**
 * Episode detail — the segmentation the client asked for: episode, then the
 * members working on it, then their tasks, with a percentage at every level.
 */

import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppShell } from "../../src/components/AppShell";
import { AppText } from "../../src/components/AppText";
import { Avatar } from "../../src/components/Avatar";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { HeatBadge } from "../../src/components/HeatBadge";
import { ProgressBar } from "../../src/components/ProgressBar";
import { ScriptCard } from "../../src/components/ScriptCard";
import { SectionCaption } from "../../src/components/SectionCaption";
import { StatusPill } from "../../src/components/StatusPill";
import { craftLabel } from "../../src/lib/crafts";
import { useSession } from "../../src/lib/auth";
import {
  channelWord,
  deleteEpisode,
  deleteTask,
  nudgeFailedToast,
  nudgeTask,
  nudgeToast,
  setEpisodeStatus,
} from "../../src/lib/actions";
import { DangerButton } from "../../src/components/DangerButton";
import {
  deleteEpisodeLabel,
  episodeDeletable,
  episodeDeletedToast,
  taskDeletable,
  taskDeletedToast,
} from "../../src/lib/removal.ts";
import {
  approveOwnTask,
  ownApprovalToast,
  sentToReviewToast,
  submitTask,
} from "../../src/lib/review-actions.ts";
import { tickActionFor, tickLabel } from "../../src/lib/review.ts";
import { bestChannelFor, channelLabel } from "../../src/lib/channels.ts";
import { completionOf, membersInEpisode, tasksForEpisode } from "../../src/lib/completion.ts";
import {
  episodeStatusAction,
  episodeStatusToast,
  isBroadcast,
  nextEpisodeStatus,
} from "../../src/lib/episode-status.ts";
import { useEpisodeScripts, useEpisodes, useNow, useSettings, useTasks, useTeam } from "../../src/lib/data";
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
  const { isAdmin, user } = useSession();

  const { data: episodes } = useEpisodes(isAdmin);
  const { data: tasks } = useTasks({ enabled: isAdmin });
  const { data: team } = useTeam(isAdmin);
  const { data: settings } = useSettings(isAdmin);
  const scriptIds = useMemo(() => (id ? [id] : []), [id]);
  const { data: scripts } = useEpisodeScripts(scriptIds, isAdmin);

  const episode = useMemo(() => episodes.find((e) => e.id === id), [episodes, id]);
  const broadcast = episode ? isBroadcast(episode) : false;
  const episodeTasks = useMemo(() => tasksForEpisode(tasks, id ?? ""), [tasks, id]);
  const completion = useMemo(() => completionOf(episodeTasks), [episodeTasks]);
  const approved = useMemo(() => team.filter((m) => m.status === "approved"), [team]);
  const slices = useMemo(
    () => membersInEpisode(episodeTasks, approved, now),
    [episodeTasks, approved, now]
  );

  /**
   * The box next to a task. What it does depends on whose work it is — the
   * admin's own is accepted on the spot and opens a payment, anybody else's
   * goes to the review queue where the form that prices it lives. See
   * lib/review.ts. Nothing here writes `done`: closing work without a payment
   * behind it is the bug this replaced.
   */
  async function tick(task: Task, name: string) {
    const action = tickActionFor(task, user?.uid ?? "");
    if (action === "locked") return;
    try {
      if (action === "approve") {
        toast(ownApprovalToast(task.type, await approveOwnTask(task)));
      } else {
        await submitTask(task.id);
        toast(sentToReviewToast(task.type, name));
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not go through.");
    }
  }

  /**
   * Deleting one task. Armed by the × and confirmed by the pill that replaces
   * the Nudge button, so a destructive tap is never one tap.
   */
  const [armed, setArmed] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const removableEpisode = episodeDeletable(episodeTasks);

  async function removeTask(task: Task) {
    if (removing) return;
    setRemoving(true);
    try {
      const { type } = await deleteTask(task.id);
      setArmed(null);
      toast(taskDeletedToast(type));
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not delete.");
    } finally {
      setRemoving(false);
    }
  }

  async function removeEpisode() {
    if (!episode || removing) return;
    setRemoving(true);
    try {
      const gone = await deleteEpisode(episode.id);
      toast(episodeDeletedToast(gone.code, gone.tasks));
      // Nothing to come back to: this screen is about a document that is now
      // deleted, so it goes rather than redrawing itself empty.
      router.replace("/episodes");
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not delete.");
      setRemoving(false);
    }
  }

  async function switchStatus() {
    if (!episode) return;
    const next = nextEpisodeStatus(episode.status);
    await setEpisodeStatus(episode.id, next);
    toast(episodeStatusToast(episode.code, next));
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
      showFab={!broadcast}
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
                color: colors.muted,
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
        {/* Life cycle. Broadcast is the state that changes what the rest of
            the app will do — the new-task picker stops offering this episode
            — so the consequence is spelled out beside the switch rather than
            left for an admin to discover from an empty list. */}
        {episode ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.hairline,
              borderRadius: radii.cardLarge,
              padding: spacing.card,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.card,
            }}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
              <StatusPill status={episode.status} />
              <AppText
                style={{
                  fontFamily: fontFamily.regular,
                  fontSize: 11,
                  lineHeight: 15.4,
                  color: colors.muted,
                }}
              >
                {broadcast
                  ? "Gone out. It is not offered on the new-task screen; the work already on it still is."
                  : "Still open for new tasks."}
              </AppText>
            </View>
            <Button
              label={episodeStatusAction(episode.status)}
              variant={broadcast ? "outline" : "ink"}
              size="compact"
              onPress={() => void switchStatus()}
              accessibilityLabel={`${episodeStatusAction(episode.status)} ${episode.code}`}
            />
          </View>
        ) : null}

        {id ? (
          <ScriptCard
            episodeId={id}
            script={scripts[id] ?? null}
            addedBy={user?.uid ?? ""}
            onToast={toast}
          />
        ) : null}

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
              android_ripple={{ color: colors.ripple }}
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
                    color: colors.faint,
                    marginTop: 3,
                  }}
                >
                  {`${craftLabel(member.crafts)} · ${own.done}/${own.total} done · via ${channelLabel(
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

            {memberTasks.map((task) => {
              // Locked means it is already in — accepted, or handed in and
              // waiting to be priced. There is no un-opening a payment, so
              // there is no untick.
              const locked = tickActionFor(task, user?.uid ?? "") === "locked";
              const waiting = task.status === "submitted";
              const removable = taskDeletable(task);
              const armedHere = armed === task.id;
              return (
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
                    onPress={() => void tick(task, member.name)}
                    disabled={locked}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: task.done, disabled: locked }}
                    accessibilityLabel={tickLabel(task, task.type)}
                    hitSlop={12}
                    style={{
                      width: layout.tickBox,
                      height: layout.tickBox,
                      borderRadius: radii.tick,
                      borderWidth: 1.5,
                      // Handed in is not closed: the box takes the strong border
                      // without the fill, so a row waiting on a decision does not
                      // read as a row that is finished with.
                      borderColor: task.done || waiting ? colors.ink : colors.hairlineStronger,
                      backgroundColor: task.done ? colors.ink : colors.surface,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {task.done || waiting ? (
                      <AppText
                        style={{
                          fontFamily: fontFamily.monoSemibold,
                          fontSize: 11,
                          lineHeight: 12,
                          color: task.done ? colors.brand : colors.ink,
                        }}
                      >
                        {task.done ? "✓" : "·"}
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
                        color: task.done ? colors.faint : colors.ink,
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
                        color: colors.faint,
                        marginTop: 3,
                      }}
                    >
                      {rowNote(task, settings.plan, now)}
                    </AppText>
                  </View>

                  {/* Armed by the ×, which puts the confirmation where the
                      Nudge button was — same slot, so nothing reflows under a
                      thumb that is already moving. */}
                  {armedHere ? (
                    <Pressable
                      onPress={() => void removeTask(task)}
                      disabled={removing}
                      accessibilityRole="button"
                      accessibilityLabel={`Confirm deleting ${task.type} from ${member.name}`}
                      style={{
                        paddingVertical: 7,
                        paddingHorizontal: 10,
                        borderRadius: 7,
                        backgroundColor: colors.attention,
                        minHeight: 30,
                        justifyContent: "center",
                      }}
                    >
                      <AppText
                        weight="medium"
                        style={{
                          fontFamily: fontFamily.medium,
                          fontSize: 11,
                          lineHeight: 14,
                          color: colors.white,
                        }}
                      >
                        {removing ? "…" : "Delete?"}
                      </AppText>
                    </Pressable>
                  ) : (
                    <Button
                      label={task.done ? "Done" : waiting ? "In review" : "Nudge"}
                      size="compact"
                      variant={task.done || waiting ? "quiet" : "yellow"}
                      radius={7}
                      // Nobody is chased about work that is in. Nudging somebody
                      // who is waiting on this admin would be the app blaming them
                      // for the admin's own queue.
                      disabled={task.done || waiting}
                      onPress={() => void nudge(task)}
                      style={{ paddingVertical: 7, paddingHorizontal: 9 }}
                      accessibilityLabel={`Nudge ${member.name} about ${task.type}`}
                    />
                  )}

                  {/* Drawn even when it cannot be used: a control that vanishes
                      leaves somebody hunting for it, and the label says why. */}
                  <Pressable
                    onPress={() => setArmed(armedHere ? null : task.id)}
                    disabled={!removable.ok}
                    accessibilityRole="button"
                    accessibilityLabel={
                      removable.ok
                        ? armedHere
                          ? `Cancel deleting ${task.type}`
                          : `Delete ${task.type} from ${member.name}`
                        : `${task.type} cannot be deleted. ${removable.reason}`
                    }
                    accessibilityState={{ disabled: !removable.ok }}
                    hitSlop={8}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: radii.pill,
                      borderWidth: 1,
                      borderColor: removable.ok ? colors.hairlineStronger : colors.hairline,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <AppText
                      style={{
                        fontFamily: fontFamily.mono,
                        fontSize: 13,
                        lineHeight: 14,
                        color: removable.ok ? colors.muted : colors.hairlineStronger,
                      }}
                    >
                      ×
                    </AppText>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}

        {/* The way back from a slate typed in by mistake. At the foot of the
            screen rather than beside the status control: it is the last thing
            anybody should reach, and reaching it should take a scroll. */}
        <View
          style={{
            marginTop: 18,
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: colors.hairline,
            gap: 7,
          }}
        >
          <SectionCaption>Delete</SectionCaption>
          <AppText style={[type.metaXSmall, { color: colors.faint, lineHeight: 15 }]}>
            {`Takes the episode, its ${episodeTasks.length === 1 ? "task" : "tasks"} and its script link with it. There is no undo.`}
          </AppText>
          <DangerButton
            label={deleteEpisodeLabel(episodeTasks.length, false)}
            armedLabel={deleteEpisodeLabel(episodeTasks.length, true)}
            disabled={!removableEpisode.ok}
            reason={removableEpisode.reason}
            busy={removing}
            onConfirm={() => void removeEpisode()}
            accessibilityLabel={`Delete ${episode?.code ?? "this episode"}`}
          />
        </View>
      </View>
    </AppShell>
  );
}
