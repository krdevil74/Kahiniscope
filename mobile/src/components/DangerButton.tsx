/**
 * Something irreversible, in two taps.
 *
 * The same idea as SignOutPill and for the same reason: a modal to confirm is
 * heavier than the thing it guards, and this app has no dialogs anywhere else.
 * The first tap arms the control and changes what it says; the second does it.
 *
 * Arming times out. A button left reading "tap again" halfway down a screen is
 * a trap for the next thumb that lands near it, so it goes back to resting on
 * its own after a few seconds.
 *
 * When it cannot be used it is still drawn, greyed, with the reason underneath.
 * A control that vanishes leaves somebody looking for it; one that says
 * "approved work cannot be deleted — there is a payment against it" has
 * answered the question.
 */

import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { AppText } from "./AppText";
import { colors, fontFamily, radii, MIN_TAP_TARGET } from "../theme/tokens";
import { type } from "../theme/typography";

/** Long enough to read the armed label, short enough not to lie in wait. */
const ARMED_MS = 4000;

export function DangerButton({
  label,
  armedLabel,
  busyLabel = "Deleting…",
  disabled = false,
  reason = null,
  busy = false,
  onConfirm,
  accessibilityLabel,
}: {
  label: string;
  armedLabel: string;
  busyLabel?: string;
  disabled?: boolean;
  /** Why it is greyed out. Shown under the button. */
  reason?: string | null;
  busy?: boolean;
  onConfirm: () => void;
  accessibilityLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!armed) return;
    timer.current = setTimeout(() => setArmed(false), ARMED_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [armed]);

  const inert = disabled || busy;
  const text = busy ? busyLabel : armed ? armedLabel : label;

  return (
    <View style={{ gap: 5 }}>
      <Pressable
        onPress={() => {
          if (inert) return;
          if (armed) {
            setArmed(false);
            onConfirm();
          } else {
            setArmed(true);
          }
        }}
        disabled={inert}
        accessibilityRole="button"
        accessibilityState={{ disabled: inert }}
        accessibilityLabel={accessibilityLabel ?? text}
        accessibilityHint={armed || inert ? undefined : "Asks you to confirm"}
        style={({ pressed }) => ({
          minHeight: MIN_TAP_TARGET,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 14,
          borderRadius: radii.cardSmall,
          borderWidth: 1,
          // Armed is the only state that fills: a resting destructive control
          // should not be the loudest thing on the screen.
          borderColor: inert ? colors.hairlineStrong : colors.attention,
          backgroundColor: armed && !inert ? colors.attention : colors.surface,
          opacity: pressed && !inert ? 0.75 : 1,
        })}
      >
        <AppText
          weight="medium"
          style={{
            fontFamily: fontFamily.medium,
            fontSize: 12,
            lineHeight: 15,
            color: inert ? colors.faint : armed ? colors.white : colors.attention,
          }}
        >
          {text}
        </AppText>
      </Pressable>

      {reason ? (
        <AppText style={[type.metaXSmall, { color: colors.faint, lineHeight: 15 }]}>
          {reason}
        </AppText>
      ) : null}
    </View>
  );
}
