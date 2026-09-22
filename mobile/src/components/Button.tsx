/**
 * The three buttons the design uses: yellow for the action being encouraged,
 * ink for the secondary one beside it, outlined for the destructive one.
 *
 * Every variant is padded to a 44px tap target even where the drawn control
 * is smaller — the handoff sets that floor and the compact Nudge buttons sit
 * below it on their own.
 */

import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { AppText } from "./AppText";
import { colors, fontFamily, radii, MIN_TAP_TARGET } from "../theme/tokens";

export type ButtonVariant = "yellow" | "ink" | "outline" | "quiet";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Compact buttons (Nudge) are 8px; full-width primaries are 12px. */
  radius?: number;
  size?: "compact" | "regular" | "large";
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

const PADDING = {
  compact: { paddingVertical: 9, paddingHorizontal: 13, fontSize: 11 },
  regular: { paddingVertical: 11, paddingHorizontal: 14, fontSize: 11.5 },
  large: { paddingVertical: 16, paddingHorizontal: 16, fontSize: 14 },
} as const;

export function Button({
  label,
  onPress,
  variant = "yellow",
  radius,
  size = "regular",
  disabled = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const metrics = PADDING[size];
  // "yellow" is the primary variant's name from the original handoff. The
  // colour it paints is now the brand purple: the yellow belongs to the mark,
  // and a button wearing the logo's colour competes with the logo. The name
  // stays because sixty call sites use it and renaming them would be churn
  // with no reader on the other side.
  const background =
    variant === "yellow" ? colors.brand : variant === "ink" ? colors.bar : colors.surface;
  const foreground =
    variant === "yellow" || variant === "ink"
      ? colors.onBar
      : variant === "quiet"
        ? colors.muted
        : colors.ink;
  const border =
    variant === "outline" ? colors.hairlineStrong : variant === "quiet" ? colors.hairlineStronger : "transparent";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      hitSlop={size === "compact" ? 8 : 0}
      android_ripple={{ color: colors.ripple }}
      style={({ pressed }) => [
        {
          // The primary variant paints its fill with a gradient layer below,
          // so its own background stays clear. Everything else fills flat.
          backgroundColor:
            variant === "yellow"
              ? "transparent"
              : pressed && variant === "ink"
                ? colors.barPressed
                : background,
          overflow: "hidden",
          borderRadius: radius ?? (size === "large" ? radii.buttonLarge : radii.button),
          borderWidth: border === "transparent" ? 0 : 1,
          borderColor: border,
          paddingVertical: metrics.paddingVertical,
          paddingHorizontal: metrics.paddingHorizontal,
          minHeight: size === "large" ? MIN_TAP_TARGET : undefined,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {({ pressed }: { pressed: boolean }) => (
        <>
          {/* Purple into pink, and only here: appearing together is what
              makes this read as the primary action rather than decoration. */}
          {variant === "yellow" ? (
            <LinearGradient
              colors={[...(pressed ? colors.brandGradientPressed : colors.brandGradient)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}

          <View>
            <AppText
              weight="semibold"
              numberOfLines={1}
              style={{
                fontFamily: fontFamily.semibold,
                fontSize: metrics.fontSize,
                lineHeight: metrics.fontSize * 1.15,
                color: foreground,
              }}
            >
              {label}
            </AppText>
          </View>
        </>
      )}
    </Pressable>
  );
}
