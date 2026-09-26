/**
 * Sign-in. Google is the only provider: the owner rule keys on a verified
 * Google address, and every other account on earth is a registration that
 * lands in the approval queue.
 */

import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Redirect } from "expo-router";

import { AppText } from "../src/components/AppText";
import { Logo } from "../src/components/Logo";
import { PosterWall } from "../src/components/PosterWall";
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
  const { loading, user, isApproved, isAdmin } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      // The session provider takes it from here: the redirect below fires as
      // soon as the claims land.
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

  // Signing in does not move the router by itself: this screen is a route,
  // not the gate, and the gate only runs at `/`. Without this the credential
  // lands, the session updates, and the person is left looking at the button
  // they just pressed. Same three destinations the gate uses.
  if (!loading && user) {
    if (!isApproved) return <Redirect href="/pending" />;
    return <Redirect href={isAdmin ? "/board" : "/summary"} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceAlt }}>
      {/* What this app is for, said before anybody has signed in. */}
      <PosterWall />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: spacing.screen,
        }}
      >
        {/* The form sits on its own card. Readable text over moving artwork
            needs something solid under it — dimming the wall far enough to
            read through would have left nothing worth looking at. */}
        <View
          style={{
            width: "100%",
            maxWidth: 380,
            alignItems: "center",
            gap: spacing.cards,
            padding: 22,
            borderRadius: radii.cardHero,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.hairline,
            elevation: 8,
            shadowColor: colors.ink,
            shadowOpacity: 0.12,
            shadowRadius: 26,
            shadowOffset: { width: 0, height: 10 },
          }}
        >
          <Logo size={layout.pendingLogo} />

          <AppText weight="semibold" style={[type.h2, { marginTop: spacing.cardTight }]}>
            Kahiniscope Production
          </AppText>

          <AppText
            style={[
              type.body,
              { color: colors.muted, textAlign: "center", maxWidth: 280 },
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
              // The mark's own yellow. This is the first screen anybody
              // sees and the only thing on it to press, so it wears the
              // brand colour rather than the violet the buttons inside the
              // app use — and the label goes back to reading properly:
              // type.h4 sets ink, which on violet was dark text on a dark
              // fill.
              backgroundColor: pressed ? colors.yellowHover : colors.brandYellow,
              opacity: disabled ? 0.6 : 1,
            })}
          >
            {busy ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <AppText
                weight="semibold"
                style={[type.h4, { fontSize: 14, lineHeight: 14, color: colors.ink }]}
              >
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
                  <AppText style={[type.meta, { color: colors.muted }]}>
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
        </View>
      </ScrollView>
    </View>
  );
}
