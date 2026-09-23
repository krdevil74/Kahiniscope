/**
 * The "+": 54px, 18px from the right, 96px from the bottom.
 *
 * Violet rather than yellow. Yellow is the logo's, and a 54px yellow circle
 * floating over every screen was the brightest thing in the app — brighter
 * than the mark it was borrowing from.
 *
 * It appears on Board, Episodes, episode detail, Team and person detail, and
 * nowhere else — on Assign, Requests and Notify it would cover the controls.
 */

import { Pressable } from "react-native";

import { AppText } from "./AppText";
import { colors, fontFamily, layout, radii } from "../theme/tokens";

export function FloatingAdd({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Assign a task"
      android_ripple={{ color: colors.rippleStrong, borderless: true }}
      style={({ pressed }) => ({
        position: "absolute",
        right: layout.fabRight,
        bottom: layout.fabBottom,
        zIndex: 66,
        width: layout.fab,
        height: layout.fab,
        borderRadius: radii.pill,
        backgroundColor: pressed ? colors.brandPressed : colors.brand,
        alignItems: "center",
        justifyContent: "center",
        elevation: 6,
        shadowColor: colors.ink,
        shadowOpacity: 0.32,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 8 },
      })}
    >
      <AppText
        style={{
          fontFamily: fontFamily.regular,
          fontSize: 30,
          lineHeight: 34,
          color: colors.onBar,
        }}
      >
        +
      </AppText>
    </Pressable>
  );
}
