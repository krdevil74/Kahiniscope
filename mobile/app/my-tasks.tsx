/**
 * The member's app: everything waiting on them, and one button per task.
 *
 * A member sees only their own work. That is not a filter applied here — the
 * security rules reject any query that does not ask for their own slice, so
 * this screen is asking for the only thing it is allowed to have.
 *
 * The other half of the member app is app/pending.tsx: the registration form
 * and the holding screen. Which of the two a person sees is decided by the
 * claim on their token, in app/index.tsx.
 */

import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "../src/components/AppText";
import { Card } from "../src/components/Card";
import { HeatBadge } from "../src/components/HeatBadge";
import { ProgressBar } from "../src/components/ProgressBar";
import { useSession } from "../src/lib/auth";
import { doneToast, setTaskDone } from "../src/lib/actions";
import { memberChainSentence } from "../src/lib/channel-meta.ts";
import { connectTelegram } from "../src/lib/telegram-link";
import { byDueDate } from "../src/lib/completion.ts";
import { indexBy, useEpisodes, useNow, useSettings, useTasks } from "../src/lib/data";
import { memberNote } from "../src/lib/escalation.ts";
import { boardDateLabel } from "../src/lib/format.ts";
import type { Task } from "../src/lib/model";
import { useToast } from "../src/lib/toast";
import { colors, fontFamily, heatFor, layout, radii, spacing, MIN_TAP_TARGET } from "../src/theme/tokens";
import { type } from "../src/theme/typography";

export default function MyTasks() {
  const toast = useToast();
  const now = useNow();
  const { user, profile, isApproved, isAdmin, loading, signOut } = useSession();

  // Signing out happens on this screen, so this screen has to answer for it:
  // the layout's guard would too, one tick later, but a dashboard that draws
  // even once for somebody with no session is a dashboard showing somebody
  // else's work.
  if (!loading && !user) return <Redirect href="/sign-in" />;
  // Admins have the board; this screen is the member's.
  if (!loading && isAdmin) return <Redirect href="/board" />;
  if (!loading && user && !isApproved) return <Redirect href="/pending" />;

  return (
    <MemberDashboard
      uid={user?.uid ?? ""}
      telegramConnected={Boolean(profile?.telegramChatId)}
      approved={isApproved}
      now={now}
      onToast={toast}
      onSignOut={signOut}
    />
  );
}

function MemberDashboard({
  uid,
  telegramConnected,
  approved,
  now,
  onToast,
  onSignOut,
}: {
  uid: string;
  telegramConnected: boolean;
  approved: boolean;
  now: Date;
  onToast: (message: string) => void;
  onSignOut: () => Promise<void>;
}) {
  // Their own slice, which is the only query the rules will accept from them.
  const { data: tasks } = useTasks({ assigneeUid: uid, enabled: approved && Boolean(uid) });
  const { data: episodes } = useEpisodes(approved);
  const { data: settings } = useSettings(approved);
  const insets = useSafeAreaInsets();

  const byEpisode = useMemo(() => indexBy(episodes, (e) => e.id), [episodes]);
  const ordered = useMemo(() => byDueDate(tasks, now), [tasks, now]);
  const open = useMemo(() => tasks.filter((t) => !t.done).length, [tasks]);

  async function toggle(task: Task) {
    await setTaskDone(task, !task.done);
    onToast(doneToast(task.type, !task.done));
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceAlt }}>
      {/* The member's header is yellow, not ink — this is their app, not the
          admin's. */}
      <View
        style={{
          backgroundColor: colors.brandYellow,
          // The prototype's 60px was its iOS frame's notch. On Android,
          // edge to edge, the device says how much room the status bar needs.
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          paddingBottom: 16,
        }}
      >
        <AppText
          style={{ fontFamily: fontFamily.mono, fontSize: 11, lineHeight: 12, color: "rgba(27,26,23,.6)" }}
        >
          {boardDateLabel(now)}
        </AppText>
        <AppText
          weight="semibold"
          style={{ fontFamily: fontFamily.semibold, fontSize: 24, lineHeight: 27.6, marginTop: 6 }}
        >
          {open ? `${open} task${open === 1 ? "" : "s"} waiting on you` : "All clear"}
        </AppText>
        <AppText
          style={{
            fontFamily: fontFamily.regular,
            fontSize: 12,
            lineHeight: 16.8,
            color: "rgba(27,26,23,.65)",
            marginTop: 6,
          }}
        >
          {open
            ? "Mark each one done and the reminders stop."
            : "Nothing assigned to you right now. The admin will send it here."}
        </AppText>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.screen, paddingBottom: 40, gap: 9 }}
        showsVerticalScrollIndicator={false}
      >
        {ordered.map((task) => {
          const episode = byEpisode.get(task.episodeId);
          const heat = heatFor(task.remindersSent);
          return (
            <Card key={task.id} clip radius={radii.cardLarge}>
              {/* The heat bar in the member's own colours: how hard they are
                  about to be chased. */}
              <ProgressBar
                value={task.done ? 1 : heat.bar}
                height={layout.memberTaskBar}
                fill={task.done ? colors.successFg : heat.fg}
                track={colors.hairline}
                rounded={false}
              />

              <View style={{ padding: spacing.card }}>
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
                      lineHeight: 11,
                      color: colors.yellowDeep,
                    }}
                  >
                    {episode?.code ?? "—"}
                  </AppText>
                  <HeatBadge step={task.remindersSent} done={task.done} />
                </View>

                <AppText
                  weight="semibold"
                  style={{
                    fontFamily: fontFamily.semibold,
                    fontSize: 17,
                    lineHeight: 21.25,
                    marginTop: 8,
                    marginBottom: 4,
                    color: task.done ? "rgba(27,26,23,.4)" : colors.ink,
                    textDecorationLine: task.done ? "line-through" : "none",
                  }}
                >
                  {task.type}
                </AppText>

                {/* Bengali title: AppText gives it Noto Sans Bengali. */}
                <AppText
                  style={{
                    fontFamily: fontFamily.regular,
                    fontSize: 12,
                    lineHeight: 16.8,
                    color: "rgba(27,26,23,.55)",
                  }}
                >
                  {episode?.title ?? ""}
                </AppText>

                <View
                  style={{
                    backgroundColor: colors.surfaceAlt,
                    borderRadius: radii.chipLarge,
                    paddingVertical: 9,
                    paddingHorizontal: 11,
                    marginTop: 12,
                  }}
                >
                  <AppText
                    style={{
                      fontFamily: fontFamily.monoMedium,
                      fontSize: 10.5,
                      lineHeight: 14.2,
                      color: colors.ink,
                    }}
                  >
                    {memberNote(task, settings.plan, now)}
                  </AppText>
                </View>

                <MarkDone done={task.done} onPress={() => void toggle(task)} taskType={task.type} />
              </View>
            </Card>
          );
        })}

        {!telegramConnected ? (
          <ConnectTelegram onToast={onToast} />
        ) : null}

        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: colors.hairlineStronger,
            borderRadius: radii.cardLarge,
            padding: 16,
          }}
        >
          <AppText
            style={{
              fontFamily: fontFamily.regular,
              fontSize: 11,
              lineHeight: 17.6,
              color: "rgba(27,26,23,.5)",
              textAlign: "center",
            }}
          >
            {`${memberChainSentence(settings.channels)} Marking a task done stops them immediately.`}
          </AppText>
        </View>

        <AppText
          onPress={() => void onSignOut()}
          style={[type.meta, { color: colors.yellowDeep, textAlign: "center", padding: spacing.card }]}
        >
          Sign out
        </AppText>
      </ScrollView>
    </View>
  );
}

