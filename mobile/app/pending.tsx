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
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { Redirect } from "expo-router";

import { AppText } from "../src/components/AppText";
import { Button } from "../src/components/Button";
import { Logo } from "../src/components/Logo";
import { SectionCaption } from "../src/components/SectionCaption";
import { useSession } from "../src/lib/auth";
import { craftLabel, MAX_CRAFTS, toggleCraft } from "../src/lib/crafts";
import { CRAFTS } from "../src/lib/model";
import { normalisePhone } from "../src/lib/phone.ts";
import { submitRegistration } from "../src/lib/registrations";
import { useToast } from "../src/lib/toast";
import { colors, fontFamily, layout, radii, spacing, MIN_TAP_TARGET } from "../src/theme/tokens";
import { type } from "../src/theme/typography";

export default function Pending() {
  const { profile, user, signOut, loading, isApproved, isAdmin } = useSession();

  // The approval re-mints the claim and the snapshot above fires, but a
  // route does not leave itself — this is what makes the holding screen give
  // way to the dashboard without anybody signing out.
  if (!loading && !user) return <Redirect href="/sign-in" />;
  if (!loading && isApproved) return <Redirect href={isAdmin ? "/board" : "/my-tasks"} />;

  // The form is done once a craft is on the record — that is the field the
  // approval queue reads.
  const registered = (profile?.crafts?.length ?? 0) > 0;

  if (!profile) return <Waiting crafts={[]} />;
  return registered ? <Waiting crafts={profile.crafts} /> : <RegistrationForm uid={profile.uid} name={profile.name} email={user?.email ?? ""} onSignOut={signOut} />;
}

// ---------------------------------------------------------------------------

function Waiting({ crafts }: { crafts: string[] }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 34,
        backgroundColor: colors.surfaceAlt,
      }}
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
          color: "rgba(27,26,23,.6)",
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
        <View style={{ width: 7, height: 7, borderRadius: radii.pill, backgroundColor: colors.brandYellow }} />
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
          color: "rgba(27,26,23,.42)",
          marginTop: 26,
          textAlign: "center",
        }}
      >
        We will message you on WhatsApp the moment it is approved.
      </AppText>
    </View>
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
  const [crafts, setCrafts] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // E.164, which is what the messaging channels need. Kept loose enough that
  // a Bangladeshi number typed the local way is accepted and normalised.
  const normalisedPhone = useMemo(() => normalisePhone(phone), [phone]);
  const phoneValid = normalisedPhone !== null;
  const canSubmit = crafts.length > 0 && phoneValid && !busy;

  async function submit() {
    if (!canSubmit || crafts.length === 0 || !normalisedPhone) return;
    setBusy(true);
    try {
      await submitRegistration(uid, { phone: normalisedPhone, crafts, note: note.trim() });
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
          {`Welcome, ${name.split(" ")[0] || "there"}`}
        </AppText>
        <AppText
          style={[type.bodySmall, { color: "rgba(27,26,23,.6)", textAlign: "center" }]}
        >
          Tell the admin what you do and how to reach you. They approve
          registrations by hand.
        </AppText>
      </View>

      <View style={{ gap: spacing.chips }}>
        <SectionCaption>What you do</SectionCaption>
        {/* Several are allowed: one person is rarely one thing. */}
        <AppText style={[type.bodySmall, { color: "rgba(27,26,23,.5)", marginTop: -4 }]}>
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
                    color: on ? colors.white : "rgba(27,26,23,.6)",
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
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="+880 1712 344192"
          placeholderTextColor="rgba(27,26,23,.35)"
          keyboardType="phone-pad"
          autoComplete="tel"
          accessibilityLabel="Your phone number"
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: phone && !phoneValid ? colors.danger : colors.hairlineStrong,
            borderRadius: radii.chipLarge,
            paddingVertical: 12,
            paddingHorizontal: 13,
            minHeight: MIN_TAP_TARGET,
            fontFamily: fontFamily.mono,
            fontSize: 13,
            color: colors.ink,
          }}
        />
        <AppText
          style={[
            type.metaXSmall,
            { color: phone && !phoneValid ? colors.danger : "rgba(27,26,23,.45)" },
          ]}
        >
          {phone && !phoneValid
            ? "That does not look like a phone number yet."
            : "Reminders fall back to WhatsApp and SMS on this number."}
        </AppText>
      </View>

      <View style={{ gap: spacing.chips }}>
        <SectionCaption>Anything the admin should know</SectionCaption>
        <TextInput
          value={note}
          onChangeText={(next) => setNote(next.slice(0, 500))}
          placeholder="Which episodes you have worked on, what else you can cover…"
          placeholderTextColor="rgba(27,26,23,.35)"
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
        <AppText style={[type.metaXSmall, { color: "rgba(27,26,23,.45)" }]}>
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
