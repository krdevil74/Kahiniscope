/**
 * Money: what has been paid, and what is waiting.
 *
 * Two screens behind one route, because the question each side is asking is
 * different. An admin is asking "what do I owe, and to whom" — a queue of
 * approvals with a figure to confirm. A member is asking "what have I made"
 * — a total that is real, and a separate one that is only arithmetic.
 *
 * Those two totals are never added together anywhere in this file. Paid is
 * money that exists; pending is a rate multiplied by a quantity, and the
 * admin has not agreed to it yet.
 */

import { useMemo, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { AppShell } from "../src/components/AppShell";
import { AppText } from "../src/components/AppText";
import { Avatar } from "../src/components/Avatar";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { EmptyState } from "../src/components/EmptyState";
import { Logo } from "../src/components/Logo";
import { SectionCaption } from "../src/components/SectionCaption";
import { useSession } from "../src/lib/auth";
import { indexBy, useEpisodes, usePayments, useTeam } from "../src/lib/data";
import {
  amountToShow,
  earningsFor,
  ESTIMATE_DISCLAIMER,
  money,
  UNIT_LABELS,
  type Payment,
} from "../src/lib/payments.ts";
import { markPaymentPaid, paidToast } from "../src/lib/review-actions.ts";
import { useToast } from "../src/lib/toast";
import { colors, fontFamily, radii, spacing, MIN_TAP_TARGET } from "../src/theme/tokens";
import { type } from "../src/theme/typography";

export default function Payments() {
  const { isAdmin } = useSession();
  return isAdmin ? <AdminPayments /> : <MemberPayments />;
}

// ---------------------------------------------------------------------------
// The admin's side: a queue with a figure to confirm
// ---------------------------------------------------------------------------

function AdminPayments() {
  const router = useRouter();
  const toast = useToast();
  const { isAdmin } = useSession();

  const { data: payments } = usePayments({ enabled: isAdmin });
  const { data: team } = useTeam(isAdmin);
  const { data: episodes } = useEpisodes(isAdmin);

  const byUid = useMemo(() => indexBy(team, (m) => m.uid), [team]);
  const byEpisode = useMemo(() => indexBy(episodes, (e) => e.id), [episodes]);

  const pending = useMemo(
    () =>
      payments
        .filter((p) => p.status === "pending")
        .sort((a, b) => (a.approvedAt?.getTime() ?? 0) - (b.approvedAt?.getTime() ?? 0)),
    [payments]
  );
  const paid = useMemo(
    () =>
      payments
        .filter((p) => p.status === "paid")
        .sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0))
        .slice(0, 20),
    [payments]
  );

  const owed = pending.reduce((sum, p) => sum + (p.estimatedAmount ?? 0), 0);
  const paidTotal = paid.reduce((sum, p) => sum + (p.finalAmount ?? 0), 0);

  return (
    <AppShell
      title="Payments"
      subtitle={
        pending.length === 0
          ? "Nothing waiting"
          : `${pending.length} waiting · ${money(owed)} estimated`
      }
      activeTab="payments"
    >
      <View style={{ padding: spacing.screen, gap: spacing.cardsTight }}>
        {pending.length === 0 ? (
          <EmptyState
            title="No payments waiting"
            detail="A payment opens when you approve somebody's work from the review queue on the Board."
          />
        ) : (
          <SectionCaption>Waiting to be paid</SectionCaption>
        )}

        {pending.map((payment) => (
          <PendingCard
            key={payment.id}
            payment={payment}
            name={byUid.get(payment.uid)?.name ?? "Somebody"}
            episodeCode={byEpisode.get(payment.episodeId)?.code ?? ""}
            onPaid={(amount) => {
              toast(paidToast(byUid.get(payment.uid)?.name ?? "them", money(amount)));
            }}
            onError={(message) => toast(message)}
            onOpenPerson={() => router.push(`/person/${payment.uid}`)}
          />
        ))}

        {paid.length > 0 ? (
          <>
            <SectionCaption style={{ marginTop: 10 }}>
              {`Paid recently · ${money(paidTotal)}`}
            </SectionCaption>
            {paid.map((payment) => (
              <Card key={payment.id} radius={11} style={{ paddingVertical: 11, paddingHorizontal: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.chips }}>
                  <Avatar name={byUid.get(payment.uid)?.name ?? "?"} size={26} variant="light" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="semibold" style={[type.bodySmall]}>
                      {byUid.get(payment.uid)?.name ?? "Somebody"}
                    </AppText>
                    <AppText style={[type.metaXSmall, { color: "rgba(27,26,23,.5)", marginTop: 2 }]}>
                      {`${payment.taskType} · ${byEpisode.get(payment.episodeId)?.code ?? ""}`}
                    </AppText>
                  </View>
                  <AppText weight="semibold" style={[type.bodySmall]}>
                    {money(payment.finalAmount)}
                  </AppText>
                </View>
              </Card>
            ))}
          </>
        ) : null}
      </View>
    </AppShell>
  );
}

