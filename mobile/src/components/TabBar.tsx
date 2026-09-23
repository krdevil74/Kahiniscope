/**
 * The bottom bar: five items on the near-black bar, a violet dot above the
 * active label.
 *
 * Episode detail counts as Episodes and person detail counts as Team, so the
 * bar never goes blank when a screen is pushed on top of a tab.
 */

import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "./AppText";
import { colors, fontFamily, radii } from "../theme/tokens";

export interface TabItem {
  key: string;
  label: string;
  onPress: () => void;
}

export function TabBar({ items, active }: { items: TabItem[]; active: string }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 65,
        backgroundColor: colors.bar,
        paddingTop: 11,
        paddingHorizontal: 10,
        // The design's 30px bottom padding is the gesture bar's space; on a
        // device that reports its own inset, use that instead.
        paddingBottom: Math.max(insets.bottom, 14) + 8,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      {items.map((item) => {
        const on = item.key === active;
        return (
          <Pressable
            key={item.key}
            onPress={item.onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={item.label}
            style={{
              flex: 1,
              alignItems: "center",
              gap: 6,
              paddingVertical: 4,
              // Reaches the 44px floor with the bar's own padding.
              minHeight: 34,
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: radii.pill,
                // The fill, not the text violet: #7B3FD4 is pitched to be
                // read on white, and on a near-black bar a 7px dot of it is
                // nearly invisible.
                backgroundColor: on ? colors.brandFill : "transparent",
              }}
            />
            <AppText
              style={{
                fontFamily: fontFamily.medium,
                fontSize: 10,
                lineHeight: 10,
                color: on ? colors.white : "rgba(255,255,255,.45)",
              }}
            >
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
