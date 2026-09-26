/**
 * The holding screen, and the form that gets you onto it.
 *
 * A Google sign-in gives us a name and an address and nothing else, but the
 * admin approving the registration needs to know what this person does and
 * how to reach them — the queue says "Approve as Voice", not "Approve". So a
 * new account fills that in first; afterwards it waits.
 *
 * Both states are this one screen because the transition between them is the
 * product: the admin taps Approve, the claim is re-minted, the snapshot on
 * the member's own user document fires, and this screen gives way to their
 * dashboard without anybody signing out.
 */

import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { Redirect } from "expo-router";

import { AppText } from "../src/components/AppText";
import { Button } from "../src/components/Button";
import { Logo } from "../src/components/Logo";
import { SectionCaption } from "../src/components/SectionCaption";
import { useSession } from "../src/lib/auth";
import { craftLabel, MAX_CRAFTS, toggleCraft } from "../src/lib/crafts";
import { CRAFTS } from "../src/lib/model";
import { normalisePhone } from "../src/lib/phone.ts";
import { PhoneField } from "../src/components/PhoneField";
import { submitRegistration } from "../src/lib/registrations";
import { MAX_NAME, isNameValid } from "../src/lib/format.ts";
import { useToast } from "../src/lib/toast";
import { colors, fontFamily, layout, radii, spacing } from "../src/theme/tokens";
import { type } from "../src/theme/typography";

export default function Pending() {
  const { profile, user, signOut, loading, isApproved, isAdmin } = useSession();

  // The approval re-mints the claim and the snapshot above fires, but a
  // route does not leave itself — this is what makes the holding screen give
  // way to the dashboard without anybody signing out.
  if (!loading && !user) return <Redirect href="/sign-in" />;
  if (!loading && isApproved) return <Redirect href={isAdmin ? "/board" : "/summary"} />;

  // The form is done once a craft is on the record — that is the field the
  // approval queue reads.
  const registered = (profile?.crafts?.length ?? 0) > 0;

  if (!profile) return <Waiting crafts={[]} />;
  return registered ? <Waiting crafts={profile.crafts} /> : <RegistrationForm uid={profile.uid} name={profile.name} email={user?.email ?? ""} onSignOut={signOut} />;
}

// ---------------------------------------------------------------------------

function Waiting({ crafts }: { crafts: string[] }) {
  const { refresh } = useSession();
  const [checking, setChecking] = useState(false);

  /**
   * The way out when the automatic catch-up did not manage it.
   *
   * The session provider re-checks by itself for about half a minute after
   * the record changes, which covers a slow trigger. Past that, something is
   * wrong that waiting will not fix — and a screen that says "waiting" with
   * no way to ask again is a screen people close the app on.
   */
  async function check() {
    if (checking) return;
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 34,
        backgroundColor: colors.surfaceAlt,
      }}
      refreshControl={
        <RefreshControl
          refreshing={checking}
          onRefresh={() => void check()}
          tintColor={colors.ink}
          colors={[colors.ink]}
        />
      }
    >
      <Logo size={layout.pendingLogo} />

      <AppText
        weight="semibold"
        style={{
          fontFamily: fontFamily.semibold,
          fontSize: 20,
          lineHeight: 26,
          color: colors.ink,
          marginTop: 22,
          textAlign: "center",
        }}
      >
        Waiting for approval
      </AppText>

      <AppText
        style={{
          fontFamily: fontFamily.regular,
          fontSize: 12.5,
          lineHeight: 20.6,
          color: colors.muted,
          marginTop: 10,
          textAlign: "center",
        }}
      >
        Your registration has gone to the Kahiniscope admin. You will see your
        dashboard here as soon as it is approved.
      </AppText>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 9,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.hairline,
          borderRadius: radii.pill,
          paddingVertical: 9,
          paddingHorizontal: 15,
          marginTop: 22,
        }}
      >
        <View style={{ width: 7, height: 7, borderRadius: radii.pill, backgroundColor: colors.brand }} />
        <AppText
          style={{ fontFamily: fontFamily.monoMedium, fontSize: 10.5, lineHeight: 12, color: colors.ink }}
        >
          {`Registered as ${crafts.length ? craftLabel(crafts) : "member"} · pending`}
        </AppText>
      </View>

      <AppText
        style={{
          fontFamily: fontFamily.mono,
          fontSize: 10.5,
          lineHeight: 16.8,
          color: colors.faint,
          marginTop: 26,
          textAlign: "center",
        }}
      >
        We will message you on WhatsApp the moment it is approved. This screen
        moves on by itself — pull down if you want to check now.
      </AppText>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------

