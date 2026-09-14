/**
 * A filled bar. Used for the 3px heat bar on a chase card, the 6px episode
 * bar, and the 7px slate and episode-completion bars.
 */

import { View, type ViewStyle } from "react-native";

import { colors, radii } from "../theme/tokens";

export interface ProgressBarProps {
  /** 0–1. */
  value: number;
  height: number;
  fill?: string;
  track?: string;
  /** The 3px heat bar has square ends; every other bar is a pill. */
  rounded?: boolean;
  style?: ViewStyle;
}

export function ProgressBar({
  value,
  height,
  fill = colors.ink,
  track = colors.fill,
  rounded = true,
  style,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View
      style={[
        {
          height,
          backgroundColor: track,
          borderRadius: rounded ? radii.pill : 0,
          overflow: "hidden",
          flexDirection: "row",
        },
        style,
      ]}
    >
      <View style={{ width: `${clamped * 100}%`, backgroundColor: fill }} />
    </View>
  );
}
