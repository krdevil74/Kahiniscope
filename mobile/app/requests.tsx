/**
 * Access requests — the approval queue.
 *
 * Anyone can install the app from the Play Store and sign in. Until an admin
 * approves them they see a holding screen, cannot be assigned work, and can
 * read nothing but their own record. This is where that gate is worked.
 */

import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";

import { AppShell } from "../src/components/AppShell";
import { AppText } from "../src/components/AppText";
import { Avatar } from "../src/components/Avatar";
import { Button } from "../src/components/Button";
import { SectionCaption } from "../src/components/SectionCaption";
import { approveLabel, craftLabel } from "../src/lib/crafts";
import { approveAndLinkContact } from "../src/lib/contact-actions.ts";
import { contactMatchNote, linkedToast, matchingContactFor } from "../src/lib/contacts.ts";
import { useSession } from "../src/lib/auth";
import { useNow, useTasks, useTeam } from "../src/lib/data";
import { firstName, maskPhone, relativeTime } from "../src/lib/format.ts";
import type { TeamMember } from "../src/lib/model";
import {
  approveRegistration,
  approvedToast,
  declineRegistration,
  declinedToast,
  revokeAccess,
  revokedToast,
} from "../src/lib/registrations";
import { useToast } from "../src/lib/toast";
import { colors, fontFamily, radii, spacing, MIN_TAP_TARGET } from "../src/theme/tokens";
import { type } from "../src/theme/typography";

