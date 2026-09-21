/**
 * Somebody who does the work but has not installed the app.
 *
 * Every production has them: the editor who answers on WhatsApp, the voice
 * artist who will not install anything. Before this screen they could not be
 * assigned to, which meant their work was tracked in somebody's head and the
 * board's percentages were a lie.
 *
 * A phone number is all that is required, because it is all that exists.
 * Everything downstream — the board, the ladder, the reminder feed — treats
 * them as an ordinary member; only the channel chain knows the difference,
 * because push has no device to arrive on.
 *
 * The same screen adds and edits: `uid` in the route says which.
 */

import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppShell } from "../src/components/AppShell";
import { AppText } from "../src/components/AppText";
import { Button } from "../src/components/Button";
import { SectionCaption } from "../src/components/SectionCaption";
import { useSession } from "../src/lib/auth";
import { addContact, removeContact, updateContact } from "../src/lib/contact-actions.ts";
import {
  CONTACT_CHANNELS,
  EMPTY_CONTACT,
  contactAddedToast,
  contactFrom,
  contactRemovedToast,
  isContactComplete,
  missingFromContact,
  type ContactDraft,
} from "../src/lib/contacts.ts";
import { CHANNEL_LABELS } from "../src/lib/channels.ts";
import { MAX_CRAFTS, toggleCraft } from "../src/lib/crafts.ts";
import { useTeam } from "../src/lib/data";
import { normalisePhone } from "../src/lib/phone.ts";
import { CRAFTS } from "../src/lib/model";
import { useToast } from "../src/lib/toast";
import { colors, fontFamily, radii, spacing, MIN_TAP_TARGET } from "../src/theme/tokens";
import { type } from "../src/theme/typography";

