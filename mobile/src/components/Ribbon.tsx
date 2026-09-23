/**
 * A section heading drawn as a ribbon.
 *
 * The payments page has two lists that mean different things — money that
 * has moved, and money that has not — and a plain caption above each was not
 * enough separation. A ribbon reads as a marker laid across the page rather
 * than as another card, which is what tells somebody the list below it is a
 * different kind of thing.
 *
 * Deliberately carries no figure. Totals live at the top of the screen where
 * they are read once; repeating them on every heading turned the page into
 * a wall of numbers that all looked equally important.
 */

import type { ReactNode } from "react";
import { View } from "react-native";

import { AppText } from "./AppText";
import { colors, fontFamily, radii, spacing } from "../theme/tokens";

export interface RibbonProps {
  label: string;
  /** The band's fill. One of the palette's darker, readable colours. */
  tone: string;
  /** Sits inside the band, after the label — the (i) on Upcoming payments. */
  action?: ReactNode;
}

export function Ribbon({ label, tone, action }: RibbonProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginTop: spacing.card + 4,
        marginBottom: 2,
      }}
    >
      <View
        style={{
          backgroundColor: tone,
          paddingVertical: 9,
          paddingLeft: 14,
          paddingRight: 16,
          borderTopLeftRadius: 5,
          borderBottomLeftRadius: 5,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <AppText
          weight="semibold"
          style={{
            fontFamily: fontFamily.semibold,
            fontSize: 12.5,
            lineHeight: 15,
            color: colors.white,
          }}
        >
          {label}
        </AppText>
        {action}
      </View>

      {/* The notch. Two triangles made from borders, which is the only way to
          cut a shape in React Native without pulling in SVG. */}
      <View
        style={{
          width: 0,
          height: 0,
          borderTopWidth: 16.5,
          borderBottomWidth: 16.5,
          borderRightWidth: 11,
          borderTopColor: tone,
          borderBottomColor: tone,
          borderRightColor: "transparent",
        }}
      />

      <View style={{ flex: 1, height: 1, backgroundColor: colors.hairline, marginLeft: 2 }} />
    </View>
  );
}

/** The (i) that sits in a ribbon. White on the band, so it reads as part of it. */
export function RibbonInfo() {
  return (
    <View
      style={{
        width: 17,
        height: 17,
        borderRadius: radii.pill,
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,.7)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AppText
        weight="semibold"
        style={{
          fontFamily: fontFamily.semibold,
          fontSize: 10,
          lineHeight: 11,
          color: colors.white,
          fontStyle: "italic",
        }}
      >
        i
      </AppText>
    </View>
  );
}
