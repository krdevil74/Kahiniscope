/**
 * The member's three screens, and the way between them.
 *
 * Summary is the landing page — what is outstanding, what has been accepted,
 * what has been paid. Tasks and Payments are the two lists behind it. They
 * used to be two tabs with the summary bolted onto the top of one of them,
 * which made the landing screen answer two questions at once and neither
 * well.
 *
 * The strip sits on the page below the bar, not on it. That gap is not
 * decoration: when the strip was part of the header, the bar's colour and the
 * selected tab's colour were adjacent and bled into each other. Here the
 * selected tab is a white pill on a sunken track, and it never repeats the
 * bar's colour.
 */

import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";

import { AppText } from "./AppText";
import { colors, fontFamily, radii, spacing, MIN_TAP_TARGET } from "../theme/tokens";

export type MemberTab = "summary" | "tasks" | "payments";

const TABS: { key: MemberTab; label: string; href: "/summary" | "/my-tasks" | "/payments" }[] = [
  { key: "summary", label: "Summary", href: "/summary" },
  { key: "tasks", label: "Tasks", href: "/my-tasks" },
  { key: "payments", label: "Payments", href: "/payments" },
];

export function MemberTabs({ active }: { active: MemberTab }) {
  const router = useRouter();

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 5,
        margin: spacing.cardTight,
        marginHorizontal: spacing.screen,
        marginBottom: 0,
        padding: 4,
        borderRadius: radii.pill,
        backgroundColor: colors.surfaceSunken,
        borderWidth: 1,
        borderColor: colors.hairline,
      }}
    >
      {TABS.map((tab) => {
        const on = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            // replace, not push: these are siblings, not a journey. Pushing
            // would build a back stack out of tapping between three tabs.
            onPress={() => (on ? undefined : router.replace(tab.href))}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
            android_ripple={{ color: colors.ripple }}
            style={{
              flex: 1,
              minHeight: MIN_TAP_TARGET - 14,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 9,
              borderRadius: radii.pill,
              backgroundColor: on ? colors.surface : "transparent",
              borderWidth: 1,
              borderColor: on ? colors.hairlineStrong : "transparent",
            }}
          >
            <AppText
              weight="semibold"
              style={{
                fontFamily: on ? fontFamily.bold : fontFamily.semibold,
                fontSize: 11.5,
                lineHeight: 13,
                color: on ? colors.text : colors.muted,
              }}
            >
              {tab.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
