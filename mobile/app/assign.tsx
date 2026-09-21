/**
 * Assign — the only screen that creates work.
 *
 * Person, episode, task, due date, channel. The reminder ladder is shown but
 * not editable here: it is a property of the whole operation, set once on the
 * Notify screen, and this is where an admin is reminded what they are
 * committing the person to.
 */

import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppShell } from "../src/components/AppShell";
import { AppText } from "../src/components/AppText";
import { Avatar } from "../src/components/Avatar";
import { Button } from "../src/components/Button";
import { SectionCaption } from "../src/components/SectionCaption";
import { useSession } from "../src/lib/auth";
import { createEpisode, createTask } from "../src/lib/actions";
import {
  assignedToast,
  dueDateFrom,
  INITIAL_DRAFT,
  isComplete,
  isEpisodeValid,
  ladderBars,
  COLLAPSED_PEOPLE,
  ladderNote,
  missingFrom,
  nextEpisodeCode,
  searchPeople,
  stepDueDays,
  submitLabel,
  type AssignDraft,
} from "../src/lib/assign.ts";
import { byAirDate } from "../src/lib/completion.ts";
import { useEpisodes, useNow, useSettings, useTeam } from "../src/lib/data";
import { airLabel, firstName } from "../src/lib/format.ts";
import { TASK_TYPES, type ChannelId } from "../src/lib/model";
import { useToast } from "../src/lib/toast";
import { colors, fontFamily, heat, radii, spacing, MIN_TAP_TARGET } from "../src/theme/tokens";
import { type } from "../src/theme/typography";

const CHANNEL_TILES: { id: ChannelId; name: string; note: string }[] = [
  { id: "whatsapp", name: "WhatsApp", note: "free tier" },
  { id: "telegram", name: "Telegram", note: "unlimited" },
  { id: "sms", name: "SMS", note: "1/day" },
];

