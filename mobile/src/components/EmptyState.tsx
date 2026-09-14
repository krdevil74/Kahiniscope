/**
 * A dashed card for the places where nothing is a normal answer.
 */

import { View } from "react-native";

import { AppText } from "./AppText";
import { colors, radii, spacing } from "../theme/tokens";
import { type } from "../theme/typography";

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.hairlineStronger,
        borderRadius: radii.card,
        padding: spacing.card + 2,
        gap: 5,
        alignItems: "center",
      }}
    >
      <AppText weight="semibold" style={[type.cardTitleXSmall, { textAlign: "center" }]}>
        {title}
      </AppText>
      {detail ? (
        <AppText style={[type.bodyXSmall, { color: "rgba(27,26,23,.5)", textAlign: "center" }]}>
          {detail}
        </AppText>
      ) : null}
    </View>
  );
}
