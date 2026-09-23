/**
 * The member's landing page.
 *
 * Their app used to open on a list of tasks, which answers "what is next"
 * and nothing else. The questions somebody actually opens this app with are
 * how much is outstanding, how much has been accepted, and what they have
 * been paid — and none of those could be read without scrolling and counting.
 *
 * So the list moved to its own tab and this took its place: three counts,
 * three figures, and six months of shape. Nothing here is stored; it is all
 * counted from the snapshot on screen, because two figures that can disagree
 * are worse than one that has to be derived.
 */

import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { Redirect } from "expo-router";

import { ActivityChart } from "../src/components/ActivityChart";
import { AppText } from "../src/components/AppText";
import { Card } from "../src/components/Card";
import { MemberHeader } from "../src/components/MemberHeader";
import { MemberTabs } from "../src/components/MemberTabs";
import { SectionCaption } from "../src/components/SectionCaption";
import { useSession } from "../src/lib/auth";
import { useNow, usePayments, useTasks } from "../src/lib/data";
import { memberSummary, monthlyActivity } from "../src/lib/member-summary.ts";
import { money } from "../src/lib/payments.ts";
import { colors, fontFamily, radii, spacing } from "../src/theme/tokens";

export default function Summary() {
  const { user, profile, isApproved, isAdmin, loading } = useSession();
  const now = useNow();

  const uid = user?.uid ?? "";
  const enabled = isApproved && Boolean(uid);

  const { data: tasks } = useTasks({ assigneeUid: uid, enabled });
  const { data: payments } = usePayments({ uid, enabled });

  const summary = useMemo(() => memberSummary(tasks, payments, now), [tasks, payments, now]);
  const activity = useMemo(() => monthlyActivity(tasks, now), [tasks, now]);

  if (!loading && !user) return <Redirect href="/sign-in" />;
  if (!loading && isAdmin) return <Redirect href="/board" />;
  if (!loading && user && !isApproved) return <Redirect href="/pending" />;

  const balance = profile?.balance ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <MemberHeader
        title={`Hi ${(profile?.name ?? "").trim().split(/\s+/)[0] || "there"}`}
        subtitle={now.toDateString()}
      />
      <MemberTabs active="summary" />

      <ScrollView
        contentContainerStyle={{ padding: spacing.screen, paddingBottom: 40, gap: spacing.cardsTight }}
        showsVerticalScrollIndicator={false}
      >
        {/* The three counts, each in the colour of what it means. */}
        <View style={{ flexDirection: "row", gap: spacing.chipsTight }}>
          <Count label="Pending" value={summary.pending} fill={colors.attentionSoft} tone={colors.attention} />
          <Count label="Submitted" value={summary.submitted} fill={colors.infoSoft} tone={colors.info} />
          <Count label="Approved" value={summary.approved} fill={colors.moneySoft} tone={colors.money} />
        </View>

        {/* Money that exists. The one figure on the member's side that is not
            an estimate of anything, so it gets the loudest block on screen. */}
        <View style={{ backgroundColor: colors.moneyFill, borderRadius: radii.cardHero, padding: 18 }}>
          <AppText
            style={{
              fontFamily: fontFamily.monoMedium,
              fontSize: 9.5,
              lineHeight: 11,
              letterSpacing: 1.2,
              color: "rgba(6,70,60,.85)",
            }}
          >
            EARNED, ALL TIME
          </AppText>
          <AppText
            weight="semibold"
            style={{
              fontFamily: fontFamily.extrabold,
              fontSize: 40,
              lineHeight: 44,
              letterSpacing: -2,
              color: colors.onMoneyFill,
              marginTop: 5,
            }}
          >
            {money(summary.paidAllTime)}
          </AppText>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.chipsTight }}>
          <Figure
            label="Pending est."
            value={
              summary.paymentPendingPartial
                ? `${money(summary.paymentPending)}+`
                : money(summary.paymentPending)
            }
            fill={colors.heatSoft}
            tone={colors.heat}
          />
          <Figure label="30 days" value={money(summary.paidLastMonth)} fill={colors.surfaceSunken} tone={colors.ink} />
          <Figure label="12 months" value={money(summary.paidLastYear)} fill={colors.surfaceSunken} tone={colors.ink} />
        </View>

        {balance > 0 ? (
          <View
            style={{
              backgroundColor: colors.brandSoft,
              borderRadius: radii.card,
              padding: 14,
              gap: 3,
            }}
          >
            <AppText
              style={{
                fontFamily: fontFamily.monoMedium,
                fontSize: 9.5,
                lineHeight: 11,
                letterSpacing: 1.2,
                color: colors.brand,
              }}
            >
              AVAILABLE BALANCE
            </AppText>
            <AppText
              weight="semibold"
              style={{ fontFamily: fontFamily.bold, fontSize: 22, lineHeight: 27, color: colors.brand }}
            >
              {money(balance)}
            </AppText>
            <AppText style={{ fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 15.5, color: colors.muted }}>
              Advanced to you already. Approved work is paid out of this first.
            </AppText>
          </View>
        ) : null}

        <Card radius={radii.cardHero} style={{ padding: 14, gap: 12 }}>
          <SectionCaption>Last six months</SectionCaption>
          <ActivityChart months={activity} />
        </Card>
      </ScrollView>
    </View>
  );
}

function Count({
  label,
  value,
  fill,
  tone,
}: {
  label: string;
  value: number;
  fill: string;
  tone: string;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: fill, borderRadius: radii.card, padding: 13 }}>
      <AppText
        style={{
          fontFamily: fontFamily.monoMedium,
          fontSize: 9.5,
          lineHeight: 11,
          letterSpacing: 0.9,
          textTransform: "uppercase",
          color: tone,
        }}
      >
        {label}
      </AppText>
      <AppText
        weight="semibold"
        style={{
          fontFamily: fontFamily.extrabold,
          fontSize: 28,
          lineHeight: 32,
          letterSpacing: -1.2,
          color: tone,
          marginTop: 3,
        }}
      >
        {String(value)}
      </AppText>
    </View>
  );
}

function Figure({
  label,
  value,
  fill,
  tone,
}: {
  label: string;
  value: string;
  fill: string;
  tone: string;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: fill, borderRadius: radii.card, padding: 13 }}>
      <AppText
        style={{
          fontFamily: fontFamily.monoMedium,
          fontSize: 9.5,
          lineHeight: 11,
          letterSpacing: 0.9,
          textTransform: "uppercase",
          color: tone === colors.ink ? colors.faint : tone,
        }}
      >
        {label}
      </AppText>
      <AppText
        weight="semibold"
        style={{
          fontFamily: fontFamily.extrabold,
          fontSize: 19,
          lineHeight: 23,
          letterSpacing: -0.7,
          color: tone,
          marginTop: 3,
        }}
      >
        {value}
      </AppText>
    </View>
  );
}