function RegistrationForm({
  uid,
  name,
  email,
  onSignOut,
}: {
  uid: string;
  name: string;
  email: string;
  onSignOut: () => Promise<void>;
}) {
  const toast = useToast();
  // Prefilled from the Google account, because it is usually right and
  // retyping it would be busywork — but editable, because it is often not
  // what this person is called on the team. Whatever is here is the name the
  // admin sees on every screen from now on.
  const [ownName, setOwnName] = useState(name);
  const [crafts, setCrafts] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // E.164, which is what the messaging channels need. Kept loose enough that
  // a Bangladeshi number typed the local way is accepted and normalised.
  const normalisedPhone = useMemo(() => normalisePhone(phone), [phone]);
  const phoneValid = normalisedPhone !== null;
  const nameValid = isNameValid(ownName);
  const canSubmit = nameValid && crafts.length > 0 && phoneValid && !busy;

  async function submit() {
    if (!canSubmit || crafts.length === 0 || !normalisedPhone) return;
    setBusy(true);
    try {
      await submitRegistration(uid, {
        name: ownName,
        phone: normalisedPhone,
        crafts,
        note: note.trim(),
      });
      // No navigation: the snapshot on our own document brings the holding
      // screen in by itself.
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{
        padding: spacing.screen,
        paddingTop: 40,
        paddingBottom: 40,
        gap: spacing.cards,
        backgroundColor: colors.surfaceAlt,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ alignItems: "center", gap: spacing.cardTight, marginBottom: 4 }}>
        <Logo size={56} />
        <AppText weight="semibold" style={[type.h2, { textAlign: "center" }]}>
          {`Welcome, ${ownName.trim().split(/\s+/)[0] || "there"}`}
        </AppText>
        <AppText
          style={[type.bodySmall, { color: colors.muted, textAlign: "center" }]}
        >
          Tell the admin what you do and how to reach you. They approve
          registrations by hand.
        </AppText>
      </View>

      <View style={{ gap: spacing.chips }}>
        <SectionCaption>Your name</SectionCaption>
        <AppText style={[type.bodySmall, { color: colors.faint, marginTop: -4 }]}>
          This is what the admin sees when they assign you work.
        </AppText>
        <TextInput
          value={ownName}
          onChangeText={(next: string) => setOwnName(next.slice(0, MAX_NAME))}
          placeholder="Your name"
          placeholderTextColor={colors.faint}
          autoCapitalize="words"
          autoCorrect={false}
          accessibilityLabel="Your name, as the admin will see it"
          style={{
            borderWidth: 1,
            borderColor: colors.hairlineStrong,
            borderRadius: radii.chipLarge,
            paddingVertical: 12,
            paddingHorizontal: 13,
            fontFamily: fontFamily.medium,
            fontSize: 14,
            color: colors.ink,
            backgroundColor: colors.surface,
          }}
        />
      </View>

      <View style={{ gap: spacing.chips }}>
        <SectionCaption>What you do</SectionCaption>
        {/* Several are allowed: one person is rarely one thing. */}
        <AppText style={[type.bodySmall, { color: colors.faint, marginTop: -4 }]}>
          Pick everything you do — up to {MAX_CRAFTS}.
        </AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.chipsTight }}>
          {CRAFTS.map((option) => {
            const on = crafts.includes(option);
            return (
              <Pressable
                key={option}
                onPress={() => setCrafts((c) => toggleCraft(c, option))}
                accessibilityRole="checkbox"
                accessibilityState={{ selected: on }}
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 13,
                  borderRadius: radii.pill,
                  borderWidth: 1,
                  borderColor: on ? colors.ink : colors.hairlineStronger,
                  backgroundColor: on ? colors.ink : "transparent",
                  minHeight: 36,
                  justifyContent: "center",
                }}
              >
                <AppText
                  style={{
                    fontFamily: fontFamily.medium,
                    fontSize: 11,
                    lineHeight: 13,
                    color: on ? colors.white : colors.muted,
                  }}
                >
                  {option}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: spacing.chips }}>
        <SectionCaption>Phone</SectionCaption>
        <PhoneField
          value={phone}
          onChange={setPhone}
          invalid={Boolean(phone) && !phoneValid}
          accessibilityLabel="Your phone number, ten digits"
        />
        <AppText
          style={[
            type.metaXSmall,
            { color: phone && !phoneValid ? colors.danger : colors.faint },
          ]}
        >
          {phone && !phoneValid
            ? "Ten digits, starting 6, 7, 8 or 9."
            : "Reminders fall back to WhatsApp and SMS on this number."}
        </AppText>
      </View>

      <View style={{ gap: spacing.chips }}>
        <SectionCaption>Anything the admin should know</SectionCaption>
        <TextInput
          value={note}
          onChangeText={(next) => setNote(next.slice(0, 500))}
          placeholder="Which episodes you have worked on, what else you can cover…"
          placeholderTextColor={colors.faint}
          multiline
          numberOfLines={4}
          maxLength={500}
          accessibilityLabel="A note for the admin"
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.hairlineStrong,
            borderRadius: radii.chipLarge,
            padding: 13,
            minHeight: 96,
            textAlignVertical: "top",
            fontFamily: fontFamily.regular,
            fontSize: 12.5,
            lineHeight: 18,
            color: colors.ink,
          }}
        />
        <AppText style={[type.metaXSmall, { color: colors.faint }]}>
          {`${note.length}/500 · shown on your card in the approval queue`}
        </AppText>
      </View>

      <Button
        label={busy ? "Sending…" : "Send for approval"}
        size="large"
        disabled={!canSubmit}
        onPress={() => void submit()}
        style={{ marginTop: 4 }}
      />

      <AppText
        onPress={() => void onSignOut()}
        style={[type.meta, { color: colors.yellowDeep, textAlign: "center", padding: spacing.cardTight }]}
      >
        {`Signed in as ${email} · sign out`}
      </AppText>
    </ScrollView>
  );
}
