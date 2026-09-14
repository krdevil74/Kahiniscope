/**
 * The initials circle. Ink with yellow letters by default; the light variant
 * is used where the surface is already dark or the person is not yet part of
 * the team.
 */

import { View, type ViewStyle } from "react-native";

import { AppText } from "./AppText";
import { initials as toInitials } from "../lib/format.ts";
import { colors, radii } from "../theme/tokens";
import { fontFamily } from "../theme/tokens";

export interface AvatarProps {
  name: string;
  /** Overrides the derived letters — the brand mark on the master admin card. */
  initials?: string;
  size: number;
  variant?: "ink" | "light" | "yellow";
  style?: ViewStyle;
}

export function Avatar({ name, initials, size, variant = "ink", style }: AvatarProps) {
  const background =
    variant === "ink" ? colors.ink : variant === "yellow" ? colors.brandYellow : colors.fill;
  const foreground = variant === "ink" ? colors.brandYellow : colors.ink;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radii.pill,
          backgroundColor: background,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <AppText
        style={{
          fontFamily: fontFamily.monoSemibold,
          // The prototype scales the letters with the circle: 11px at 32,
          // 12px at 38, 13px at 36-and-light.
          fontSize: Math.max(9, Math.round(size * 0.33)),
          lineHeight: Math.max(9, Math.round(size * 0.33)),
          color: foreground,
        }}
      >
        {initials ?? toInitials(name)}
      </AppText>
    </View>
  );
}
