/**
 * The 10px uppercase monospace caption that labels each block.
 */

import { View, type ViewStyle } from "react-native";

import { AppText } from "./AppText";
import { colors } from "../theme/tokens";
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
          // .45 was pitched for near-black. The one block that sets onInk is
          // now a violet fill, where it reads as half-erased.
          { color: onInk ? "rgba(255,255,255,.72)" : colors.faint },
        ]}
      >
        {children}
      </AppText>
    </View>
  );
}
