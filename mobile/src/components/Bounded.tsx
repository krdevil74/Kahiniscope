/**
 * Holds content to a readable width and centres it.
 *
 * The design is a phone design, and on a phone this does nothing: the screen
 * is narrower than the cap, so the child fills it exactly as before. It earns
 * its place on a tablet, where without it every card ran the full width of
 * the screen and left its own text stranded in the far corner — a phone
 * layout stretched rather than a tablet layout.
 *
 * The bars are the reason this is a component rather than a `maxWidth` on
 * each screen. A header's background has to span the whole width or the
 * near-black stripe stops halfway across; only what is drawn *inside* it may
 * be held in. So the bars keep their full-width fill and wrap their contents
 * in this, and the page content uses the same cap — which is what lines the
 * logo up with the first card underneath it.
 */

import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";

import { layout } from "../theme/tokens";

export function Bounded({
  children,
  style,
}: {
  children: ReactNode;
  /** Padding and direction belong to the caller; this only sets the width. */
  style?: ViewStyle;
}) {
  return (
    <View style={{ width: "100%", alignItems: "center" }}>
      <View style={[{ width: "100%", maxWidth: layout.contentMax }, style]}>{children}</View>
    </View>
  );
}