function PendingCard({
  payment,
  name,
  episodeCode,
  onPaid,
  onError,
  onOpenPerson,
}: {
  payment: Payment;
  name: string;
  episodeCode: string;
  onPaid: (amount: number) => void;
  onError: (message: string) => void;
  onOpenPerson: () => void;
}) {
  // Pre-filled with the estimate, because most of the time that is the
  // figure — but it is a text field and not a label, because the whole point
  // is that the admin decides.
  const [amount, setAmount] = useState(
    payment.estimatedAmount === null ? "" : String(payment.estimatedAmount)
  );
  const [busy, setBusy] = useState(false);

  const value = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(value) && value >= 0;

  async function pay() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await markPaymentPaid(payment.id, Math.round(value));
      onPaid(Math.round(value));
    } catch (err) {
      onError(err instanceof Error ? err.message : "That did not save.");
      setBusy(false);
    }
  }

  return (
    <Card radius={11} style={{ paddingVertical: 12, paddingHorizontal: 13, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.chips }}>
        <Avatar name={name} size={28} variant="light" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText weight="semibold" style={[type.bodySmall]}>{name}</AppText>
          <AppText style={[type.metaXSmall, { color: "rgba(27,26,23,.5)", marginTop: 2 }]}>
            {`${payment.taskType}${episodeCode ? ` · ${episodeCode}` : ""} · ${UNIT_LABELS[payment.unit]}`}
          </AppText>
        </View>
      </View>

      <WorkingNote payment={payment} />

      {payment.comment ? (
        <AppText style={[type.bodySmall, { color: "rgba(27,26,23,.6)" }]}>
          {`“${payment.comment}”`}
        </AppText>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.chips }}>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="Amount"
          placeholderTextColor="rgba(27,26,23,.35)"
          accessibilityLabel={`Amount to pay ${name}`}
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
          label={busy ? "Saving…" : "Mark paid"}
          radius={radii.cardSmall}
          disabled={!valid || busy}
          onPress={() => void pay()}
          accessibilityLabel={`Mark ${name} paid`}
          style={{ flex: 1 }}
        />
      </View>

      <Button
        label="Open their page"
        variant="quiet"
        radius={radii.cardSmall}
        onPress={onOpenPerson}
        style={{ borderColor: colors.hairlineStrong }}
      />
    </Card>
  );
}