export default function Assign() {
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const { isAdmin } = useSession();
  const params = useLocalSearchParams<{ uid?: string; episodeId?: string }>();

  const { data: team } = useTeam(isAdmin);
  const { data: episodes } = useEpisodes(isAdmin);
  const { data: settings } = useSettings(isAdmin);

  const approved = useMemo(() => team.filter((m) => m.status === "approved"), [team]);
  const ordered = useMemo(() => byAirDate(episodes), [episodes]);

  // Arriving from a person or an episode, that choice is already made.
  const [draft, setDraft] = useState<AssignDraft>(() => ({
    ...INITIAL_DRAFT,
    assigneeUid: params.uid ?? null,
    episodeId: params.episodeId ?? null,
  }));
  const [busy, setBusy] = useState(false);
  const [addingEpisode, setAddingEpisode] = useState(false);

  const patch = (next: Partial<AssignDraft>) => setDraft((d) => ({ ...d, ...next }));

  const [personQuery, setPersonQuery] = useState("");
  const [peopleExpanded, setPeopleExpanded] = useState(false);

  const matchingPeople = useMemo(
    () => searchPeople(approved, personQuery),
    [approved, personQuery]
  );

  /**
   * Collapsed by default, but never hiding the person already chosen — a row
   * that does not show your own selection reads as having lost it.
   */
  const visiblePeople = useMemo(() => {
    if (peopleExpanded || personQuery.trim()) return matchingPeople;
    const head = matchingPeople.slice(0, COLLAPSED_PEOPLE);
    const chosen = matchingPeople.find((m) => m.uid === draft.assigneeUid);
    if (chosen && !head.includes(chosen)) return [...head.slice(0, COLLAPSED_PEOPLE - 1), chosen];
    return head;
  }, [matchingPeople, peopleExpanded, personQuery, draft.assigneeUid]);

  const hiddenPeople = matchingPeople.length - visiblePeople.length;

  const person = approved.find((m) => m.uid === draft.assigneeUid);
  const blocked = missingFrom(draft);
  const canSubmit = isComplete(draft) && !busy;

  async function submit() {
    if (!canSubmit || !draft.assigneeUid || !draft.episodeId || !draft.type) return;
    setBusy(true);
    try {
      await createTask({
        assigneeUid: draft.assigneeUid,
        episodeId: draft.episodeId,
        type: draft.type,
        dueDate: dueDateFrom(now, draft.dueInDays),
        preferredChannel: draft.channel,
      });
      toast(assignedToast(draft.type, person?.name ?? "them", settings.plan));
      // Straight to the episode, where the new task is already in the list.
      router.replace(`/episode/${draft.episodeId}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not save. Try again.");
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="New task"
      subtitle="Pick a person, then the work"
      activeTab="board"
      onBack={() => router.back()}
    >
      <View style={{ padding: 16, gap: 18 }}>
        {/* Assign to */}
        <View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 9,
              gap: spacing.chips,
            }}
          >
            <SectionCaption>Assign to</SectionCaption>
            {/* The search box earns its place only once the row would wrap
                past a screenful. Below that it is one more thing to look at. */}
            {approved.length > COLLAPSED_PEOPLE ? (
              <TextInput
                value={personQuery}
                onChangeText={setPersonQuery}
                placeholder="Search people"
                placeholderTextColor="rgba(27,26,23,.38)"
                accessibilityLabel="Search people"
                style={{
                  flex: 1,
                  maxWidth: 180,
                  minHeight: 34,
                  paddingHorizontal: 11,
                  borderRadius: radii.pill,
                  borderWidth: 1,
                  borderColor: colors.hairlineStrong,
                  backgroundColor: colors.surface,
                  fontFamily: fontFamily.regular,
                  fontSize: 11.5,
                  color: colors.ink,
                }}
              />
            ) : null}
          </View>
          {approved.length === 0 ? (
            <AppText style={[type.bodySmall, { color: "rgba(27,26,23,.5)" }]}>
              Nobody is approved yet. Approve a registration, or add someone who
              has not installed the app from the Team tab.
            </AppText>
          ) : visiblePeople.length === 0 ? (
            <AppText style={[type.bodySmall, { color: "rgba(27,26,23,.5)" }]}>
              {`Nobody matches "${personQuery.trim()}".`}
            </AppText>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.chips }}>
              {visiblePeople.map((member) => {
                const on = member.uid === draft.assigneeUid;
                return (
                  <Pressable
                    key={member.uid}
                    onPress={() => patch({ assigneeUid: member.uid })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={member.name}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.chips,
                      paddingVertical: 7,
                      paddingRight: 11,
                      paddingLeft: 7,
                      borderRadius: radii.pill,
                      borderWidth: 1,
                      borderColor: on ? colors.ink : colors.hairlineStrong,
                      backgroundColor: on ? colors.ink : colors.surface,
                      minHeight: 36,
                    }}
                  >
                    <Avatar name={member.name} size={22} variant={on ? "yellow" : "light"} />
                    <AppText
                      style={{
                        fontFamily: fontFamily.medium,
                        fontSize: 11.5,
                        lineHeight: 13,
                        color: on ? colors.white : colors.ink,
                      }}
                    >
                      {firstName(member.name)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Everyone is still reachable without typing: the row collapses
              rather than scrolling off, and the selected person is never
              among the ones hidden. */}
          {hiddenPeople > 0 || (peopleExpanded && !personQuery.trim()) ? (
            <Pressable
              onPress={() => setPeopleExpanded((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={
                peopleExpanded ? "Show fewer people" : `Show all ${matchingPeople.length} people`
              }
              style={{ minHeight: MIN_TAP_TARGET, justifyContent: "center", paddingTop: 4 }}
            >
              <AppText
                style={{
                  fontFamily: fontFamily.medium,
                  fontSize: 11,
                  lineHeight: 13,
                  color: "rgba(27,26,23,.6)",
                }}
              >
                {peopleExpanded ? "Show fewer" : `+ ${hiddenPeople} more`}
              </AppText>
            </Pressable>
          ) : null}
        </View>

        {/* Episode */}
        <View>
          <SectionCaption style={{ marginBottom: 9 }}>Episode</SectionCaption>
          <View style={{ gap: spacing.chipsTight }}>
            {ordered.map((episode) => {
              const on = episode.id === draft.episodeId;
              return (
                <Pressable
                  key={episode.id}
                  onPress={() => patch({ episodeId: episode.id })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${episode.code} ${episode.title}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.cards,
                    paddingVertical: 11,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: on ? colors.brandYellow : colors.hairlineStrong,
                    backgroundColor: on ? colors.selectedFill : colors.surface,
                    minHeight: MIN_TAP_TARGET,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: radii.pill,
                      backgroundColor: on ? colors.brandYellow : colors.hairlineStrong,
                    }}
                  />
                  <AppText
                    style={{
                      fontFamily: fontFamily.monoSemibold,
                      fontSize: 10,
                      lineHeight: 11,
                      color: colors.yellowDeep,
                    }}
                  >
                    {episode.code}
                  </AppText>
                  <AppText
                    numberOfLines={1}
                    weight="medium"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: fontFamily.medium,
                      fontSize: 12.5,
                      lineHeight: 15,
                    }}
                  >
                    {episode.title}
                  </AppText>
                  <AppText
                    style={{
                      fontFamily: fontFamily.mono,
                      fontSize: 10,
                      lineHeight: 11,
                      color: "rgba(27,26,23,.4)",
                    }}
                  >
                    {airLabel(episode.airDate)}
                  </AppText>
                </Pressable>
              );
            })}

            {addingEpisode ? (
              <NewEpisode
                suggestedCode={nextEpisodeCode(episodes)}
                onCancel={() => setAddingEpisode(false)}
                onCreated={(id) => {
                  patch({ episodeId: id });
                  setAddingEpisode(false);
                }}
                onError={(message) => toast(message)}
                now={now}
              />
            ) : (
              <Pressable
                onPress={() => setAddingEpisode(true)}
                accessibilityRole="button"
                accessibilityLabel="Add an episode"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.cards,
                  paddingVertical: 11,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: colors.hairlineStronger,
                  minHeight: MIN_TAP_TARGET,
                }}
              >
                <AppText
                  style={{
                    fontFamily: fontFamily.mono,
                    fontSize: 13,
                    lineHeight: 13,
                    color: "rgba(27,26,23,.45)",
                    width: 8,
                    textAlign: "center",
                  }}
                >
                  +
                </AppText>
                <AppText
                  weight="medium"
                  style={{
                    fontFamily: fontFamily.medium,
                    fontSize: 12.5,
                    lineHeight: 15,
                    color: "rgba(27,26,23,.55)",
                  }}
                >
                  New episode
                </AppText>
              </Pressable>
            )}
          </View>
        </View>

        {/* Task */}
        <View>
          <SectionCaption style={{ marginBottom: 9 }}>Task</SectionCaption>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.chipsTight }}>
            {TASK_TYPES.map((taskType) => {
              const on = taskType === draft.type;
              return (
                <Pressable
                  key={taskType}
                  onPress={() => patch({ type: taskType })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={{
                    // Two columns, with the 6px gap taken out of the width.
                    width: "48.6%",
                    flexGrow: 1,
                    paddingVertical: 11,
                    paddingHorizontal: 10,
                    borderRadius: radii.cardSmall,
                    borderWidth: 1,
                    borderColor: on ? colors.ink : colors.hairlineStrong,
                    backgroundColor: on ? colors.ink : colors.surface,
                    minHeight: MIN_TAP_TARGET,
                    justifyContent: "center",
                  }}
                >
                  <AppText
                    style={{
                      fontFamily: fontFamily.medium,
                      fontSize: 11.5,
                      lineHeight: 14.4,
                      textAlign: "center",
                      color: on ? colors.white : colors.ink,
                    }}
                  >
                    {taskType}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Due in */}
        <View>
          <SectionCaption style={{ marginBottom: 9 }}>Due in</SectionCaption>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.cardTight,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.hairline,
              borderRadius: 10,
              paddingVertical: 10,
              paddingHorizontal: 12,
            }}
          >
            <StepperButton
              label="−"
              onPress={() => patch({ dueInDays: stepDueDays(draft.dueInDays, -1) })}
              accessibilityLabel="One day sooner"
              disabled={draft.dueInDays <= 1}
            />
            <View style={{ flex: 1, flexDirection: "row", alignItems: "baseline", justifyContent: "center" }}>
              <AppText
                style={{ fontFamily: fontFamily.monoSemibold, fontSize: 22, lineHeight: 24 }}
              >
                {String(draft.dueInDays)}
              </AppText>
              <AppText
                style={{
                  fontFamily: fontFamily.regular,
                  fontSize: 12,
                  lineHeight: 14,
                  color: "rgba(27,26,23,.5)",
                  marginLeft: 5,
                }}
              >
                days
              </AppText>
            </View>
            <StepperButton
              label="+"
              onPress={() => patch({ dueInDays: stepDueDays(draft.dueInDays, 1) })}
              accessibilityLabel="One day later"
            />
          </View>
        </View>

        {/* Reminder ladder */}
        <View>
          <SectionCaption style={{ marginBottom: 9 }}>Reminder ladder</SectionCaption>
          <View style={{ backgroundColor: colors.ink, borderRadius: radii.card, padding: spacing.card }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 5, height: 54 }}>
              {ladderBars(settings.plan).map((bar) => (
                <View key={bar.step} style={{ flex: 1, alignItems: "center", gap: 6 }}>
                  <View
                    style={{
                      width: "100%",
                      height: bar.height,
                      borderTopLeftRadius: radii.badge,
                      borderTopRightRadius: radii.badge,
                      backgroundColor: (heat[bar.step] ?? heat[heat.length - 1]).fg,
                    }}
                  />
                  <AppText
                    style={{
                      fontFamily: fontFamily.monoSemibold,
                      fontSize: 10,
                      lineHeight: 11,
                      color: "rgba(255,255,255,.75)",
                    }}
                  >
                    {`${bar.days}d`}
                  </AppText>
                </View>
              ))}
            </View>
            <AppText
              style={{
                fontFamily: fontFamily.regular,
                fontSize: 10.5,
                lineHeight: 15.75,
                color: "rgba(255,255,255,.55)",
                marginTop: 11,
              }}
            >
              {ladderNote(settings.plan)}
            </AppText>
          </View>
        </View>

        {/* Send via */}
        <View>
          <SectionCaption style={{ marginBottom: 9 }}>Send via</SectionCaption>
          <View style={{ flexDirection: "row", gap: spacing.chipsTight }}>
            {CHANNEL_TILES.map((tile) => {
              const on = tile.id === draft.channel;
              return (
                <Pressable
                  key={tile.id}
                  // Tapping the chosen one again clears it, which puts this
                  // task back on the normal fallback chain.
                  onPress={() => patch({ channel: on ? null : tile.id })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    borderRadius: radii.cardSmall,
                    borderWidth: 1,
                    borderColor: on ? colors.brandYellow : colors.hairlineStrong,
                    backgroundColor: on ? colors.selectedFill : colors.surface,
                    alignItems: "center",
                    minHeight: MIN_TAP_TARGET,
                    justifyContent: "center",
                  }}
                >
                  <AppText
                    style={{ fontFamily: fontFamily.semibold, fontSize: 11, lineHeight: 13.2 }}
                  >
                    {tile.name}
                  </AppText>
                  <AppText
                    style={{
                      fontFamily: fontFamily.mono,
                      fontSize: 9,
                      lineHeight: 10,
                      color: "rgba(27,26,23,.42)",
                      marginTop: 4,
                    }}
                  >
                    {tile.note}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Button
          label={busy ? "Assigning…" : blocked ?? submitLabel(firstName(person?.name ?? ""))}
          size="large"
          disabled={!canSubmit}
          onPress={() => void submit()}
        />
      </View>
    </AppShell>
  );
}

function StepperButton({
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
      // The square is 32px; the hit slop is what reaches 44.
      hitSlop={6}
      style={({ pressed }) => ({
        width: 32,
        height: 32,
        borderRadius: radii.chipLarge,
        backgroundColor: pressed ? colors.gutter : colors.fill,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <AppText style={{ fontFamily: fontFamily.monoSemibold, fontSize: 16, lineHeight: 18 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * Inline episode creation. Not in the handoff — see createEpisode() — but a
 * task needs an episode, and EP-44 has to come from somewhere.
 */
function NewEpisode({
  suggestedCode,
  onCreated,
  onCancel,
  onError,
  now,
}: {
  suggestedCode: string;
  onCreated: (id: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
  now: Date;
}) {
  const [code, setCode] = useState(suggestedCode);
  const [title, setTitle] = useState("");
  const [airInDays, setAirInDays] = useState(14);
  const [busy, setBusy] = useState(false);

  const valid = isEpisodeValid({ code, title, airInDays });

  async function create() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const airDate = new Date(now);
      airDate.setDate(airDate.getDate() + airInDays);
      onCreated(await createEpisode({ code, title, airDate }));
    } catch (err) {
      onError(err instanceof Error ? err.message : "That did not save. Try again.");
      setBusy(false);
    }
  }

  const input = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radii.chipLarge,
    paddingVertical: 10,
    paddingHorizontal: 11,
    minHeight: MIN_TAP_TARGET,
    color: colors.ink,
  } as const;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.brandYellow,
        backgroundColor: colors.selectedFill,
        borderRadius: 10,
        padding: spacing.cardTight,
        gap: spacing.chipsTight,
      }}
    >
      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="EP-44"
        placeholderTextColor="rgba(27,26,23,.35)"
        autoCapitalize="characters"
        accessibilityLabel="Episode code"
        style={[input, { fontFamily: fontFamily.monoSemibold, fontSize: 12 }]}
      />
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Bengali title"
        placeholderTextColor="rgba(27,26,23,.35)"
        accessibilityLabel="Episode title"
        style={[input, { fontFamily: fontFamily.bengali, fontSize: 13 }]}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.cardTight }}>
        <AppText style={[type.metaSmall, { flex: 1, color: "rgba(27,26,23,.55)" }]}>
          {`Airs in ${airInDays} days`}
        </AppText>
        <StepperButton
          label="−"
          onPress={() => setAirInDays((d) => Math.max(0, d - 7))}
          accessibilityLabel="A week earlier"
          disabled={airInDays <= 0}
        />
        <StepperButton
          label="+"
          onPress={() => setAirInDays((d) => d + 7)}
          accessibilityLabel="A week later"
        />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.chipsTight }}>
        <Button label="Cancel" variant="quiet" onPress={onCancel} style={{ flex: 1 }} />
        <Button
          label={busy ? "Adding…" : "Add episode"}
          disabled={!valid || busy}
          onPress={() => void create()}
          style={{ flex: 2 }}
        />
      </View>
    </View>
  );
}