export default function Requests() {
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const { isAdmin, user } = useSession();
  const { data: team } = useTeam(isAdmin);
  // Only to say how much work would move with a merge — worth a sentence
  // before somebody presses the button that moves it.
  const { data: tasks } = useTasks({ enabled: isAdmin });

  const contactFor = (applicant: TeamMember) => matchingContactFor(applicant, team);
  const openTasksFor = (uid: string) =>
    tasks.filter((task) => task.assigneeUid === uid && !task.done).length;

  /** uids with a request in flight, so a double tap cannot double-fire. */
  const [busy, setBusy] = useState<string[]>([]);

  const pending = useMemo(
    () =>
      team
        .filter((m) => m.status === "pending")
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)),
    [team]
  );
  const approved = useMemo(
    () => team.filter((m) => m.status === "approved" && m.uid !== user?.uid),
    [team, user]
  );

  async function run(member: TeamMember, work: () => Promise<void>, message: string) {
    if (busy.includes(member.uid)) return;
    setBusy((b) => [...b, member.uid]);
    try {
      await work();
      toast(message);
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not work. Try again.");
    } finally {
      setBusy((b) => b.filter((uid) => uid !== member.uid));
    }
  }

  /**
   * Approve, and merge the contact record the admin was already using for
   * this person: their tasks move to the real account in the same commit.
   */
  async function approveAndLink(member: TeamMember, contact: TeamMember) {
    if (busy.includes(member.uid)) return;
    setBusy((b) => [...b, member.uid]);
    try {
      const { tasks } = await approveAndLinkContact(member.uid, contact.uid);
      toast(linkedToast(member.name, tasks));
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not work. Try again.");
    } finally {
      setBusy((b) => b.filter((uid) => uid !== member.uid));
    }
  }

  return (
    <AppShell
      title="Access requests"
      subtitle={`${pending.length} waiting for approval`}
      activeTab="board"
      onBack={() => router.back()}
    >
      <View style={{ padding: spacing.screen, gap: spacing.cards }}>
        <AppText
          style={{
            fontFamily: fontFamily.regular,
            fontSize: 11,
            lineHeight: 17.05,
            color: colors.muted,
            paddingHorizontal: 2,
            paddingBottom: 2,
          }}
        >
          Anyone can install the app and register. Until you approve them they see a
          holding screen and cannot be assigned work.
        </AppText>

        {pending.map((member) => (
          <View
            key={member.uid}
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.hairline,
              borderRadius: radii.cardLarge,
              padding: spacing.card,
              opacity: busy.includes(member.uid) ? 0.55 : 1,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 11 }}>
              {/* Light avatar: they are not part of the team yet. */}
              <Avatar name={member.name} size={36} variant="light" />

              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText
                  weight="semibold"
                  style={{ fontFamily: fontFamily.semibold, fontSize: 14, lineHeight: 16.8 }}
                >
                  {member.name}
                </AppText>
                <AppText
                  style={{
                    fontFamily: fontFamily.mono,
                    fontSize: 10.5,
                    lineHeight: 15.75,
                    color: colors.faint,
                    marginTop: 4,
                  }}
                >
                  {`${maskPhone(member.phone)} · registered ${relativeTime(member.createdAt, now)}`}
                </AppText>
              </View>

              <View
                style={{
                  backgroundColor: "#fff4d6",
                  borderRadius: 3,
                  paddingVertical: 5,
                  paddingHorizontal: 6,
                }}
              >
                <AppText
                  style={{
                    fontFamily: fontFamily.monoSemibold,
                    fontSize: 9,
                    lineHeight: 10,
                    letterSpacing: 0.63,
                    textTransform: "uppercase",
                    color: "#8a6400",
                  }}
                >
                  Pending
                </AppText>
              </View>
            </View>

            {/* The applicant's own words, as they typed them. */}
            <View
              style={{
                backgroundColor: colors.surfaceSunken,
                borderRadius: radii.chipLarge,
                paddingVertical: 10,
                paddingHorizontal: 11,
                marginTop: 11,
              }}
            >
              <AppText
                style={{
                  fontFamily: fontFamily.regular,
                  fontSize: 11,
                  lineHeight: 16.5,
                  color: colors.muted,
                }}
              >
                {member.note?.trim()
                  ? `“${member.note.trim()}”`
                  : "No note — they signed in and left the form blank."}
              </AppText>
            </View>

            {/* Somebody who was already doing the work, finally installing
                the app. Approving them as a new person would leave their
                tasks on a record nobody can reach. */}
            {contactFor(member) ? (
              <View
                style={{
                  backgroundColor: colors.bar,
                  borderRadius: radii.chipLarge,
                  paddingVertical: 11,
                  paddingHorizontal: 12,
                  marginTop: 11,
                  gap: 9,
                }}
              >
                <AppText
                  style={{
                    fontFamily: fontFamily.regular,
                    fontSize: 11,
                    lineHeight: 16.5,
                    color: "rgba(255,255,255,.82)",
                  }}
                >
                  {contactMatchNote(
                    contactFor(member)!.name,
                    openTasksFor(contactFor(member)!.uid)
                  )}
                </AppText>
                <Button
                  label={`Approve & link to ${firstName(contactFor(member)!.name)}`}
                  radius={radii.cardSmall}
                  disabled={busy.includes(member.uid)}
                  onPress={() => void approveAndLink(member, contactFor(member)!)}
                  accessibilityLabel={`Approve ${member.name} and merge the contact record for ${contactFor(member)!.name}`}
                />
              </View>
            ) : null}

            <View style={{ flexDirection: "row", gap: spacing.chips, marginTop: 11 }}>
              <Button
                label="Decline"
                variant="quiet"
                radius={radii.cardSmall}
                onPress={() =>
                  void run(member, () => declineRegistration(member), declinedToast(member.name))
                }
                style={{ flex: 1, borderColor: colors.hairlineStrong }}
                accessibilityLabel={`Decline ${member.name}`}
              />
              <Button
                // The craft is what the admin is agreeing to, so it is on the
                // button rather than buried in the card.
                label={
                  matchingContactFor(member, team)
                    ? "Approve as a new person"
                    : approveLabel(member.crafts)
                }
                radius={radii.cardSmall}
                onPress={() =>
                  void run(
                    member,
                    () => approveRegistration(member),
                    approvedToast(member.name, member.crafts)
                  )
                }
                style={{ flex: 2 }}
                accessibilityLabel={`Approve ${member.name}`}
              />
            </View>
          </View>
        ))}

        {pending.length === 0 ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: colors.hairlineStronger,
              borderRadius: radii.cardLarge,
              paddingVertical: 26,
              paddingHorizontal: 18,
            }}
          >
            <AppText
              style={{
                fontFamily: fontFamily.regular,
                fontSize: 11.5,
                lineHeight: 18.4,
                color: colors.faint,
                textAlign: "center",
              }}
            >
              No pending registrations. New sign-ups from the Play Store land here.
            </AppText>
          </View>
        ) : null}

        <SectionCaption style={{ marginTop: 8 }}>Approved accounts</SectionCaption>

        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.hairline,
            borderRadius: radii.card,
            overflow: "hidden",
          }}
        >
          {approved.length === 0 ? (
            <View style={{ paddingVertical: 16, paddingHorizontal: 13 }}>
              <AppText style={[type.bodyXSmall, { color: colors.faint }]}>
                Nobody approved yet.
              </AppText>
            </View>
          ) : null}

          {approved.map((member) => (
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
                opacity: busy.includes(member.uid) ? 0.55 : 1,
              }}
            >
              <Avatar name={member.name} size={24} />
              <AppText
                numberOfLines={1}
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: fontFamily.medium,
                  fontSize: 12,
                  lineHeight: 14.4,
                }}
              >
                {member.name}
              </AppText>
              <AppText
                style={{
                  fontFamily: fontFamily.mono,
                  fontSize: 10,
                  lineHeight: 10,
                  color: colors.faint,
                }}
              >
                {member.role === "owner" || member.role === "admin" ? member.role : craftLabel(member.crafts)}
              </AppText>

              <Pressable
                onPress={() =>
                  void run(member, () => revokeAccess(member), revokedToast(member.name))
                }
                accessibilityRole="button"
                accessibilityLabel={`Revoke ${member.name}`}
                hitSlop={10}
                disabled={member.role === "owner"}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: pressed ? "#f4b4b0" : "#eae4d8",
                  borderRadius: radii.chip,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  opacity: member.role === "owner" ? 0.35 : 1,
                })}
              >
                <AppText
                  style={{
                    fontFamily: fontFamily.medium,
                    fontSize: 10,
                    lineHeight: 10,
                    color: colors.faint,
                  }}
                >
                  Revoke
                </AppText>
              </Pressable>
            </View>
          ))}
        </View>
      </View>
    </AppShell>
  );
}
