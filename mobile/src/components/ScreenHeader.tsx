/**
 * The header every screen wears: ink bar, the 40px mark on the left, the
 * screen title, a monospace subtitle, and — on the screens that are pushed
 * rather than tabbed — a yellow-outlined Back pill on the right.
 */

import { useState } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "./AppText";
import { Logo } from "./Logo";
import { colors, fontFamily, layout, radii, spacing, MIN_TAP_TARGET } from "../theme/tokens";
import { type } from "../theme/typography";

export interface ScreenHeaderProps {
  title: string;
  /** Monospace, 11px, half-opacity white. */
  subtitle?: string;
  /** Episode detail, person detail, Assign and Requests carry a Back pill. */
  onBack?: () => void;
  /**
   * The tabbed screens carry Sign out instead. The two never appear together:
   * a screen you can go back from is one you arrived at from somewhere else,
   * and the way out is behind you.
   */
  onSignOut?: () => void;
  style?: ViewStyle;
}

export function ScreenHeader({ title, subtitle, onBack, onSignOut, style }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  // Two taps, not a dialog. A modal to leave a screen is heavier than the
  // thing it is guarding, and a single tap on a control that sits on every
  // screen would eventually be pressed by accident.
  const [confirming, setConfirming] = useState(false);

  return (
    <View
      style={[
        {
          backgroundColor: colors.ink,
          paddingTop: insets.top + spacing.cardTight,
          paddingBottom: spacing.cardTight,
          paddingHorizontal: spacing.screen,
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.cardTight,
        },
        style,
      ]}
    >
      <Logo size={layout.headerLogo} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText
          weight="semibold"
          numberOfLines={1}
          style={[type.h4, { lineHeight: 18.4, color: colors.white }]}
        >
          {title}
        </AppText>
        {subtitle ? (
          <AppText
            numberOfLines={1}
            style={{
              fontFamily: fontFamily.mono,
              fontSize: 11,
              lineHeight: 14.3,
              color: colors.onInkMuted,
              marginTop: 3,
            }}
          >
            {subtitle}
          </AppText>
        ) : null}
      </View>

      {!onBack && onSignOut ? (
        <Pressable
          onPress={() => {
            if (confirming) {
              setConfirming(false);
              onSignOut();
            } else {
              setConfirming(true);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={confirming ? "Confirm sign out" : "Sign out"}
          accessibilityHint={confirming ? undefined : "Asks you to confirm"}
          hitSlop={8}
          style={({ pressed }) => ({
            minHeight: MIN_TAP_TARGET - 16,
            justifyContent: "center",
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: confirming ? colors.brandYellow : "rgba(255,255,255,.28)",
            backgroundColor: confirming ? colors.brandYellow : "transparent",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <AppText
            style={{
              fontFamily: fontFamily.medium,
              fontSize: 11,
              lineHeight: 11,
              color: confirming ? colors.ink : colors.onInkMuted,
            }}
          >
            {confirming ? "Sure?" : "Sign out"}
          </AppText>
        </Pressable>
      ) : null}

      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={({ pressed }) => ({
            minHeight: MIN_TAP_TARGET - 16,
            justifyContent: "center",
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: "rgba(255,194,10,.4)",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <AppText style={{ fontFamily: fontFamily.medium, fontSize: 11, lineHeight: 11, color: colors.brandYellow }}>
            Back
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
