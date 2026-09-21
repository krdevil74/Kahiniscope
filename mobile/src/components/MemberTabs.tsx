/**
 * The member's two screens, and the way between them.
 *
 * A member has no tab bar — their whole app is one list — so until now the
 * only route to the money was a button buried in that list, and the only way
 * back was another button at the bottom of it. Two tabs say plainly that
 * there are two things here.
 */

import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";

import { AppText } from "./AppText";
import { colors, fontFamily, radii, spacing, MIN_TAP_TARGET } from "../theme/tokens";

export type MemberTab = "tasks" | "payments";

export function MemberTabs({ active }: { active: MemberTab }) {
  const router = useRouter();

  const tabs: { key: MemberTab; label: string; href: "/my-tasks" | "/payments" }[] = [
    { key: "tasks", label: "Tasks", href: "/my-tasks" },
    { key: "payments", label: "Payments", href: "/payments" },
  ];

  return (
    <View
      style={{
        flexDirection: "row",
        gap: spacing.chipsTight,
        paddingHorizontal: spacing.screen,
        paddingBottom: spacing.cardTight,
        backgroundColor: colors.ink,
      }}
    >
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            // replace, not push: these are siblings, not a journey. Pushing
            // would build a back stack out of tapping between two tabs.
            onPress={() => (on ? undefined : router.replace(tab.href))}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
            android_ripple={{ color: "rgba(255,255,255,.12)" }}
            style={{
              flex: 1,
              minHeight: MIN_TAP_TARGET - 8,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 9,
              borderRadius: radii.pill,
              backgroundColor: on ? colors.brandYellow : "transparent",
              borderWidth: 1,
              borderColor: on ? colors.brandYellow : "rgba(255,255,255,.22)",
            }}
          >
            <AppText
              weight="semibold"
              style={{
                fontFamily: fontFamily.semibold,
                fontSize: 12,
                lineHeight: 13,
                color: on ? colors.ink : colors.onInkMuted,
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
