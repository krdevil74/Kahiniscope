/**
 * The header every screen wears: ink bar, the 40px mark on the left, the
 * screen title, a monospace subtitle, and — on the screens that are pushed
 * rather than tabbed — a yellow-outlined Back pill on the right.
 */

import { Pressable, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "./AppText";
import { SignOutPill } from "./SignOutPill";
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

  return (
    <View
      style={[
        {
          backgroundColor: colors.bar,
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

      {!onBack && onSignOut ? <SignOutPill onSignOut={onSignOut} /> : null}

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
          <AppText style={{ fontFamily: fontFamily.medium, fontSize: 11, lineHeight: 11, color: colors.brand }}>
            Back
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
