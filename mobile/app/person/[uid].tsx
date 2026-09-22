/**
 * Person detail — everything one member owes, across every episode.
 */

import { useMemo, useState } from "react";
import { Pressable, Share, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppShell } from "../../src/components/AppShell";
import { AppText } from "../../src/components/AppText";
import { Button } from "../../src/components/Button";
import { Card } from "../../src/components/Card";
import { EmptyState } from "../../src/components/EmptyState";
import { HeatBadge } from "../../src/components/HeatBadge";
import { craftLabel, toggleCraft } from "../../src/lib/crafts.ts";
import { contactTelegramLink } from "../../src/lib/contact-actions.ts";
import { telegramInvite } from "../../src/lib/telegram-invite.ts";
import { addAdvance, advancedToast, setRates } from "../../src/lib/review-actions.ts";
import { EMPTY_RATES, type Rates } from "../../src/lib/model";
import { money } from "../../src/lib/payments.ts";
import { firstName } from "../../src/lib/format.ts";
import { SectionCaption } from "../../src/components/SectionCaption";
import { CRAFTS } from "../../src/lib/model";
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
import { channelPinnedToast, setCrafts, setPreferredChannel } from "../../src/lib/registrations";
import { maskPhone } from "../../src/lib/format.ts";
import { type } from "../../src/theme/typography";
import { useToast } from "../../src/lib/toast";
import { colors, fontFamily, radii, spacing, MIN_TAP_TARGET} from "../../src/theme/tokens";

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

  const [savingCrafts, setSavingCrafts] = useState(false);
  const [rateDraft, setRateDraft] = useState<Rates>(EMPTY_RATES);
  const [ratesSeeded, setRatesSeeded] = useState(false);
  const [ratesDirty, setRatesDirty] = useState(false);
  const [savingRates, setSavingRates] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceNote, setAdvanceNote] = useState("");
  const [advancing, setAdvancing] = useState(false);

  const advanceValue = Number(advanceAmount);
  const advanceValid =
    advanceAmount.trim() !== "" && Number.isFinite(advanceValue) && advanceValue > 0;

  async function payAdvance() {
    if (!member || !advanceValid || advancing) return;
    setAdvancing(true);
    try {
      const { balance } = await addAdvance(
        member.uid,
        Math.round(advanceValue),
        advanceNote.trim() || null
      );
      setAdvanceAmount("");
      setAdvanceNote("");
      toast(advancedToast(firstName(member.name), money(Math.round(advanceValue)), money(balance)));
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setAdvancing(false);
    }
  }


  // Seeded once. Re-seeding from the snapshot would wipe a half-typed rate
  // every time anybody else on the team changed.
  if (member && !ratesSeeded) {
    setRateDraft(member.rates);
    setRatesSeeded(true);
  }

  const patchRate = (next: Partial<Rates>) => {
    setRateDraft((r) => ({ ...r, ...next }));
    setRatesDirty(true);
  };

  async function saveRates() {
    if (!member || savingRates) return;
    setSavingRates(true);
    try {
      await setRates(member.uid, rateDraft);
      setRatesDirty(false);
      toast(`Rate card saved for ${firstName(member.name)}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setSavingRates(false);
    }
  }

  const [inviting, setInviting] = useState(false);

  async function toggleMemberCraft(craft: string) {
    if (!member || savingCrafts) return;
    setSavingCrafts(true);
    try {
      await setCrafts(member.uid, toggleCraft(member.crafts, craft));
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setSavingCrafts(false);
    }
  }

  /**
   * The chat id can only come from Telegram, so the most an admin can do is
   * hand this person the link. The share sheet is the point: it goes out over
   * whatever they already talk on.
   */
  async function inviteToTelegram() {
    if (!member || inviting) return;
    setInviting(true);
    try {
      const url = await contactTelegramLink(member.uid);
      const invite = telegramInvite(member.name, url);
      await Share.share({ message: invite.message, title: invite.subject });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not make an invite link.");
    } finally {
      setInviting(false);
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
      subtitle={`${craftLabel(member?.crafts ?? [])} · reminders via ${channelLabel(channel)}`}
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

      {member ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.hairline,
            paddingVertical: spacing.card,
            paddingHorizontal: 16,
            gap: spacing.chips,
          }}
        >
          <SectionCaption>What they do</SectionCaption>
          {/* One person is rarely one thing, and what they do changes. This
              is the record the assign screen searches on. */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.chipsTight }}>
            {CRAFTS.map((option) => {
              const on = member.crafts.includes(option);
              return (
                <Pressable
                  key={option}
                  disabled={savingCrafts}
                  onPress={() => void toggleMemberCraft(option)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={option}
                  style={{
                    paddingVertical: 9,
                    paddingHorizontal: 13,
                    borderRadius: radii.pill,
                    borderWidth: 1,
                    borderColor: on ? colors.ink : colors.hairlineStronger,
                    backgroundColor: on ? colors.ink : "transparent",
                    minHeight: 36,
                    justifyContent: "center",
                    opacity: savingCrafts ? 0.5 : 1,
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
      ) : null}

      {/* Money handed over before the work exists.
          Kept next to the rate card because the two are one conversation —
          what somebody earns, and what they have already had. */}
      {member ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.hairline,
            paddingVertical: spacing.card,
            paddingHorizontal: 16,
            gap: spacing.chips,
          }}
        >
          <SectionCaption>Advance</SectionCaption>

          <View
            style={{
              backgroundColor: member.balance > 0 ? colors.ink : colors.surfaceSunken,
              borderRadius: radii.chipLarge,
              paddingVertical: 11,
              paddingHorizontal: 12,
            }}
          >
            <AppText
              style={{
                fontFamily: fontFamily.regular,
                fontSize: 11.5,
                lineHeight: 16,
                color: member.balance > 0 ? "rgba(255,255,255,.82)" : colors.muted,
              }}
            >
              {member.balance > 0
                ? `${money(member.balance)} advanced and not yet worked off. Approved work comes off this first and is paid on the spot.`
                : "Nothing advanced. Work you approve will queue to be paid as normal."}
            </AppText>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.chips }}>
            <TextInput
              value={advanceAmount}
              onChangeText={setAdvanceAmount}
              keyboardType="numeric"
              placeholder="Amount"
              placeholderTextColor={colors.faint}
              accessibilityLabel={`Amount to advance to ${member.name}`}
              style={{
                flex: 1,
                minHeight: MIN_TAP_TARGET,
                paddingHorizontal: 12,
                borderRadius: radii.chipLarge,
                borderWidth: 1,
                borderColor: colors.hairlineStrong,
                backgroundColor: colors.surface,
                fontFamily: fontFamily.mono,
                fontSize: 13,
                color: colors.ink,
              }}
            />
            <Button
              label={advancing ? "Saving…" : "Pay advance"}
              radius={radii.cardSmall}
              disabled={advancing || !advanceValid}
              onPress={() => void payAdvance()}
              style={{ flex: 1 }}
              accessibilityLabel={`Advance money to ${member.name}`}
            />
          </View>

          <TextInput
            value={advanceNote}
            onChangeText={(next: string) => setAdvanceNote(next.slice(0, 300))}
            placeholder="What it is for — optional"
            placeholderTextColor={colors.faint}
            accessibilityLabel="What the advance is for"
            style={{
              minHeight: MIN_TAP_TARGET,
              paddingHorizontal: 12,
              borderRadius: radii.chipLarge,
              borderWidth: 1,
              borderColor: colors.hairlineStrong,
              backgroundColor: colors.surface,
              fontFamily: fontFamily.regular,
              fontSize: 13,
              color: colors.ink,
            }}
          />
        </View>
      ) : null}

      {/* What this person is paid per unit.
          Two voice rates, because the same artist is worth a different figure
          reading narration and performing a character — and the admin says
          which at the moment they approve the work, not here.
          A blank is not zero: it means there is no rate for that kind of work
          and the admin types a figure at approval instead. */}
      {member ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.hairline,
            paddingVertical: spacing.card,
            paddingHorizontal: 16,
            gap: spacing.chips,
          }}
        >
          <SectionCaption>Rate card</SectionCaption>
          <RateRow label="Voice · character" suffix="per minute" value={rateDraft.voiceCharacter} onChange={(v) => patchRate({ voiceCharacter: v })} />
          <RateRow label="Voice · narration" suffix="per minute" value={rateDraft.voiceNarration} onChange={(v) => patchRate({ voiceNarration: v })} />
          <RateRow label="Sound design" suffix="per minute" value={rateDraft.soundDesign} onChange={(v) => patchRate({ soundDesign: v })} />
          <RateRow label="Cover design" suffix="per cover" value={rateDraft.cover} onChange={(v) => patchRate({ cover: v })} />

          <AppText style={[type.metaXSmall, { color: colors.faint }]}>
            Leave a rate blank where there isn't one — script writing and the
            rest are a figure you type when you approve the work.
          </AppText>

          {ratesDirty ? (
            <Button
              label={savingRates ? "Saving…" : "Save rate card"}
              radius={radii.cardSmall}
              disabled={savingRates}
              onPress={() => void saveRates()}
            />
          ) : null}
        </View>
      ) : null}

      {/* Somebody an admin typed in. Two things are different about them:
          there is no account to maintain its own details, and Telegram needs
          an invite because only they can create the chat id. */}
      {member?.accountless ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.hairline,
            paddingVertical: spacing.card,
            paddingHorizontal: 16,
            gap: spacing.chips,
          }}
        >
          <SectionCaption>No app on their phone</SectionCaption>
          <AppText style={[type.bodySmall, { color: colors.muted }]}>
            {member.telegramChatId
              ? "Telegram is connected — reminders arrive there, and they can close a task from the chat."
              : member.preferredChannel === "telegram"
                ? "Telegram is not connected yet. Only they can start the chat, so send them the invite below."
                : `Reminders go to ${maskPhone(member.phone)}.`}
          </AppText>

          <View style={{ flexDirection: "row", gap: spacing.cardsTight }}>
            <Button
              label="Edit details"
              variant="ink"
              radius={radii.cardSmall}
              style={{ flex: 1 }}
              onPress={() => router.push(`/contact?uid=${member.uid}`)}
            />
            {member.telegramChatId ? null : (
              <Button
                label={inviting ? "Making a link…" : "Telegram invite"}
                variant="outline"
                radius={radii.cardSmall}
                disabled={inviting}
                style={{ flex: 1 }}
                onPress={() => void inviteToTelegram()}
                accessibilityLabel={`Send ${member.name} a Telegram invite link`}
              />
            )}
          </View>
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
                      color: task.done ? colors.faint : colors.ink,
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
                      color: colors.faint,
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

/**
 * One line of the rate card. The field is the number alone — the rupee sign
 * and the unit are labels, because a text box somebody has to type "₹" into
 * is a text box that collects "50rs" and "Rs.50".
 */
function RateRow({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.chips }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText style={[type.bodySmall]}>{label}</AppText>
        <AppText style={[type.metaXSmall, { color: colors.faint, marginTop: 1 }]}>
          {value === null ? `no rate · ${suffix}` : `${money(value)} ${suffix}`}
        </AppText>
      </View>
      <TextInput
        value={text}
        onChangeText={(next: string) => {
          setText(next);
          const parsed = next.trim() === "" ? null : Number(next);
          onChange(parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null);
        }}
        keyboardType="numeric"
        placeholder="—"
        placeholderTextColor={colors.faint}
        accessibilityLabel={`${label}, ${suffix}`}
        style={{
          width: 88,
          minHeight: MIN_TAP_TARGET,
          paddingHorizontal: 11,
          borderRadius: radii.chipLarge,
          borderWidth: 1,
          borderColor: colors.hairlineStrong,
          backgroundColor: colors.surface,
          fontFamily: fontFamily.mono,
          fontSize: 13,
          color: colors.ink,
          textAlign: "right",
        }}
      />
    </View>
  );
}
