/**
 * The rubber stamp beside the total.
 *
 * Drawn rather than shipped as an image: it stays sharp at any screen
 * density, costs no asset, and takes its colour from the palette. A real
 * distressed-ink texture would need artwork, and a faked one looks like a
 * filter.
 *
 * It is not decoration for its own sake — it is the one thing on the screen
 * that says "this money exists", against a page where everything else is an
 * estimate of something.
 */

import { View } from "react-native";

import { AppText } from "./AppText";
import { colors, fontFamily } from "../theme/tokens";

export function PaidStamp() {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Paid"
      style={{
        transform: [{ rotate: "-13deg" }],
        borderWidth: 2.5,
        borderColor: colors.money,
        borderRadius: 9,
        paddingTop: 7,
        paddingBottom: 6,
        paddingHorizontal: 13,
        opacity: 0.92,
      }}
    >
      {/* The inner ring. Two lines is what makes it read as a stamp rather
          than as a button with a border. */}
      <View
        style={{
          position: "absolute",
          top: 3,
          left: 3,
          right: 3,
          bottom: 3,
          borderWidth: 1,
          borderColor: colors.money,
          borderRadius: 5,
          opacity: 0.55,
        }}
      />
      <AppText
        weight="semibold"
        style={{
          fontFamily: fontFamily.bold,
          fontSize: 19,
          lineHeight: 20,
          letterSpacing: 3.5,
          color: colors.money,
        }}
      >
        PAID
      </AppText>
      <AppText
        style={{
          fontFamily: fontFamily.mono,
          fontSize: 7.5,
          lineHeight: 9,
          letterSpacing: 1.6,
          color: colors.money,
          opacity: 0.8,
          textAlign: "center",
          marginTop: 3,
        }}
      >
        KAHINISCOPE
      </AppText>
    </View>
  );
}
