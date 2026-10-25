/**
 * Sign-in. Google first, email and password second. The owner rule keys on a
 * verified address, which only Google provides here, so every other account —
 * any Google account but the owner's, and every password account — is a
 * registration that lands in the approval queue.
 */

import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { Redirect } from "expo-router";

import { AppText } from "../src/components/AppText";
import { KeyboardScroll } from "../src/components/KeyboardScroll";
import { Logo } from "../src/components/Logo";
import { PosterWall } from "../src/components/PosterWall";
import { useSession } from "../src/lib/auth";
import { usingEmulators } from "../src/lib/firebase";
import {
  SignInUnavailableError,
  signInWithEmulator,
  signInWithGoogle,
} from "../src/lib/google-sign-in";
import type { PasswordMode } from "../src/lib/password-rules";
import {
  PasswordSignInError,
  sendPasswordReset,
  signInWithPassword,
} from "../src/lib/password-sign-in";
import { colors, fontFamily, layout, radii, spacing, MIN_TAP_TARGET } from "../src/theme/tokens";
import { type } from "../src/theme/typography";

/** Never hard-coded: see the comment beside the buttons below. */
const emulatorAccounts = [
  { label: "owner", email: process.env.EXPO_PUBLIC_EMULATOR_OWNER, name: "Kahiniscope" },
  { label: "member", email: process.env.EXPO_PUBLIC_EMULATOR_MEMBER, name: "Rizu Ahmed" },
].filter((account): account is { label: string; email: string; name: string } =>
  Boolean(account.email)
);

/** Which button is working, so only that one shows the spinner. */
type Busy = "google" | "password" | "reset" | null;

const inputStyle = {
  alignSelf: "stretch" as const,
  minHeight: MIN_TAP_TARGET,
  borderWidth: 1,
  borderColor: colors.hairlineStrong,
  borderRadius: radii.chipLarge,
  paddingVertical: 12,
  paddingHorizontal: 13,
  fontFamily: fontFamily.medium,
  fontSize: 14,
  color: colors.ink,
  backgroundColor: colors.surface,
};

export default function SignIn() {
  const { loading, user, isApproved, isAdmin } = useSession();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [mode, setMode] = useState<PasswordMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const run = useCallback(async (which: Exclude<Busy, null>, work: () => Promise<unknown>) => {
    setBusy(which);
    setError(null);
    setInfo(null);
    try {
      await work();
      // The session provider takes it from here: the redirect below fires as
      // soon as the claims land.
    } catch (err) {
      setError(
        err instanceof SignInUnavailableError || err instanceof PasswordSignInError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Sign-in failed. Try again."
      );
    } finally {
      setBusy(null);
    }
  }, []);

  const disabled = busy !== null || loading;

  const submitPassword = () => run("password", () => signInWithPassword(email, password, mode));

  const forgotPassword = () =>
    run("reset", async () => {
      await sendPasswordReset(email);
      // The same words whether or not the address has an account.
      setInfo(`If there is an account for ${email.trim()}, a reset link is on its way. Check the inbox and spam.`);
    });

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

      <KeyboardScroll
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
            Sign in with the Google account you use for the channel, or with an
            email and password. New sign-ups go to the admin for approval.
          </AppText>

          <Pressable
            disabled={disabled}
            onPress={() => run("google", signInWithGoogle)}
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
            {busy === "google" ? (
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

          {/* The second way in. For a Google sign-in that keeps stopping at
              "Verify it's you" on a new phone, and for anybody without a
              Google account they want to use here. */}
          <View
            style={{ alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 10 }}
          >
            <View style={{ flex: 1, height: 1, backgroundColor: colors.hairline }} />
            <AppText style={[type.meta, { color: colors.faint }]}>or with email</AppText>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.hairline }} />
          </View>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email address"
            placeholderTextColor={colors.faint}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            editable={!disabled}
            accessibilityLabel="Email address"
            style={inputStyle}
          />

          <View style={{ alignSelf: "stretch", justifyContent: "center" }}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={mode === "create" ? "Choose a password (8 or more)" : "Password"}
              placeholderTextColor={colors.faint}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={mode === "create" ? "new-password" : "current-password"}
              textContentType={mode === "create" ? "newPassword" : "password"}
              returnKeyType="go"
              onSubmitEditing={disabled ? undefined : submitPassword}
              editable={!disabled}
              accessibilityLabel="Password"
              style={[inputStyle, { paddingRight: 64 }]}
            />
            <Pressable
              onPress={() => setShowPassword((shown) => !shown)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              hitSlop={8}
              style={{ position: "absolute", right: 12, paddingVertical: 6 }}
            >
              <AppText style={[type.meta, { color: colors.muted }]}>
                {showPassword ? "Hide" : "Show"}
              </AppText>
            </Pressable>
          </View>

          <Pressable
            disabled={disabled}
            onPress={submitPassword}
            accessibilityRole="button"
            style={({ pressed }) => ({
              alignSelf: "stretch",
              minHeight: MIN_TAP_TARGET,
              padding: 14,
              borderRadius: radii.buttonLarge,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.ink,
              backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
              opacity: disabled ? 0.6 : 1,
            })}
          >
            {busy === "password" ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <AppText
                weight="semibold"
                style={[type.h4, { fontSize: 14, lineHeight: 14, color: colors.ink }]}
              >
                {mode === "create" ? "Create account" : "Sign in with email"}
              </AppText>
            )}
          </Pressable>

          <View
            style={{
              alignSelf: "stretch",
              flexDirection: "row",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <Pressable
              disabled={disabled}
              onPress={() => {
                setMode((m) => (m === "create" ? "signIn" : "create"));
                setError(null);
                setInfo(null);
              }}
              accessibilityRole="button"
              hitSlop={8}
            >
              <AppText weight="semibold" style={[type.bodySmall, { color: colors.ink }]}>
                {mode === "create" ? "Have an account? Sign in" : "New here? Create an account"}
              </AppText>
            </Pressable>
            {mode === "signIn" ? (
              <Pressable disabled={disabled} onPress={forgotPassword} accessibilityRole="button" hitSlop={8}>
                {busy === "reset" ? (
                  <ActivityIndicator color={colors.muted} size="small" />
                ) : (
                  <AppText style={[type.bodySmall, { color: colors.muted }]}>Forgot password?</AppText>
                )}
              </Pressable>
            ) : null}
          </View>

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
                    run("google", () => signInWithEmulator(account.email, { name: account.name }))
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

          {info ? (
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
              <AppText style={[type.bodySmall, { color: colors.ink }]}>{info}</AppText>
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
      </KeyboardScroll>
    </View>
  );
}
