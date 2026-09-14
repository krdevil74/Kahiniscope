/**
 * The 10px uppercase monospace caption that labels each block.
 */

import { View, type ViewStyle } from "react-native";

import { AppText } from "./AppText";
import { type } from "../theme/typography";

export function SectionCaption({
  children,
  onInk = false,
  style,
}: {
  children: string;
  onInk?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View style={style}>
      <AppText
        style={[
          type.caption,
          { color: onInk ? "rgba(255,255,255,.45)" : "rgba(27,26,23,.45)" },
        ]}
      >
        {children}
      </AppText>
    </View>
  );
}
