/**
 * A placeholder with the real header on it.
 *
 * Build order step 2 is the scaffold: identity, fonts, tokens, Firebase and
 * routing. The nine designed screens are steps 3 to 7, and each one replaces
 * a use of this component. It shows what the session actually is, so the
 * plumbing can be checked on a device before any of that is drawn.
 */

import { ScrollView, View } from "react-native";

import { AppText } from "./AppText";
import { ScreenHeader } from "./ScreenHeader";
import { useSession } from "../lib/auth";
import { colors, radii, spacing } from "../theme/tokens";
import { type } from "../theme/typography";

export interface ScaffoldScreenProps {
  title: string;
  subtitle: string;
  /** Which build-order step fills this screen in. */
  step: string;
  onBack?: () => void;
}

export function ScaffoldScreen({ title, subtitle, step, onBack }: ScaffoldScreenProps) {
  const { user, role, status, profile, signOut } = useSession();

  const rows: [string, string][] = [
    ["signed in", user?.email ?? "—"],
    ["uid", user?.uid ?? "—"],
    ["role claim", role],
    ["status claim", status],
    ["user doc", profile ? `${profile.name} · ${profile.craft ?? "no craft yet"}` : "—"],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceAlt }}>
      <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} />

      <ScrollView contentContainerStyle={{ padding: spacing.screen, gap: spacing.cards }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.card,
            borderWidth: 1,
            borderColor: colors.hairline,
            padding: spacing.card,
            gap: spacing.chips,
          }}
        >
          <AppText style={type.caption}>Scaffold</AppText>
          <AppText style={type.body}>
            This screen is drawn in {step}. What is proved here is everything
            underneath it: the claims below came from the server, and the
            Firestore rules enforce the same reading.
          </AppText>
        </View>

        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.card,
            borderWidth: 1,
            borderColor: colors.hairline,
            padding: spacing.card,
            gap: spacing.chipsTight,
          }}
        >
          {rows.map(([label, value]) => (
            <View key={label} style={{ flexDirection: "row", gap: spacing.chips }}>
              <AppText style={[type.metaSmall, { color: "rgba(27,26,23,.5)", width: 92 }]}>
                {label}
              </AppText>
              <AppText style={[type.metaSmall, { flex: 1 }]}>{value}</AppText>
            </View>
          ))}
        </View>

        <AppText
          onPress={signOut}
          style={[type.meta, { color: colors.yellowDeep, padding: spacing.cardTight }]}
        >
          Sign out
        </AppText>
      </ScrollView>
    </View>
  );
}
