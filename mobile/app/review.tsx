/**
 * The review queue: work that has been handed in and is waiting on a decision.
 *
 * Two decisions, and they are deliberately not symmetrical. Sending work back
 * needs a reason typed in — a bare refusal is not feedback, and the reason
 * travels with every reminder that follows. Accepting needs the numbers that
 * price it, because accepting is what opens a payment.
 *
 * What is asked for depends on the work: minutes for audio, a word count for
 * a script, and a figure typed by hand wherever there is no rate to multiply.
 */

import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { AppShell } from "../src/components/AppShell";
import { AppText } from "../src/components/AppText";
import { Avatar } from "../src/components/Avatar";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { EmptyState } from "../src/components/EmptyState";
import { SectionCaption } from "../src/components/SectionCaption";
import { useSession } from "../src/lib/auth";
import { indexBy, useEpisodes, useTasks, useTeam } from "../src/lib/data";
import type { Task, TeamMember } from "../src/lib/model";
import {
  estimateFor,
  money,
  needsRecordingTime,
  needsWordCount,
  rateFor,
  rateLabel,
  UNIT_LABELS,
  unitsForTaskType,
  type PayUnit,
} from "../src/lib/payments.ts";
import {
  approveTask,
  approvedToast,
  rejectTask,
  rejectedToast,
} from "../src/lib/review-actions.ts";
import { byReviewOrder, reviewQueueLabel } from "../src/lib/review.ts";
import { useToast } from "../src/lib/toast";
import { colors, fontFamily, radii, spacing, MIN_TAP_TARGET } from "../src/theme/tokens";
import { type } from "../src/theme/typography";

export default function Review() {
  const router = useRouter();
  const { isAdmin } = useSession();
  const { data: tasks } = useTasks({ enabled: isAdmin });
  const { data: team } = useTeam(isAdmin);
  const { data: episodes } = useEpisodes(isAdmin);

  const byUid = useMemo(() => indexBy(team, (m) => m.uid), [team]);
  const byEpisode = useMemo(() => indexBy(episodes, (e) => e.id), [episodes]);
  const queue = useMemo(() => byReviewOrder(tasks), [tasks]);

  return (
    <AppShell
      title="Review"
      subtitle={reviewQueueLabel(queue.length)}
      activeTab="board"
      onBack={() => router.back()}
    >
      <View style={{ padding: spacing.screen, gap: spacing.cardsTight }}>
        {queue.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            detail="When somebody submits a task it lands here, oldest first."
          />
        ) : null}

        {queue.map((task) => (
          <ReviewCard
            key={task.id}
            task={task}
            member={byUid.get(task.assigneeUid) ?? null}
            episodeCode={byEpisode.get(task.episodeId)?.code ?? ""}
          />
        ))}
      </View>
    </AppShell>
  );
}

