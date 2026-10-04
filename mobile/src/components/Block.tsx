/**
 * A figure in a colour, loud or quiet.
 *
 * The member's Summary is built from two of these and nothing else: three soft
 * tiles in pink, blue and mint, and one raw-mint block carrying the single
 * figure on that screen which is not an estimate of anything. The loud one is
 * reserved on purpose — a screen where everything shouts says nothing, and
 * that block is loud because "earned, all time" is the fact somebody opened
 * the app for.
 *
 * The admin's Payments tab asks the same two questions in the same two
 * registers — what is owed right now, and what has gone out — and until now
 * answered both in white cards with near-black numbers, which made the admin
 * side of the money look like a different application from the member side of
 * it. One component, so they cannot drift again.
 *
 * `loud` is the raw palette fill with its measured text colour; quiet is the
 * tinted block. Both take a flavour by name, so neither can end up with a
 * pairing nobody checked.
 */

import type { ReactNode } from "react";
import { Pressable, View, type ViewStyle } from "react-native";

import { AppText } from "./AppText";
import { colors, flavours, fontFamily, radii, spacing, type FlavourName } from "../theme/tokens";
import { type } from "../theme/typography";

export function Block({
  label,
  value,
  note,
  flavour,
  loud = false,
  right,
  onPress,
  accessibilityLabel,
  accessibilityState,
  style,
}: {
  /** The uppercase caption over the figure. */
  label: string;
  /** Already formatted — money, a count, or a dash. */
  value: string;
  /** The line under it, if there is one worth saying. */
  note?: string | null;
  flavour: FlavourName;
  /** The raw fill. For the one figure on a screen that earns it. */
  loud?: boolean;
  /** A chevron, usually: whatever belongs at the end of the top line. */
  right?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityState?: { expanded?: boolean; disabled?: boolean };
  style?: ViewStyle;
}) {
  const tone = flavours[flavour];
  const captionColor = loud ? tone.onFill : tone.text;
  const figureColor = loud ? tone.onFill : tone.text;

  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.chips }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText
          style={{
            fontFamily: fontFamily.monoMedium,
            fontSize: 9.5,
            lineHeight: 11,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: captionColor,
          }}
        >
          {label}
        </AppText>
        <AppText
          weight="semibold"
          style={{
            fontFamily: fontFamily.extrabold,
            // The loud one is the screen's hero; the quiet one is a tile in a
            // row of them, at the size the Summary's counts have always been.
            fontSize: loud ? 40 : 28,
            lineHeight: loud ? 44 : 32,
            letterSpacing: loud ? -2 : -1.2,
            marginTop: loud ? 5 : 3,
            color: figureColor,
          }}
        >
          {value}
        </AppText>
        {note ? (
          <AppText style={[type.metaXSmall, { color: captionColor, lineHeight: 14, marginTop: 4 }]}>
            {note}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );

  const box: ViewStyle = {
    backgroundColor: loud ? tone.fill : tone.soft,
    borderRadius: loud ? radii.cardHero : radii.card,
    padding: loud ? 18 : 14,
  };

  if (!onPress) return <View style={[box, style]}>{body}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      android_ripple={{ color: colors.ripple }}
      style={[box, style]}
    >
      {body}
    </Pressable>
  );
}
