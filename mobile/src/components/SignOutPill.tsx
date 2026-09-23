/**
 * The way out, in two taps.
 *
 * Shared by the admin header and the member header. Two taps rather than a
 * dialog: a modal to leave a screen is heavier than the thing it is guarding,
 * and a single tap on a control that sits on every screen would eventually be
 * pressed by accident — so the first tap turns it into "Sure?" and the second
 * one goes.
 */

import { useState } from "react";
import { Pressable } from "react-native";

import { AppText } from "./AppText";
import { colors, fontFamily, radii, MIN_TAP_TARGET } from "../theme/tokens";

export function SignOutPill({ onSignOut }: { onSignOut: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
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
        borderColor: confirming ? colors.brandFill : colors.onInkMuted,
        backgroundColor: confirming ? colors.brandFill : "transparent",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <AppText
        style={{
          fontFamily: fontFamily.medium,
          fontSize: 11,
          lineHeight: 11,
          color: confirming ? colors.white : colors.onInkMuted,
        }}
      >
        {confirming ? "Sure?" : "Sign out"}
      </AppText>
    </Pressable>
  );
}
