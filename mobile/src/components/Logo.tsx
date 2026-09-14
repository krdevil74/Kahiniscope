/**
 * The client's mark. The only imagery the product has — the handoff is
 * explicit that no substitute is to be generated.
 */

import { Image, type ImageStyle, type StyleProp } from "react-native";

const SOURCE = require("../../assets/logo.png");

export function Logo({ size, style }: { size: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={SOURCE}
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
      resizeMode="contain"
      accessibilityLabel="Kahiniscope"
    />
  );
}
