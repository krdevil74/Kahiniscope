/**
 * Light, Dark, System. Three pills, because "System" is the one most people
 * want and an app offering only two cannot express it.
 */

import { Pressable, View } from "react-native";

import { AppText } from "./AppText";
import { useTheme, type ThemePreference } from "../theme/theme.tsx";
import { colors, fontFamily, radii, MIN_TAP_TARGET } from "../theme/tokens";

const OPTIONS: { key: ThemePreference; label: string }[] = [
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
  { key: "system", label: "System" },
];

export function ThemePicker() {
  const { preference, setPreference } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 5,
        padding: 4,
        borderRadius: radii.pill,
        backgroundColor: colors.surfaceSunken,
        borderWidth: 1,
        borderColor: colors.hairline,
      }}
    >
      {OPTIONS.map((option) => {
        const on = option.key === preference;
        return (
          <Pressable
            key={option.key}
            onPress={() => setPreference(option.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${option.label} theme`}
            style={{
              flex: 1,
              minHeight: MIN_TAP_TARGET - 12,
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
              weight={on ? "semibold" : "regular"}
              style={{
                fontFamily: on ? fontFamily.semibold : fontFamily.regular,
                fontSize: 11.5,
                lineHeight: 13,
                color: on ? colors.text : colors.muted,
              }}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
