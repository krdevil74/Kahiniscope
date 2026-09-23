/**
 * Notify — who may do what, how reminders get out, and how hard they chase.
 *
 * Three of the four sections are the owner's alone. The security rules say so
 * independently: `settings/global` is writable only with the owner claim, and
 * the role callable refuses anything weaker. What this screen does is make
 * that legible rather than letting an admin tap a control that will be
 * rejected.
 */

import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { AppShell } from "../src/components/AppShell";
import { AppText } from "../src/components/AppText";
import { Avatar } from "../src/components/Avatar";
import { SectionCaption } from "../src/components/SectionCaption";
import { Toggle } from "../src/components/Toggle";
import { craftLabel } from "../src/lib/crafts";
import { useSession } from "../src/lib/auth";
import {
  CHANNEL_META,
  chainSentence,
  channelTags,
  planLabel,
  stepPlan,
} from "../src/lib/channel-meta.ts";
import { useSettings, useTeam } from "../src/lib/data";
import { roleToast, savePlan, saveChannel, saveQuietHours, setMemberRole } from "../src/lib/settings-actions";
import { useToast } from "../src/lib/toast";
import { colors, fontFamily, radii, spacing, MIN_TAP_TARGET, heatFor } from "../src/theme/tokens";
import { type } from "../src/theme/typography";

