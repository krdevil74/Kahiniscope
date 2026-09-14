/**
 * The escalation badge: "On track", "Reminded", "Chasing", "Escalated",
 * "Daily" — or "Done", which is green and outside the scale entirely.
 */

import { View, type ViewStyle } from "react-native";

import { AppText } from "./AppText";
import { colors, fontFamily, heatFor, radii } from "../theme/tokens";

export interface HeatBadgeProps {
  /** Escalation step. Ignored when `done`. */
  step: number;
  done?: boolean;
  /** Overrides the scale's own word — "2 overdue", "3 open", "Clear". */
  label?: string;
  style?: ViewStyle;
}

export function HeatBadge({ step, done = false, label, style }: HeatBadgeProps) {
  const heat = heatFor(step);
  const background = done ? colors.successBg : heat.bg;
  const foreground = done ? colors.successFg : heat.fg;

  return (
    <View
      style={[
        {
          backgroundColor: background,
          borderRadius: radii.badge,
          paddingVertical: 5,
          paddingHorizontal: 7,
        },
        style,
      ]}
    >
      <AppText
        style={{
          fontFamily: fontFamily.monoSemibold,
          fontSize: 9.5,
          lineHeight: 11,
          letterSpacing: 0.76,
          textTransform: "uppercase",
          color: foreground,
        }}
      >
        {label ?? (done ? "Done" : heat.label)}
      </AppText>
    </View>
  );
}
