/**
 * Root layout: fonts, session, and the splash screen that hides both while
 * they load.
 */

import { useCallback, useEffect } from "react";
import { View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
// Imported one weight at a time. The packages' root entry points require()
// every weight and italic they ship — 29 files, close to 4MB — and this app
// uses ten of them.
// Space Grotesk is a display face; on a screen of dense data its personality
// competes with the data. Plus Jakarta Sans is quieter at small sizes and has
// the weight range the hierarchy needs — the old design leaned on 600 for
// almost everything, which is why it read flat.
import { PlusJakartaSans_400Regular } from "@expo-google-fonts/plus-jakarta-sans/400Regular";
import { PlusJakartaSans_500Medium } from "@expo-google-fonts/plus-jakarta-sans/500Medium";
import { PlusJakartaSans_600SemiBold } from "@expo-google-fonts/plus-jakarta-sans/600SemiBold";
import { PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans/700Bold";
import { PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans/800ExtraBold";
import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono/400Regular";
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono/500Medium";
import { IBMPlexMono_600SemiBold } from "@expo-google-fonts/ibm-plex-mono/600SemiBold";
import { NotoSansBengali_400Regular } from "@expo-google-fonts/noto-sans-bengali/400Regular";
import { NotoSansBengali_500Medium } from "@expo-google-fonts/noto-sans-bengali/500Medium";
import { NotoSansBengali_600SemiBold } from "@expo-google-fonts/noto-sans-bengali/600SemiBold";

import { SessionProvider, useSession } from "../src/lib/auth";
import { shouldSendToSignIn } from "../src/lib/session-routing.ts";
import { useNotificationTaps } from "../src/lib/notifications";
import { ToastProvider } from "../src/lib/toast";
import { colors } from "../src/theme/tokens";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    // Space Grotesk has no Bengali coverage and every episode title is
    // Bengali, so this is not optional.
    NotoSansBengali_400Regular,
    NotoSansBengali_500Medium,
    NotoSansBengali_600SemiBold,
  });

  const onReady = useCallback(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  // Hold the splash rather than show a frame of the wrong typeface.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <ToastProvider>
          <SignedOutGate />
          <NotificationRouting />
        <View style={{ flex: 1, backgroundColor: colors.surfaceAlt }} onLayout={onReady}>
          {/* The header bar is ink everywhere it appears, and Android is
              edge to edge, so the status bar draws over it. */}
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.surfaceAlt },
              animation: "fade",
            }}
          />
        </View>
        </ToastProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

/**
 * Sending somebody back to the door when their session ends.
 *
 * The gate in app/index.tsx only runs at `/`, so it cannot help anybody who
 * is already somewhere else — and signing out happens from the member's
 * dashboard and the holding screen, never from `/`. Without this, Sign out
 * ended the session and left the person looking at a screen they were no
 * longer entitled to, with no way back to the sign-in button.
 *
 * It lives here rather than on each screen because the last two bugs of this
 * shape were both a screen that had not been told to redirect. One guard for
 * the whole app cannot be forgotten on the next screen somebody adds.
 */
function SignedOutGate() {
  const { loading, user } = useSession();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (shouldSendToSignIn({ loading, signedIn: Boolean(user) }, segments[0])) {
      router.replace("/sign-in");
    }
  }, [loading, user, segments, router]);

  return null;
}

/**
 * Sits inside the session so it knows which way to send a tap, and renders
 * nothing.
 */
function NotificationRouting() {
  const { isAdmin } = useSession();
  useNotificationTaps(isAdmin);
  return null;
}