/** "12 min × ₹35 = ₹420", or what there is of it. */
function WorkingNote({ payment }: { payment: Payment }) {
  const parts: string[] = [];
  if (payment.quantity !== null && payment.rate !== null) {
    const noun = payment.unit === "cover" ? "cover" : "min";
    parts.push(`${payment.quantity} ${noun} × ${money(payment.rate)}`);
  }
  if (payment.wordCount !== null) parts.push(`${payment.wordCount.toLocaleString("en-IN")} words`);

  const estimate = amountToShow(payment);
  return (
    <View
      style={{
        backgroundColor: colors.surfaceSunken,
        borderRadius: radii.chipLarge,
        paddingVertical: 9,
        paddingHorizontal: 11,
        flexDirection: "row",
        justifyContent: "space-between",
        gap: spacing.chips,
      }}
    >
      <AppText style={[type.metaXSmall, { color: "rgba(27,26,23,.55)" }]}>
        {parts.length ? parts.join(" · ") : "No rate on file — type the amount"}
      </AppText>
      <AppText weight="semibold" style={[type.metaXSmall]}>
        {estimate === null ? "—" : `est. ${money(estimate)}`}
      </AppText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The member's side: what I have made
// ---------------------------------------------------------------------------

function MemberPayments() {
  const router = useRouter();
  const { user, isApproved } = useSession();
  const { data: payments } = usePayments({ uid: user?.uid, enabled: Boolean(user) && isApproved });

  const summary = useMemo(() => earningsFor(payments), [payments]);
  const ordered = useMemo(
    () =>
      [...payments].sort(
        (a, b) =>
          (b.paidAt?.getTime() ?? b.approvedAt?.getTime() ?? 0) -
          (a.paidAt?.getTime() ?? a.approvedAt?.getTime() ?? 0)
      ),
    [payments]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceAlt }}>
      <ScrollView contentContainerStyle={{ padding: spacing.screen, paddingBottom: 40, gap: spacing.cardsTight }}>
        <View style={{ alignItems: "center", gap: 6, paddingVertical: 10 }}>
          <Logo size={44} />
          <AppText weight="semibold" style={[type.h3]}>Your payments</AppText>
        </View>

        <Card radius={13} style={{ padding: 16, gap: 4 }}>
          <SectionCaption>Paid to you, all time</SectionCaption>
          <AppText weight="semibold" style={{ fontFamily: fontFamily.semibold, fontSize: 30, lineHeight: 36 }}>
            {money(summary.paid)}
          </AppText>
        </Card>

        {summary.pendingCount > 0 ? (
          <Card radius={13} style={{ padding: 16, gap: 8 }}>
            <SectionCaption>
              {`Approved, not yet paid · ${summary.pendingCount}`}
            </SectionCaption>
            <AppText weight="semibold" style={{ fontFamily: fontFamily.semibold, fontSize: 24, lineHeight: 30 }}>
              {summary.pendingIncomplete
                ? `${money(summary.pendingEstimate)}+`
                : money(summary.pendingEstimate)}
            </AppText>

            {/* Not decoration. Somebody who reads an estimate as a promise and
                is paid less has been misled by this screen. */}
            <View
              style={{
                backgroundColor: colors.ink,
                borderRadius: radii.chipLarge,
                paddingVertical: 10,
                paddingHorizontal: 11,
              }}
            >
              <AppText
                weight="semibold"
                style={{
                  fontFamily: fontFamily.semibold,
                  fontSize: 11,
                  lineHeight: 16,
                  color: colors.white,
                }}
              >
                {ESTIMATE_DISCLAIMER}
              </AppText>
            </View>

            {summary.pendingIncomplete ? (
              <AppText style={[type.metaXSmall, { color: "rgba(27,26,23,.5)" }]}>
                Some of these have no rate on file, so they are not in the total at all.
              </AppText>
            ) : null}
          </Card>
        ) : null}

        {ordered.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            detail="A payment appears here once an admin has approved a task you submitted."
          />
        ) : (
          <SectionCaption style={{ marginTop: 6 }}>Every task</SectionCaption>
        )}

        {ordered.map((payment) => (
          <Card key={payment.id} radius={11} style={{ paddingVertical: 11, paddingHorizontal: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.chips }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText weight="semibold" style={[type.bodySmall]}>{payment.taskType}</AppText>
                <AppText style={[type.metaXSmall, { color: "rgba(27,26,23,.5)", marginTop: 2 }]}>
                  {payment.status === "paid" ? "Paid" : "Waiting to be paid"}
                </AppText>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <AppText weight="semibold" style={[type.bodySmall]}>
                  {money(amountToShow(payment))}
                </AppText>
                {payment.status !== "paid" ? (
                  <AppText style={[type.metaXSmall, { color: "rgba(27,26,23,.45)", marginTop: 2 }]}>
                    estimate
                  </AppText>
                ) : null}
              </View>
            </View>
          </Card>
        ))}

        <Button
          label="Back to my tasks"
          variant="quiet"
          onPress={() => router.replace("/my-tasks")}
          style={{ marginTop: 8, borderColor: colors.hairlineStrong }}
        />
      </ScrollView>
    </View>
  );
}
