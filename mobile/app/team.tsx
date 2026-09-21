/**
 * Team — one row per approved member. Pending sign-ups never appear here;
 * they live in Requests until someone lets them in.
 */

import { useMemo } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { AppShell } from "../src/components/AppShell";
import { AppText } from "../src/components/AppText";
import { Button } from "../src/components/Button";
import { Avatar } from "../src/components/Avatar";
import { Card } from "../src/components/Card";
import { EmptyState } from "../src/components/EmptyState";
import { HeatBadge } from "../src/components/HeatBadge";
import { craftLabel } from "../src/lib/crafts";
import { useSession } from "../src/lib/auth";
import { bestChannelFor, channelLabel } from "../src/lib/channels.ts";
import { openEpisodeCodes, openTasks, tasksForMember, worstStep } from "../src/lib/completion.ts";
import { indexBy, useEpisodes, useSettings, useTasks, useTeam } from "../src/lib/data";
import { fontFamily, layout, spacing } from "../src/theme/tokens";
import { type } from "../src/theme/typography";

export default function Team() {
  const router = useRouter();
  const { isAdmin } = useSession();

  const { data: team, loading } = useTeam(isAdmin);
  const { data: tasks } = useTasks({ enabled: isAdmin });
  const { data: episodes } = useEpisodes(isAdmin);
  const { data: settings } = useSettings(isAdmin);

  const approved = useMemo(() => team.filter((m) => m.status === "approved"), [team]);
  const byEpisode = useMemo(() => indexBy(episodes, (e) => e.id), [episodes]);
  const open = useMemo(() => openTasks(tasks), [tasks]);

  return (
    <AppShell
      title="Team"
      subtitle={`${approved.length} people · ${open.length} open tasks`}
      activeTab="team"
      showFab
    >
      <View style={{ padding: spacing.screen, gap: spacing.cardsTight }}>
        {approved.length === 0 && !loading ? (
          <EmptyState
            title="No approved members yet"
            detail="Sign-ups from the Play Store land in Requests. Approve one and they appear here — or add somebody who has no app below."
          />
        ) : null}

        {/* The other way onto the team. Not everybody will install anything,
            and work assigned to nobody is work nobody chases. */}
        <Button
          label="Add someone without the app"
          variant="outline"
          onPress={() => router.push("/contact")}
          accessibilityLabel="Add someone who has not installed the app"
        />

        {approved.map((member) => {
          const mine = openTasks(tasksForMember(tasks, member.uid));
          const codes = openEpisodeCodes(tasks, member.uid, (id) => byEpisode.get(id)?.code);
          const step = worstStep(mine);

          return (
            <Card
              key={member.uid}
              onPress={() => router.push(`/person/${member.uid}`)}
              accessibilityLabel={member.name}
              style={{
                padding: 13,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.cardTight,
              }}
            >
              <Avatar name={member.name} size={layout.avatarLarge} />

              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText weight="semibold" style={type.cardTitle}>
                  {member.name}
                </AppText>
                <AppText
                  numberOfLines={1}
                  style={{
                    fontFamily: fontFamily.mono,
                    fontSize: 10.5,
                    lineHeight: 14.7,
                    color: "rgba(27,26,23,.5)",
                    marginTop: 3,
                  }}
                >
                  {`${craftLabel(member.crafts)} · ${codes.length ? codes.join(", ") : "nothing open"}`}
                </AppText>
              </View>

              <View style={{ alignItems: "flex-end", gap: 5 }}>
                {/* Tinted by their worst open step — clear if they have none. */}
                <HeatBadge
                  step={step}
                  done={mine.length === 0}
                  label={mine.length ? `${mine.length} open` : "clear"}
                />
                <AppText
                  style={{
                    fontFamily: fontFamily.mono,
                    fontSize: 9,
                    lineHeight: 9,
                    color: "rgba(27,26,23,.4)",
                  }}
                >
                  {channelLabel(bestChannelFor(member, settings))}
                </AppText>
              </View>
            </Card>
          );
        })}
      </View>
    </AppShell>
  );
}