export default function Contact() {
  const router = useRouter();
  const toast = useToast();
  const { isAdmin } = useSession();
  const params = useLocalSearchParams<{ uid?: string }>();

  const { data: team } = useTeam(isAdmin);
  const existing = useMemo(
    () => (params.uid ? team.find((m) => m.uid === params.uid) ?? null : null),
    [team, params.uid]
  );

  // Seeded once. Re-seeding from the snapshot would overwrite what is being
  // typed every time anything else on the team changes.
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_CONTACT);
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);

  if (existing && !seeded) {
    setDraft(contactFrom(existing));
    setSeeded(true);
  }

  const patch = (next: Partial<ContactDraft>) => setDraft((d) => ({ ...d, ...next }));

  const phoneTyped = draft.phone.trim().length > 0;
  const phoneValid = normalisePhone(draft.phone) !== null;
  const blocked = missingFromContact(draft);
  const canSubmit = isContactComplete(draft) && !busy;
  const editing = Boolean(params.uid);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      if (params.uid) {
        await updateContact(params.uid, draft);
        toast(`${draft.name.trim()} updated`);
        router.replace(`/person/${params.uid}`);
      } else {
        const uid = await addContact(draft);
        toast(contactAddedToast(draft.name.trim()));
        router.replace(`/person/${uid}`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not save. Try again.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!params.uid || busy) return;
    setBusy(true);
    try {
      const { name, tasks } = await removeContact(params.uid);
      toast(contactRemovedToast(name, tasks));
      router.replace("/team");
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not save. Try again.");
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={editing ? "Edit person" : "Add someone"}
      subtitle={editing ? draft.name || "No app on their phone" : "They do not need the app"}
      activeTab="team"
      onBack={() => router.back()}
    >
      <View style={{ padding: spacing.screen, gap: 18 }}>
        <AppText style={[type.bodySmall, { color: "rgba(27,26,23,.6)" }]}>
          For people who do the work but will not install anything. They are
          assignable straight away — reminders go to their phone instead of the
          app.
        </AppText>

        <View style={{ gap: spacing.chips }}>
          <SectionCaption>Name</SectionCaption>
          <TextInput
            value={draft.name}
            onChangeText={(name) => patch({ name: name.slice(0, 80) })}
            placeholder="Rizu Ahmed"
            placeholderTextColor="rgba(27,26,23,.35)"
            accessibilityLabel="Their name"
            style={inputStyle(false)}
          />
        </View>

        <View style={{ gap: spacing.chips }}>
          <SectionCaption>Phone</SectionCaption>
          <TextInput
            value={draft.phone}
            onChangeText={(phone) => patch({ phone })}
            placeholder="+880 1712 344192"
            placeholderTextColor="rgba(27,26,23,.35)"
            keyboardType="phone-pad"
            autoComplete="tel"
            accessibilityLabel="Their phone number"
            style={inputStyle(phoneTyped && !phoneValid)}
          />
          <AppText
            style={[
              type.metaXSmall,
              { color: phoneTyped && !phoneValid ? colors.danger : "rgba(27,26,23,.45)" },
            ]}
          >
            {phoneTyped && !phoneValid
              ? "That does not look like a phone number yet."
              : "This is how they are recognised. If they install the app later and sign up with this number, you can merge the two."}
          </AppText>
        </View>

        <View style={{ gap: spacing.chips }}>
          <SectionCaption>Email — optional</SectionCaption>
          <TextInput
            value={draft.email}
            onChangeText={(email) => patch({ email })}
            placeholder="Usually there isn't one"
            placeholderTextColor="rgba(27,26,23,.35)"
            keyboardType="email-address"
            autoCapitalize="none"
            accessibilityLabel="Their email address"
            style={inputStyle(false)}
          />
        </View>

        <View style={{ gap: spacing.chips }}>
          <SectionCaption>What they do</SectionCaption>
          <AppText style={[type.bodySmall, { color: "rgba(27,26,23,.5)" }]}>
            {`Pick everything they do — up to ${MAX_CRAFTS}.`}
          </AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.chipsTight }}>
            {CRAFTS.map((option) => {
              const on = draft.crafts.includes(option);
              return (
                <Pressable
                  key={option}
                  onPress={() => patch({ crafts: toggleCraft(draft.crafts, option) })}
                  accessibilityRole="checkbox"
                  accessibilityState={{ selected: on }}
                  style={chipStyle(on)}
                >
                  <AppText style={chipTextStyle(on)}>{option}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: spacing.chips }}>
          <SectionCaption>Remind them on</SectionCaption>
          <AppText style={[type.bodySmall, { color: "rgba(27,26,23,.5)" }]}>
            Push is not an option for somebody with no app. Telegram needs one
            tap from them — the person page has the invite link.
          </AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.chipsTight }}>
            {CONTACT_CHANNELS.map((channel) => {
              const on = draft.preferredChannel === channel;
              return (
                <Pressable
                  key={channel}
                  onPress={() => patch({ preferredChannel: on ? null : channel })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={chipStyle(on)}
                >
                  <AppText style={chipTextStyle(on)}>{CHANNEL_LABELS[channel]}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: spacing.chips }}>
          <SectionCaption>Anything worth remembering</SectionCaption>
          <TextInput
            value={draft.note}
            onChangeText={(note) => patch({ note: note.slice(0, 500) })}
            placeholder="Answers fastest in the evening. Has done EP-33 to EP-36."
            placeholderTextColor="rgba(27,26,23,.35)"
            multiline
            accessibilityLabel="A note about them"
            style={[inputStyle(false), { minHeight: 88, textAlignVertical: "top" }]}
          />
        </View>

        <Button
          label={busy ? "Saving…" : blocked ?? (editing ? "Save changes" : "Add to the team")}
          size="large"
          disabled={!canSubmit}
          onPress={() => void submit()}
        />

        {editing ? (
          <Button
            label="Remove from the team"
            variant="outline"
            disabled={busy}
            onPress={() => void remove()}
            accessibilityLabel={`Remove ${draft.name} from the team`}
          />
        ) : null}
      </View>
    </AppShell>
  );
}

function inputStyle(invalid: boolean) {
  return {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: invalid ? colors.danger : colors.hairlineStrong,
    borderRadius: radii.chipLarge,
    paddingVertical: 12,
    paddingHorizontal: 13,
    minHeight: MIN_TAP_TARGET,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.ink,
  } as const;
}

function chipStyle(on: boolean) {
  return {
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: on ? colors.ink : colors.hairlineStronger,
    backgroundColor: on ? colors.ink : "transparent",
    minHeight: 36,
    justifyContent: "center",
  } as const;
}

function chipTextStyle(on: boolean) {
  return {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    lineHeight: 13,
    color: on ? colors.white : "rgba(27,26,23,.6)",
  } as const;
}
