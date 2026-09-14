/**
 * Sign-in. Google is the only provider: the owner rule keys on a verified
 * Google address, and every other account on earth is a registration that
 * lands in the approval queue.
 */

import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { AppText } from "../src/components/AppText";
import { Logo } from "../src/components/Logo";
import { useSession } from "../src/lib/auth";
import { usingEmulators } from "../src/lib/firebase";
import {
  SignInUnavailableError,
  signInWithEmulator,
  signInWithGoogle,
} from "../src/lib/google-sign-in";
import { colors, layout, radii, spacing, MIN_TAP_TARGET } from "../src/theme/tokens";
import { type } from "../src/theme/typography";

/** Never hard-coded: see the comment beside the buttons below. */
const emulatorAccounts = [
  { label: "owner", email: process.env.EXPO_PUBLIC_EMULATOR_OWNER, name: "Kahiniscope" },
  { label: "member", email: process.env.EXPO_PUBLIC_EMULATOR_MEMBER, name: "Rizu Ahmed" },
].filter((account): account is { label: string; email: string; name: string } =>
  Boolean(account.email)
);

export default function SignIn() {
  const { loading } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      // The session provider takes it from here: the gate redirects as soon
      // as the claims land.
    } catch (err) {
      setError(
        err instanceof SignInUnavailableError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Sign-in failed. Try again."
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const disabled = busy || loading;

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.screen,
        backgroundColor: colors.surfaceAlt,
        gap: spacing.cards,
      }}
    >
      <Logo size={layout.pendingLogo} />

      <AppText weight="semibold" style={[type.h2, { marginTop: spacing.cardTight }]}>
        Kahiniscope Production
      </AppText>

      <AppText
        style={[
          type.body,
          { color: "rgba(27,26,23,.6)", textAlign: "center", maxWidth: 280 },
        ]}
      >
        Sign in with the Google account you use for the channel. New sign-ups go
        to the admin for approval.
      </AppText>

      <Pressable
        disabled={disabled}
        onPress={() => run(signInWithGoogle)}
        accessibilityRole="button"
        style={({ pressed }) => ({
          alignSelf: "stretch",
          minHeight: MIN_TAP_TARGET,
          marginTop: spacing.cards,
          padding: 16,
          borderRadius: radii.buttonLarge,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? colors.yellowHover : colors.brandYellow,
          opacity: disabled ? 0.6 : 1,
        })}
      >
        {busy ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <AppText weight="semibold" style={[type.h4, { fontSize: 14, lineHeight: 14 }]}>
            Continue with Google
          </AppText>
        )}
      </Pressable>

      {/* Development only, twice over: `usingEmulators` is gated on __DEV__,
          and the addresses come from .env rather than from source — the owner
          address must not appear in the app bundle at all, and a string
          literal survives minification even inside dead code. Set
          EXPO_PUBLIC_EMULATOR_OWNER and EXPO_PUBLIC_EMULATOR_MEMBER locally
          to get these buttons; the member one matches the demo seed. */}
      {usingEmulators && emulatorAccounts.length > 0 ? (
        <View style={{ alignSelf: "stretch", flexDirection: "row", gap: spacing.chipsTight }}>
          {emulatorAccounts.map((account) => (
            <Pressable
              key={account.label}
              disabled={disabled}
              onPress={() =>
                run(() => signInWithEmulator(account.email, { name: account.name }))
              }
              style={({ pressed }) => ({
                flex: 1,
                minHeight: MIN_TAP_TARGET,
                padding: 14,
                borderRadius: radii.button,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: colors.hairlineStronger,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <AppText style={[type.meta, { color: "rgba(27,26,23,.6)" }]}>
                {`emulator · ${account.label}`}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      {error ? (
        <View
          style={{
            alignSelf: "stretch",
            padding: spacing.cardTight,
            borderRadius: radii.chipLarge,
            backgroundColor: colors.surfaceSunken,
            borderWidth: 1,
            borderColor: colors.hairline,
          }}
        >
          <AppText style={[type.bodySmall, { color: colors.danger }]}>{error}</AppText>
        </View>
      ) : null}
    </ScrollView>
  );
}
