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
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { AppShell } from "../src/components/AppShell";
import { AppText } from "../src/components/AppText";
import { Avatar } from "../src/components/Avatar";
import { Button } from "../src/components/Button";
import { Card } from "../src/components/Card";
import { EmptyState } from "../src/components/EmptyState";
import { MemberHeader } from "../src/components/MemberHeader";
import { MemberTabs } from "../src/components/MemberTabs";
import { PaidStamp } from "../src/components/PaidStamp";
import { Ribbon, RibbonInfo } from "../src/components/Ribbon";
import { SectionCaption } from "../src/components/SectionCaption";
import { useSession } from "../src/lib/auth";
import { indexBy, useEpisodes, usePayments, useTeam } from "../src/lib/data";
import type { Episode } from "../src/lib/model";
import {
  amountToShow,
  breakdownOf,
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
                    <AppText style={[type.metaXSmall, { color: colors.faint, marginTop: 2 }]}>
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
          <AppText style={[type.metaXSmall, { color: colors.faint, marginTop: 2 }]}>
            {`${payment.taskType}${episodeCode ? ` · ${episodeCode}` : ""} · ${UNIT_LABELS[payment.unit]}`}
          </AppText>
        </View>
      </View>

      <WorkingNote payment={payment} />

      {/* If they are carrying an advance, this one did not come off it —
          otherwise it would never have reached the queue. Worth saying, since
          the obvious next thought is "haven't I already paid them?". */}
      {balance > 0 ? (
        <AppText style={[type.metaXSmall, { color: colors.faint }]}>
          {`${money(balance)} still advanced to ${name.split(" ")[0]} — this was too big to come off it.`}
        </AppText>
      ) : null}

      {payment.comment ? (
        <AppText style={[type.bodySmall, { color: colors.muted }]}>
          {`“${payment.comment}”`}
        </AppText>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.chips }}>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="Amount"
          placeholderTextColor={colors.faint}
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
      <AppText style={[type.metaXSmall, { color: colors.muted }]}>
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
  const { user, isApproved } = useSession();
  const { data: payments } = usePayments({ uid: user?.uid, enabled: Boolean(user) && isApproved });
  const { data: episodes } = useEpisodes(isApproved);

  const byEpisode = useMemo(() => indexBy(episodes, (e) => e.id), [episodes]);
  const summary = useMemo(() => earningsFor(payments), [payments]);

  const paid = useMemo(
    () =>
      payments
        .filter((p) => p.status === "paid")
        .sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0)),
    [payments]
  );
  const upcoming = useMemo(
    () =>
      payments
        .filter((p) => p.status !== "paid")
        .sort((a, b) => (b.approvedAt?.getTime() ?? 0) - (a.approvedAt?.getTime() ?? 0)),
    [payments]
  );

  const [paidShown, setPaidShown] = useState(PAGE_SIZE);
  const [upcomingShown, setUpcomingShown] = useState(PAGE_SIZE);
  const [explaining, setExplaining] = useState(false);

  const paidPage = pageOf(paid, paidShown);
  const upcomingPage = pageOf(upcoming, upcomingShown);

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <MemberHeader title="Payments" subtitle={`${payments.length} entries`} />
      <MemberTabs active="payments" />

      <ScrollView
        contentContainerStyle={{ padding: spacing.screen, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* The total, clean, with the stamp beside it. Everything else on
            this screen is a row; this is the one thing read at a glance. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 4 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText
              style={{
                fontFamily: fontFamily.monoMedium,
                fontSize: 9.5,
                lineHeight: 11,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: colors.faint,
              }}
            >
              Total paid to you
            </AppText>
            <AppText
              weight="semibold"
              style={{
                fontFamily: fontFamily.extrabold,
                fontSize: 40,
                lineHeight: 44,
                letterSpacing: -2,
                marginTop: 6,
              }}
            >
              {money(summary.paid)}
            </AppText>
            <AppText
              style={{
                fontFamily: fontFamily.mono,
                fontSize: 10,
                lineHeight: 13,
                color: colors.faint,
                marginTop: 6,
              }}
            >
              {`across ${paid.length} ${paid.length === 1 ? "task" : "tasks"}`}
            </AppText>
          </View>
          {/* Only once there is something to stamp. A PAID mark over ₹0 is a
              claim about money that has not moved. */}
          {paid.length > 0 ? <PaidStamp /> : null}
        </View>

        <Ribbon label="Paid tasks" tone={colors.money} />

        {paid.length === 0 ? (
          <EmptyState
            title="Nothing paid yet"
            detail="Once an admin pays for a task you submitted, it appears here."
          />
        ) : null}

        {paidPage.shown.map((payment) => (
          <PaymentRow key={payment.id} payment={payment} episode={byEpisode.get(payment.episodeId)} />
        ))}

        {paidPage.hasMore ? (
          <Button
            label={moreLabel(paidPage.hidden)}
            variant="quiet"
            style={{ marginTop: spacing.cardsTight, borderColor: colors.hairlineStrong }}
            onPress={() => setPaidShown((n) => n + PAGE_SIZE)}
          />
        ) : null}

        <Ribbon
          label="Upcoming payments"
          tone={colors.heat}
          action={
            <Pressable
              onPress={() => setExplaining((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Why these amounts are estimates"
              accessibilityState={{ expanded: explaining }}
              hitSlop={10}
            >
              <RibbonInfo />
            </Pressable>
          }
        />

        {/* The caveat lives behind the (i) rather than sitting on screen
            permanently — it is important the first time and furniture after. */}
        {explaining ? (
          <View
            style={{
              backgroundColor: colors.bar,
              borderRadius: radii.card,
              padding: 14,
              marginTop: spacing.cardsTight,
            }}
          >
            <AppText
              weight="semibold"
              style={{ fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 15, color: colors.white }}
            >
              Why “estimated”?
            </AppText>
            <AppText
              style={{
                fontFamily: fontFamily.regular,
                fontSize: 11,
                lineHeight: 17,
                color: "rgba(255,255,255,.78)",
                marginTop: 4,
              }}
            >
              {ESTIMATE_DISCLAIMER}
            </AppText>
          </View>
        ) : null}

        {upcoming.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            detail="Work an admin has approved but not yet paid for appears here."
          />
        ) : null}

        {upcomingPage.shown.map((payment) => (
          <PaymentRow key={payment.id} payment={payment} episode={byEpisode.get(payment.episodeId)} />
        ))}

        {upcomingPage.hasMore ? (
          <Button
            label={moreLabel(upcomingPage.hidden)}
            variant="quiet"
            style={{ marginTop: spacing.cardsTight, borderColor: colors.hairlineStrong }}
            onPress={() => setUpcomingShown((n) => n + PAGE_SIZE)}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * One entry. Both the episode and the kind of work are on it: "Voice
 * recording" alone does not tell somebody which of the eleven they did.
 */
function PaymentRow({ payment, episode }: { payment: Payment; episode?: Episode }) {
  const [open, setOpen] = useState(false);
  const detail = breakdownOf(payment);

  return (
    <Card radius={11} style={{ paddingVertical: 11, paddingHorizontal: 12 }}>
      {/* The amount is the question and the working is the answer, so the
          answer is one tap away rather than on screen for every row. */}
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${payment.taskType}, ${detail.total}. ${open ? "Hide" : "Show"} how it was worked out`}
        android_ripple={{ color: colors.ripple }}
        style={{ flexDirection: "row", alignItems: "center", gap: spacing.chips }}
      >
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
              color: colors.muted,
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
              color: payment.status === "paid" ? colors.money : colors.faint,
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
            {detail.total}
          </AppText>
          <AppText style={[type.metaXSmall, { color: colors.faint, marginTop: 2 }]}>
            {payment.status !== "paid" ? "estimate" : open ? "hide" : "how?"}
          </AppText>
        </View>
      </Pressable>

      {open ? (
        <View
          style={{
            marginTop: 11,
            paddingTop: 11,
            borderTopWidth: 1,
            borderTopColor: colors.hairline,
            gap: 7,
          }}
        >
          {detail.working ? (
            <>
              <BreakdownLine label="Rate" value={detail.rate ?? "—"} />
              <BreakdownLine label="Work" value={detail.quantity ?? "—"} />
              <BreakdownLine label={detail.working} value={detail.total} emphasis />
            </>
          ) : (
            <BreakdownLine label="Amount" value={detail.total} emphasis />
          )}

          {detail.note ? (
            <AppText style={[type.metaXSmall, { color: colors.faint, lineHeight: 15 }]}>
              {detail.note}
            </AppText>
          ) : null}

          {/* What the admin said when they approved it. Worth surfacing:
              it is the only feedback most work ever gets. */}
          {payment.comment ? (
            <View
              style={{
                marginTop: 4,
                backgroundColor: colors.surfaceSunken,
                borderRadius: radii.chipLarge,
                paddingVertical: 9,
                paddingHorizontal: 10,
              }}
            >
              <AppText style={[type.metaXSmall, { color: colors.faint }]}>
                Note from the admin
              </AppText>
              <AppText style={[type.bodySmall, { color: colors.muted, marginTop: 3 }]}>
                {`“${payment.comment}”`}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function BreakdownLine({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.chips }}>
      <AppText
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: emphasis ? fontFamily.monoMedium : fontFamily.mono,
          fontSize: 10.5,
          lineHeight: 14,
          color: emphasis ? colors.ink : colors.muted,
        }}
      >
        {label}
      </AppText>
      <AppText
        weight={emphasis ? "semibold" : "regular"}
        style={{
          fontFamily: emphasis ? fontFamily.semibold : fontFamily.mono,
          fontSize: emphasis ? 13 : 11,
          lineHeight: 15,
          color: emphasis ? colors.money : colors.ink,
        }}
      >
        {value}
      </AppText>
    </View>
  );
}