/**
 * Telegram is the channel that lets a task be closed from the chat, so it is
 * worth asking for once. Shown only until it is connected.
 */
function ConnectTelegram({ onToast }: { onToast: (message: string) => void }) {
  const [busy, setBusy] = useState(false);

  return (
    <Pressable
      disabled={busy}
      onPress={async () => {
        setBusy(true);
        try {
          await connectTelegram();
        } catch (err) {
          onToast(err instanceof Error ? err.message : "Could not open Telegram.");
        } finally {
          setBusy(false);
        }
      }}
      accessibilityRole="button"
      accessibilityLabel="Connect Telegram"
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.selectedFill : colors.surface,
        borderWidth: 1,
        borderColor: colors.hairline,
        borderRadius: radii.cardLarge,
        padding: spacing.card,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.cardTight,
        minHeight: MIN_TAP_TARGET,
        opacity: busy ? 0.6 : 1,
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText
          weight="semibold"
          style={{ fontFamily: fontFamily.semibold, fontSize: 12.5, lineHeight: 15 }}
        >
          Connect Telegram
        </AppText>
        <AppText
          style={{
            fontFamily: fontFamily.regular,
            fontSize: 11,
            lineHeight: 15.4,
            color: "rgba(27,26,23,.55)",
            marginTop: 3,
          }}
        >
          Reminders arrive in your chat, and you can close a task from the message
          without opening the app.
        </AppText>
      </View>
      <AppText
        style={{ fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 16, color: colors.yellowDeep }}
      >
        →
      </AppText>
    </Pressable>
  );
}

/**
 * The one control a member has. Ink with yellow text while there is work to
 * do; outlined once it is closed, so reopening is possible but never the
 * obvious thing to tap.
 */
function MarkDone({
  done,
  onPress,
  taskType,
}: {
  done: boolean;
  onPress: () => void;
  taskType: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={done ? `Reopen ${taskType}` : `Mark ${taskType} done`}
      android_ripple={{ color: done ? "rgba(27,26,23,.08)" : "rgba(255,194,10,.2)" }}
      style={({ pressed }) => ({
        marginTop: 11,
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        minHeight: MIN_TAP_TARGET,
        backgroundColor: done ? colors.surface : pressed ? "#332f28" : colors.ink,
        borderWidth: 1,
        borderColor: done ? colors.hairlineStronger : colors.ink,
      })}
    >
      <AppText
        style={{
          fontFamily: fontFamily.semibold,
          fontSize: 13,
          lineHeight: 14,
          color: done ? "rgba(27,26,23,.6)" : colors.brandYellow,
        }}
      >
        {done ? "Reopen task" : "Mark done"}
      </AppText>
    </Pressable>
  );
}
