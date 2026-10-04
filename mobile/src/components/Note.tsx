/**
 * A small flavoured block for a line the screen needs to say out loud.
 *
 * The dashboard's device, at the size of a caption: a soft tinted fill with
 * its own hue as the text. It exists because the sentences that matter most on
 * the filtered screens — "4 of 11 broadcast episodes have no date and will not
 * appear in any month", "added up on this phone because Firestore would not
 * total these months" — were set in grey at 9.5px under a row of chips, which
 * is where text goes to be unread.
 *
 * Pink is the default and the usual case: `attention` is this palette's one
 * colour for something wanting attention, and these notes are that or they
 * would not be here.
 *
 * No border, deliberately. The banners on the board carry a full-strength edge
 * because they are buttons; a note is not tappable, and the fill alone is what
 * tells them apart at a glance.
 */

import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";

import { AppText } from "./AppText";
import { flavours, radii, type FlavourName } from "../theme/tokens";
import { type } from "../theme/typography";

export function Note({
  children,
  tone = "attention",
  style,
}: {
  children: ReactNode;
  tone?: FlavourName;
  style?: ViewStyle;
}) {
  const flavour = flavours[tone];
  return (
    <View
      style={[
        {
          backgroundColor: flavour.soft,
          borderRadius: radii.chipLarge,
          paddingVertical: 9,
          paddingHorizontal: 11,
        },
        style,
      ]}
    >
      {/* 15px of leading rather than the scale's 13.3: these run to two and
          three lines, and a caption set tight is a caption nobody finishes. */}
      <AppText style={[type.metaXSmall, { color: flavour.text, lineHeight: 15 }]}>
        {children}
      </AppText>
    </View>
  );
}
