/**
 * A marker for a screen the build order has not reached yet. It keeps
 * navigation whole — the FAB, the banner and the tab bar all lead somewhere —
 * without pretending to be the designed screen.
 */

import { View } from "react-native";

import { AppText } from "./AppText";
import { Card } from "./Card";
import { SectionCaption } from "./SectionCaption";
import { spacing } from "../theme/tokens";
import { type } from "../theme/typography";

export function ComingInStep({ step, what }: { step: string; what: string }) {
  return (
    <View style={{ padding: spacing.screen }}>
      <Card style={{ padding: spacing.card, gap: spacing.chips }}>
        <SectionCaption>{step}</SectionCaption>
        <AppText style={type.body}>{what}</AppText>
      </Card>
    </View>
  );
}
