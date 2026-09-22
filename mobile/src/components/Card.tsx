/**
 * White, hairline border, 12px radius — the card every list is made of.
 */

import { Pressable, View, type ViewStyle } from "react-native";
import type { ReactNode } from "react";

import { colors, radii } from "../theme/tokens";

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  /** Set when the card has something running edge to edge, like a heat bar. */
  clip?: boolean;
  radius?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

export function Card({ children, onPress, clip = false, radius = radii.card, style, accessibilityLabel }: CardProps) {
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius,
    overflow: clip ? "hidden" : "visible",
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: colors.ripple }}
      style={({ pressed }) => [base, { borderColor: pressed ? colors.brand : colors.hairline }, style]}
    >
      {children}
    </Pressable>
  );
}
