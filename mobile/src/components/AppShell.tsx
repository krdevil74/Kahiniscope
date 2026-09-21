/**
 * The frame every admin screen sits in: the ink header, a scrolling body, the
 * bottom bar, and — on the five screens that allow it — the floating "+".
 *
 * The bar is drawn over the content rather than beside it, because in the
 * design it stays put on pushed screens too: episode detail still reads as
 * Episodes, person detail still reads as Team.
 */

import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { Redirect, useRouter } from "expo-router";

import { FloatingAdd } from "./FloatingAdd";
import { ScreenHeader } from "./ScreenHeader";
import { TabBar, type TabItem } from "./TabBar";
import { useSession } from "../lib/auth";
import { colors } from "../theme/tokens";

export type TabKey = "board" | "episodes" | "team" | "payments" | "notify";

export interface AppShellProps {
  title: string;
  subtitle: string;
  /** Which tab lights up. Pushed screens name the tab they belong to. */
  activeTab: TabKey;
  children: ReactNode;
  /** Board, Episodes, episode detail, Team and person detail only. */
  showFab?: boolean;
  onBack?: () => void;
  /** Where the "+" goes. Episode and person detail prefill what is known. */
  assignHref?: string;
  /** Screens that manage their own scrolling (none yet) opt out. */
  scroll?: boolean;
}

export function AppShell({
  title,
  subtitle,
  activeTab,
  children,
  showFab = false,
  onBack,
  assignHref = "/assign",
  scroll = true,
}: AppShellProps) {
  const router = useRouter();
  const { isAdmin, loading } = useSession();

  // The rules would refuse the reads anyway; this keeps a member from ever
  // seeing an empty admin screen if they somehow land on one.
  if (!loading && !isAdmin) return <Redirect href="/my-tasks" />;

  const tabs: TabItem[] = [
    { key: "board", label: "Board", onPress: () => router.replace("/board") },
    { key: "episodes", label: "Episodes", onPress: () => router.replace("/episodes") },
    { key: "team", label: "Team", onPress: () => router.replace("/team") },
    { key: "payments", label: "Payments", onPress: () => router.replace("/payments") },
    { key: "notify", label: "Notify", onPress: () => router.replace("/notify") },
  ];

  // Clear of the bar, and of the "+" when it is there.
  const bottomPadding = showFab ? 164 : 110;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceAlt }}>
      <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} />

      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: bottomPadding }}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}

      {showFab ? <FloatingAdd onPress={() => router.push(assignHref as never)} /> : null}
      <TabBar items={tabs} active={activeTab} />
    </View>
  );
}
