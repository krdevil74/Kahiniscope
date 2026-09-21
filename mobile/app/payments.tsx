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
import { MemberTabs } from "../src/components/MemberTabs";
import { ScreenHeader } from "../src/components/ScreenHeader";
import { SectionCaption } from "../src/components/SectionCaption";
import { useSession } from "../src/lib/auth";
import { indexBy, useEpisodes, usePayments, useTeam } from "../src/lib/data";
import type { Episode } from "../src/lib/model";
import {
  amountToShow,
  earningsFor,
  ESTIMATE_DISCLAIMER,
  money,
  moreLabel,
  PAGE_SIZE,
  pageOf,
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
            balance={byUid.get(payment.uid)?.balance ?? 0}
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
  balance,
  episodeCode,
  onPaid,
  onError,
  onOpenPerson,
}: {
  payment: Payment;
  name: string;
  balance: number;
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

      {/* If they are carrying an advance, this one did not come off it —
          otherwise it would never have reached the queue. Worth saying, since
          the obvious next thought is "haven't I already paid them?". */}
      {balance > 0 ? (
        <AppText style={[type.metaXSmall, { color: "rgba(27,26,23,.5)" }]}>
          {`${money(balance)} still advanced to ${name.split(" ")[0]} — this was too big to come off it.`}
        </AppText>
      ) : null}

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
  const { user, isApproved, profile } = useSession();
  const { data: payments } = usePayments({ uid: user?.uid, enabled: Boolean(user) && isApproved });
  const { data: episodes } = useEpisodes(isApproved);

  const byEpisode = useMemo(() => indexBy(episodes, (e) => e.id), [episodes]);
  const summary = useMemo(() => earningsFor(payments), [payments]);
  const balance = profile?.balance ?? 0;

  const paid = useMemo(
    () =>
      payments
        .filter((p) => p.status === "paid")
        .sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0)),
    [payments]
  );
  const pending = useMemo(
    () =>
      payments
        .filter((p) => p.status !== "paid")
        .sort((a, b) => (b.approvedAt?.getTime() ?? 0) - (a.approvedAt?.getTime() ?? 0)),
    [payments]
  );

  const [paidShown, setPaidShown] = useState(PAGE_SIZE);
  const [pendingShown, setPendingShown] = useState(PAGE_SIZE);

  const paidPage = pageOf(paid, paidShown);
  const pendingPage = pageOf(pending, pendingShown);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceAlt }}>
      <ScreenHeader title="Payments" subtitle={`${paid.length + pending.length} entries`} />
      <MemberTabs active="payments" />

      <ScrollView contentContainerStyle={{ padding: spacing.screen, paddingBottom: 40, gap: spacing.cardsTight }}>
        {/* The seal. What somebody has actually been paid is the one figure
            worth reading from across a room, and it is the only number on
            this screen that is not an estimate of anything. */}
        <View
          style={{
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 26,
            borderRadius: 999,
            borderWidth: 3,
            borderColor: colors.brandYellow,
            backgroundColor: colors.ink,
            marginBottom: 4,
          }}
        >
          <AppText
            style={{
              fontFamily: fontFamily.monoSemibold,
              fontSize: 9.5,
              lineHeight: 11,
              letterSpacing: 1.6,
              color: colors.brandYellow,
            }}
          >
            TOTAL EARNED
          </AppText>
          <AppText
            weight="semibold"
            style={{
              fontFamily: fontFamily.semibold,
              fontSize: 40,
              lineHeight: 46,
              color: colors.white,
              marginTop: 4,
            }}
          >
            {money(summary.paid)}
          </AppText>
          <AppText
            style={{
              fontFamily: fontFamily.mono,
              fontSize: 10,
              lineHeight: 13,
              color: "rgba(255,255,255,.55)",
            }}
          >
            {`paid across ${paid.length} ${paid.length === 1 ? "task" : "tasks"}`}
          </AppText>
        </View>

        {balance > 0 ? (
          <Card radius={13} style={{ padding: 14, gap: 3, backgroundColor: colors.ink, borderColor: colors.ink }}>
            <AppText
              style={{
                fontFamily: fontFamily.monoMedium,
                fontSize: 9.5,
                lineHeight: 11,
                letterSpacing: 0.6,
                color: "rgba(255,255,255,.6)",
              }}
            >
              AVAILABLE BALANCE
            </AppText>
            <AppText
              weight="semibold"
              style={{ fontFamily: fontFamily.semibold, fontSize: 22, lineHeight: 27, color: colors.white }}
            >
              {money(balance)}
            </AppText>
            <AppText
              style={{
                fontFamily: fontFamily.regular,
                fontSize: 11,
                lineHeight: 15.5,
                color: "rgba(255,255,255,.7)",
              }}
            >
              Advanced to you already. Approved work is paid out of this first.
            </AppText>
          </Card>
        ) : null}

        <SummaryBar
          label="Paid so far"
          amount={money(summary.paid)}
          note={`${paid.length} ${paid.length === 1 ? "task" : "tasks"}`}
          tone="paid"
        />

        {paid.length === 0 ? (
          <EmptyState
            title="Nothing paid yet"
            detail="Once an admin pays for a task you submitted, it appears here."
          />
        ) : null}

        {paidPage.shown.map((payment) => (
          <PaymentRow
            key={payment.id}
            payment={payment}
            episode={byEpisode.get(payment.episodeId)}
          />
        ))}

        {paidPage.hasMore ? (
          <Button
            label={moreLabel(paidPage.hidden)}
            variant="quiet"
            onPress={() => setPaidShown((n) => n + PAGE_SIZE)}
            style={{ borderColor: colors.hairlineStrong }}
          />
        ) : null}

        <SummaryBar
          label="Pending, estimated"
          amount={
            summary.pendingIncomplete
              ? `${money(summary.pendingEstimate)}+`
              : money(summary.pendingEstimate)
          }
          note={`${pending.length} ${pending.length === 1 ? "task" : "tasks"}`}
          tone="pending"
        />

        {pending.length > 0 ? (
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
        ) : null}

        {pendingPage.shown.map((payment) => (
          <PaymentRow
            key={payment.id}
            payment={payment}
            episode={byEpisode.get(payment.episodeId)}
          />
        ))}

        {pendingPage.hasMore ? (
          <Button
            label={moreLabel(pendingPage.hidden)}
            variant="quiet"
            onPress={() => setPendingShown((n) => n + PAGE_SIZE)}
            style={{ borderColor: colors.hairlineStrong }}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

/** The horizontal bar that heads each half of the list. */
function SummaryBar({
  label,
  amount,
  note,
  tone,
}: {
  label: string;
  amount: string;
  note: string;
  tone: "paid" | "pending";
}) {
  return (
    <View
      style={{
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.chips,
        backgroundColor: tone === "paid" ? colors.brandYellow : colors.surfaceSunken,
        borderWidth: 1,
        borderColor: tone === "paid" ? colors.brandYellow : colors.hairlineStrong,
        borderRadius: radii.chipLarge,
        paddingVertical: 11,
        paddingHorizontal: 13,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText weight="semibold" style={{ fontFamily: fontFamily.semibold, fontSize: 12.5, lineHeight: 15 }}>
          {label}
        </AppText>
        <AppText
          style={{
            fontFamily: fontFamily.mono,
            fontSize: 10,
            lineHeight: 13,
            color: "rgba(27,26,23,.55)",
            marginTop: 2,
          }}
        >
          {note}
        </AppText>
      </View>
      <AppText weight="semibold" style={{ fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 20 }}>
        {amount}
      </AppText>
    </View>
  );
}

/**
 * One entry. Both the episode and the kind of work are on it: "Voice
 * recording" alone does not tell somebody which of the eleven they did.
 */
function PaymentRow({ payment, episode }: { payment: Payment; episode?: Episode }) {
  return (
    <Card radius={11} style={{ paddingVertical: 11, paddingHorizontal: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.chips }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText weight="semibold" style={[type.bodySmall]}>
            {payment.taskType}
          </AppText>
          {/* Bengali title: AppText gives it Noto Sans Bengali. */}
          <AppText
            numberOfLines={1}
            style={{
              fontFamily: fontFamily.regular,
              fontSize: 11.5,
              lineHeight: 16,
              color: "rgba(27,26,23,.6)",
              marginTop: 2,
            }}
          >
            {[episode?.code, episode?.title].filter(Boolean).join(" · ") || "No episode"}
          </AppText>
          <AppText
            style={{
              fontFamily: fontFamily.mono,
              fontSize: 10,
              lineHeight: 13,
              color: "rgba(27,26,23,.45)",
              marginTop: 3,
            }}
          >
            {payment.status !== "paid"
              ? "Waiting to be paid"
              : payment.settledFromAdvance
                ? "Paid from your advance"
                : "Paid"}
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
  );
}
