/**
 * The bar across the top of every member screen.
 *
 * A near-black neutral with no violet in it, so the yellow mark is the
 * brightest thing on it and nothing competes. The tab strip deliberately
 * sits below this rather than inside it — see MemberTabs.
 */

import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "./AppText";
import { Logo } from "./Logo";
import { useSession } from "../lib/auth";
import { SignOutPill } from "./SignOutPill";
import { colors, fontFamily, layout, spacing } from "../theme/tokens";

export function MemberHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const insets = useSafeAreaInsets();
  const { signOut } = useSession();

  return (
    <View
      style={{
        backgroundColor: colors.bar,
        paddingTop: insets.top + 14,
        paddingBottom: 16,
        paddingHorizontal: spacing.screen,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.cardTight,
      }}
    >
      <Logo size={layout.headerLogo} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText
          weight="semibold"
          numberOfLines={1}
          style={{ fontFamily: fontFamily.bold, fontSize: 19, lineHeight: 22, color: colors.onBar }}
        >
          {title}
        </AppText>
        <AppText
          numberOfLines={1}
          style={{
            fontFamily: fontFamily.mono,
            fontSize: 10.5,
            lineHeight: 14,
            color: colors.onInkMuted,
            marginTop: 3,
          }}
        >
          {subtitle}
        </AppText>
      </View>
      <SignOutPill onSignOut={() => void signOut()} />
    </View>
  );
}