export default function Notify() {
  const toast = useToast();
  const { isAdmin, isOwner, user } = useSession();
  const { data: team } = useTeam(isAdmin);
  const { data: settings } = useSettings(isAdmin);
  const [busy, setBusy] = useState<string | null>(null);

  const owner = useMemo(() => team.find((m) => m.role === "owner"), [team]);
  const others = useMemo(
    () => team.filter((m) => m.status === "approved" && m.role !== "owner"),
    [team]
  );
  const tags = useMemo(() => channelTags(settings.channels), [settings.channels]);

  /** Owner-only writes, with the refusal surfaced rather than swallowed. */
  async function ownerOnly(key: string, work: () => Promise<void>, done?: string) {
    if (busy) return;
    setBusy(key);
    try {
      await work();
      if (done) toast(done);
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell title="Notifications" subtitle="Channels and escalation" activeTab="notify">
      <View style={{ padding: 16, gap: 18 }}>
        {/* ---- Admin access ------------------------------------------- */}
        <View>
          <SectionCaption style={{ marginBottom: 9 }}>Admin access</SectionCaption>

          <View
            style={{
              backgroundColor: colors.bar,
              borderRadius: radii.cardLarge,
              padding: 15,
              marginBottom: 9,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
              {/* The brand mark, not the account holder's initials. */}
              <Avatar name="Kahiniscope" initials="KS" size={34} variant="yellow" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.chips }}>
                  <AppText
                    weight="semibold"
                    style={{ fontFamily: fontFamily.semibold, fontSize: 12.5, lineHeight: 15, color: colors.white }}
                  >
                    Master admin
                  </AppText>
                  <View
                    style={{
                      backgroundColor: colors.brand,
                      borderRadius: 3,
                      paddingVertical: 4,
                      paddingHorizontal: 5,
                    }}
                  >
                    <AppText
                      style={{
                        fontFamily: fontFamily.monoSemibold,
                        fontSize: 8.5,
                        lineHeight: 9.5,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        color: colors.ink,
                      }}
                    >
                      Verified
                    </AppText>
                  </View>
                </View>
                {/* Read from the owner's own record, never from a constant in
                    this bundle — the address lives in a Cloud Function. */}
                <AppText
                  numberOfLines={1}
                  style={{
                    fontFamily: fontFamily.mono,
                    fontSize: 10.5,
                    lineHeight: 14.7,
                    color: "rgba(255,255,255,.6)",
                    marginTop: 5,
                  }}
                >
                  {owner?.email ?? (isOwner ? user?.email : null) ?? "—"}
                </AppText>
              </View>
            </View>

            <AppText
              style={{
                fontFamily: fontFamily.regular,
                fontSize: 10.5,
                lineHeight: 16.3,
                color: "rgba(255,255,255,.5)",
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: "rgba(255,255,255,.12)",
              }}
            >
              This address is fixed in the backend. Whoever signs in with it, and passes
              Google email verification, gets the admin view. It cannot be claimed or
              changed from inside the app.
            </AppText>
          </View>

          {isOwner ? (
            <View
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.hairline,
                borderRadius: radii.card,
                overflow: "hidden",
                marginBottom: 9,
              }}
            >
              {others.length === 0 ? (
                <View style={{ paddingVertical: 16, paddingHorizontal: 13 }}>
                  <AppText style={[type.bodyXSmall, { color: colors.faint }]}>
                    No approved members yet.
                  </AppText>
                </View>
              ) : null}

              {others.map((member) => {
                const isMemberAdmin = member.role === "admin";
                const nextRole = isMemberAdmin ? "member" : "admin";
                return (
                  <View
                    key={member.uid}
                    style={{
                      paddingVertical: 11,
                      paddingHorizontal: 13,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.cards,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.surfaceSunken,
                      minHeight: MIN_TAP_TARGET,
                      opacity: busy === member.uid ? 0.5 : 1,
                    }}
                  >
                    <Avatar name={member.name} size={26} variant="light" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText
                        numberOfLines={1}
                        style={{ fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 14.4 }}
                      >
                        {member.name}
                      </AppText>
                      <AppText
                        numberOfLines={1}
                        style={{
                          fontFamily: fontFamily.mono,
                          fontSize: 9.5,
                          lineHeight: 12.4,
                          color: colors.faint,
                          marginTop: 3,
                        }}
                      >
                        {isMemberAdmin
                          ? "Admin · can approve and assign"
                          : `${craftLabel(member.crafts)} · member`}
                      </AppText>
                    </View>

                    <Pressable
                      onPress={() =>
                        void ownerOnly(member.uid, async () => {
                          const name = await setMemberRole(member.uid, nextRole);
                          toast(roleToast(name, nextRole));
                        })
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${isMemberAdmin ? "Demote" : "Make admin"} ${member.name}`}
                      hitSlop={8}
                      style={{
                        borderWidth: 1,
                        borderColor: isMemberAdmin ? colors.brand : colors.hairlineStrong,
                        backgroundColor: isMemberAdmin ? colors.selectedFill : colors.surface,
                        borderRadius: 7,
                        paddingVertical: 7,
                        paddingHorizontal: 10,
                      }}
                    >
                      <AppText
                        style={{ fontFamily: fontFamily.semibold, fontSize: 10, lineHeight: 11 }}
                      >
                        {isMemberAdmin ? "Demote" : "Make admin"}
                      </AppText>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}

          <AppText
            style={{
              fontFamily: fontFamily.regular,
              fontSize: 10.5,
              lineHeight: 16.3,
              color: colors.faint,
            }}
          >
            Admins can approve registrations, assign tasks and nudge. Only the master
            admin can promote, demote, or edit the escalation ladder.
          </AppText>
        </View>

        {/* ---- Delivery channels -------------------------------------- */}
        <View>
          <SectionCaption style={{ marginBottom: 9 }}>Delivery channels</SectionCaption>

          <View style={{ gap: spacing.cardsTight }}>
            {CHANNEL_META.map((channel) => {
              const on = settings.channels[channel.id] !== false;
              const tag = tags[channel.id];
              return (
                <View
                  key={channel.id}
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.hairline,
                    borderRadius: radii.card,
                    padding: 13,
                    opacity: busy === channel.id ? 0.5 : 1,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.chips }}>
                        <AppText
                          weight="semibold"
                          style={{ fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 15.6 }}
                        >
                          {channel.name}
                        </AppText>
                        <View
                          style={{
                            borderRadius: 3,
                            paddingVertical: 4,
                            paddingHorizontal: 5,
                            backgroundColor: on ? colors.heatSoft : colors.surfaceSunken,
                          }}
                        >
                          <AppText
                            style={{
                              fontFamily: fontFamily.monoSemibold,
                              fontSize: 8.5,
                              lineHeight: 9.5,
                              letterSpacing: 0.6,
                              textTransform: "uppercase",
                              color: on ? colors.heat : colors.muted,
                            }}
                          >
                            {tag}
                          </AppText>
                        </View>
                      </View>
                      <AppText
                        style={{
                          fontFamily: fontFamily.mono,
                          fontSize: 10.5,
                          lineHeight: 15.2,
                          // A channel that bills says so in the colour the
                          // rest of the app uses for things going wrong.
                          color: channel.free ? colors.faint : colors.danger,
                          marginTop: 5,
                        }}
                      >
                        {channel.limit}
                      </AppText>
                    </View>

                    <Toggle
                      value={on}
                      disabled={!isOwner}
                      accessibilityLabel={`${channel.name}, ${on ? "on" : "off"}`}
                      onChange={(next) =>
                        void ownerOnly(channel.id, () => saveChannel(channel.id, next))
                      }
                    />
                  </View>

                  {on ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 11,
                        paddingTop: 11,
                        borderTopWidth: 1,
                        borderTopColor: colors.fill,
                      }}
                    >
                      <AppText
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontFamily: fontFamily.mono,
                          fontSize: 10,
                          lineHeight: 14,
                          color: colors.muted,
                        }}
                      >
                        {channel.endpoint}
                      </AppText>
                      <Pressable
                        // Sending is build-order step 8. The button is drawn
                        // because the design draws it, and says plainly that
                        // there is nothing behind it yet rather than
                        // pretending a message went out.
                        onPress={() =>
                          toast("Test send arrives with the channel chain — build-order step 8.")
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Test send over ${channel.name}`}
                        hitSlop={8}
                        style={{
                          borderWidth: 1,
                          borderColor: colors.hairlineStrong,
                          borderRadius: 7,
                          paddingVertical: 8,
                          paddingHorizontal: 11,
                          opacity: 0.6,
                        }}
                      >
                        <AppText
                          style={{ fontFamily: fontFamily.semibold, fontSize: 10.5, lineHeight: 11 }}
                        >
                          Test send
                        </AppText>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          <AppText
            style={{
              fontFamily: fontFamily.regular,
              fontSize: 10.5,
              lineHeight: 16.3,
              color: colors.faint,
              marginTop: 9,
            }}
          >
            {chainSentence(settings.channels)}
          </AppText>
        </View>

        {/* ---- Escalation schedule ------------------------------------ */}
        {isOwner ? (
          <View>
            <SectionCaption style={{ marginBottom: 9 }}>Escalation schedule</SectionCaption>

            <View
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.hairline,
                borderRadius: radii.card,
                paddingVertical: 6,
                paddingHorizontal: spacing.card,
              }}
            >
              {settings.plan.map((days, index) => (
                <View
                  key={index}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 11,
                    paddingVertical: 11,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.page,
                    minHeight: MIN_TAP_TARGET,
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: radii.pill,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: heatFor(index).fg,
                    }}
                  >
                    <AppText
                      style={{
                        fontFamily: fontFamily.monoSemibold,
                        fontSize: 9,
                        lineHeight: 10,
                        color: colors.white,
                      }}
                    >
                      {String(index + 1)}
                    </AppText>
                  </View>

                  <AppText
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: fontFamily.medium,
                      fontSize: 12,
                      lineHeight: 15.6,
                    }}
                  >
                    {planLabel(index)}
                  </AppText>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                    <PlanStep
                      label="−"
                      accessibilityLabel={`${planLabel(index)}, one day fewer`}
                      disabled={days <= 1}
                      onPress={() =>
                        void ownerOnly("plan", () => savePlan(stepPlan(settings.plan, index, -1)))
                      }
                    />
                    <AppText
                      style={{
                        width: 34,
                        textAlign: "center",
                        fontFamily: fontFamily.monoSemibold,
                        fontSize: 14,
                        lineHeight: 15,
                      }}
                    >
                      {`${days}d`}
                    </AppText>
                    <PlanStep
                      label="+"
                      accessibilityLabel={`${planLabel(index)}, one day more`}
                      onPress={() =>
                        void ownerOnly("plan", () => savePlan(stepPlan(settings.plan, index, 1)))
                      }
                    />
                  </View>
                </View>
              ))}

              <AppText
                style={{
                  paddingVertical: 11,
                  fontFamily: fontFamily.mono,
                  fontSize: 10.5,
                  lineHeight: 15.75,
                  color: colors.faint,
                }}
              >
                {`After step ${settings.plan.length} the reminder repeats ${
                  settings.plan[settings.plan.length - 1] === 1
                    ? "daily"
                    : `every ${settings.plan[settings.plan.length - 1]} days`
                } until the task is marked done.`}
              </AppText>
            </View>
          </View>
        ) : null}

        {/* ---- Quiet hours -------------------------------------------- */}
        <View>
          <SectionCaption style={{ marginBottom: 9 }}>Quiet hours</SectionCaption>
          <View
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.hairline,
              borderRadius: radii.card,
              padding: spacing.card,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.cardTight,
              opacity: busy === "quiet" ? 0.5 : 1,
            }}
          >
            <AppText
              style={{
                flex: 1,
                fontFamily: fontFamily.regular,
                fontSize: 11.5,
                lineHeight: 16.1,
                color: colors.muted,
              }}
            >
              {`No reminders between ${hour(settings.quietHours.from)} and ${hour(
                settings.quietHours.to
              )}. Queued sends go out at ${hour(settings.quietHours.sendQueuedAt)}.`}
            </AppText>
            <Toggle
              value={settings.quietHours.enabled}
              disabled={!isOwner}
              accessibilityLabel={`Quiet hours, ${settings.quietHours.enabled ? "on" : "off"}`}
              onChange={(next) =>
                void ownerOnly("quiet", () => saveQuietHours({ enabled: next }))
              }
            />
          </View>
        </View>

        {!isOwner ? (
          <AppText
            style={{
              fontFamily: fontFamily.regular,
              fontSize: 10.5,
              lineHeight: 16.3,
              color: colors.faint,
            }}
          >
            These settings are the master admin's. You can see what they are set to; only
            that account can change them.
          </AppText>
        ) : null}
      </View>
    </AppShell>
  );
}

/** "10pm", "8am", "9am" — the way the design writes the quiet window. */
function hour(value: number): string {
  const h = ((Math.trunc(value) % 24) + 24) % 24;
  if (h === 0) return "midnight";
  if (h === 12) return "noon";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function PlanStep({
  label,
  onPress,
  accessibilityLabel,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={9}
      style={({ pressed }) => ({
        width: 26,
        height: 26,
        borderRadius: 7,
        backgroundColor: pressed ? colors.gutter : colors.fill,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <AppText style={{ fontFamily: fontFamily.monoSemibold, fontSize: 13, lineHeight: 14 }}>
        {label}
      </AppText>
    </Pressable>
  );
}