function ReviewCard({
  task,
  member,
  episodeCode,
}: {
  task: Task;
  member: TeamMember | null;
  episodeCode: string;
}) {
  const toast = useToast();

  const units = useMemo(() => unitsForTaskType(task.type), [task.type]);
  const [unit, setUnit] = useState<PayUnit>(units[0]);
  const [minutes, setMinutes] = useState("");
  const [words, setWords] = useState("");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);

  const rates = member?.rates ?? null;
  const rate = rates ? rateFor(rates, unit) : null;

  const quantity = needsRecordingTime(unit)
    ? minutes.trim() === ""
      ? null
      : Number(minutes)
    : unit === "cover"
      ? 1
      : null;

  const estimate = estimateFor(quantity, rate);
  const typed = amount.trim() === "" ? null : Number(amount);
  const shown = estimate ?? (typed !== null && Number.isFinite(typed) ? Math.round(typed) : null);

  // Minutes are required where they are the unit: without them there is no
  // figure to put in front of anybody.
  const missing = needsRecordingTime(unit) && quantity === null ? "Add the recording time" : null;
  const canApprove = !busy && missing === null;

  async function approve() {
    if (!canApprove) return;
    setBusy(true);
    try {
      const { estimatedAmount } = await approveTask(task.id, {
        unit,
        recordingMinutes: needsRecordingTime(unit) ? quantity : null,
        wordCount: words.trim() === "" ? null : Number(words),
        comment: comment.trim() || null,
        amount: typed !== null && Number.isFinite(typed) ? Math.round(typed) : null,
      });
      toast(approvedToast(member?.name ?? "them", money(estimatedAmount)));
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not save.");
      setBusy(false);
    }
  }

  async function reject() {
    if (busy || !note.trim()) return;
    setBusy(true);
    try {
      await rejectTask(task.id, note.trim());
      toast(rejectedToast(member?.name ?? "them"));
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not save.");
      setBusy(false);
    }
  }

  return (
    <Card radius={12} style={{ padding: 13, gap: 11 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.chips }}>
        <Avatar name={member?.name ?? "?"} size={30} variant="light" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText weight="semibold" style={[type.bodySmall]}>
            {`${task.type}${episodeCode ? ` · ${episodeCode}` : ""}`}
          </AppText>
          <AppText style={[type.metaXSmall, { color: "rgba(27,26,23,.5)", marginTop: 2 }]}>
            {`${member?.name ?? "Somebody"}${task.rejectedCount > 0 ? ` · back for the ${task.rejectedCount + 1}${task.rejectedCount === 0 ? "st" : "th"} time` : ""}`}
          </AppText>
        </View>
      </View>

      {rejecting ? (
        <>
          <SectionCaption>Why is it going back?</SectionCaption>
          <TextInput
            value={note}
            onChangeText={(next) => setNote(next.slice(0, 500))}
            placeholder="Levels are too hot from 4:10 onwards — can you redo that section?"
            placeholderTextColor="rgba(27,26,23,.35)"
            multiline
            accessibilityLabel="Why the work is going back"
            style={[inputStyle, { minHeight: 84, textAlignVertical: "top" }]}
          />
          <AppText style={[type.metaXSmall, { color: "rgba(27,26,23,.5)" }]}>
            They will see this, and it goes out with every reminder until the
            work comes back — every other day.
          </AppText>
          <View style={{ flexDirection: "row", gap: spacing.chips }}>
            <Button
              label="Cancel"
              variant="quiet"
              radius={radii.cardSmall}
              onPress={() => setRejecting(false)}
              style={{ flex: 1, borderColor: colors.hairlineStrong }}
            />
            <Button
              label={busy ? "Sending…" : "Send it back"}
              variant="outline"
              radius={radii.cardSmall}
              disabled={busy || !note.trim()}
              onPress={() => void reject()}
              style={{ flex: 1 }}
            />
          </View>
        </>
      ) : (
        <>
          {units.length > 1 ? (
            <View style={{ gap: 7 }}>
              <SectionCaption>Paid as</SectionCaption>
              <View style={{ flexDirection: "row", gap: spacing.chipsTight }}>
                {units.map((option) => {
                  const on = option === unit;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setUnit(option)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: radii.pill,
                        borderWidth: 1,
                        borderColor: on ? colors.ink : colors.hairlineStronger,
                        backgroundColor: on ? colors.ink : "transparent",
                        alignItems: "center",
                        minHeight: 38,
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
                        {UNIT_LABELS[option]}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <AppText style={[type.metaXSmall, { color: "rgba(27,26,23,.5)" }]}>
                {rateLabel(rate, unit)}
              </AppText>
            </View>
          ) : null}

          {needsRecordingTime(unit) ? (
            <Field
              label="Recording time, in minutes"
              value={minutes}
              onChange={setMinutes}
              placeholder="12"
              numeric
            />
          ) : null}

          {needsWordCount(task.type) ? (
            <Field label="Word count" value={words} onChange={setWords} placeholder="1800" numeric />
          ) : null}

          {rate === null ? (
            <Field
              label={`Amount (${UNIT_LABELS[unit] === "Fixed amount" ? "no rate for this kind of work" : "no rate on file"})`}
              value={amount}
              onChange={setAmount}
              placeholder="500"
              numeric
            />
          ) : null}

          <Field label="Comment — optional" value={comment} onChange={setComment} placeholder="Lovely read." />

          <View
            style={{
              backgroundColor: colors.surfaceSunken,
              borderRadius: radii.chipLarge,
              paddingVertical: 10,
              paddingHorizontal: 11,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <AppText style={[type.metaXSmall, { color: "rgba(27,26,23,.55)" }]}>
              {quantity !== null && rate !== null
                ? `${quantity} × ${money(rate)}`
                : "Typed amount"}
            </AppText>
            <AppText weight="semibold" style={[type.metaXSmall]}>
              {shown === null ? "—" : money(shown)}
            </AppText>
          </View>

          <View style={{ flexDirection: "row", gap: spacing.chips }}>
            <Button
              label="Send back"
              variant="quiet"
              radius={radii.cardSmall}
              onPress={() => setRejecting(true)}
              style={{ flex: 1, borderColor: colors.hairlineStrong }}
            />
            <Button
              label={busy ? "Saving…" : missing ?? "Approve"}
              radius={radii.cardSmall}
              disabled={!canApprove}
              onPress={() => void approve()}
              style={{ flex: 2 }}
              accessibilityLabel={`Approve ${task.type} for ${member?.name ?? "them"}`}
            />
          </View>
        </>
      )}
    </Card>
  );
}

const inputStyle = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.hairlineStrong,
  borderRadius: radii.chipLarge,
  paddingVertical: 11,
  paddingHorizontal: 12,
  minHeight: MIN_TAP_TARGET,
  fontFamily: fontFamily.regular,
  fontSize: 13,
  color: colors.ink,
} as const;

function Field({
  label,
  value,
  onChange,
  placeholder,
  numeric = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  numeric?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <SectionCaption>{label}</SectionCaption>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="rgba(27,26,23,.35)"
        keyboardType={numeric ? "numeric" : "default"}
        accessibilityLabel={label}
        style={[inputStyle, numeric ? { fontFamily: fontFamily.mono } : null]}
      />
    </View>
  );
}
