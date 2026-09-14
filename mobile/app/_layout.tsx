/**
 * Root layout: fonts, session, and the splash screen that hides both while
 * they load.
 */

import { useCallback } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
// Imported one weight at a time. The packages' root entry points require()
// every weight and italic they ship — 29 files, close to 4MB — and this app
// uses ten of them.
import { SpaceGrotesk_400Regular } from "@expo-google-fonts/space-grotesk/400Regular";
import { SpaceGrotesk_500Medium } from "@expo-google-fonts/space-grotesk/500Medium";
import { SpaceGrotesk_600SemiBold } from "@expo-google-fonts/space-grotesk/600SemiBold";
import { SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk/700Bold";
import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono/400Regular";
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono/500Medium";
import { IBMPlexMono_600SemiBold } from "@expo-google-fonts/ibm-plex-mono/600SemiBold";
import { NotoSansBengali_400Regular } from "@expo-google-fonts/noto-sans-bengali/400Regular";
import { NotoSansBengali_500Medium } from "@expo-google-fonts/noto-sans-bengali/500Medium";
import { NotoSansBengali_600SemiBold } from "@expo-google-fonts/noto-sans-bengali/600SemiBold";

import { SessionProvider, useSession } from "../src/lib/auth";
import { useNotificationTaps } from "../src/lib/notifications";
import { ToastProvider } from "../src/lib/toast";
import { colors } from "../src/theme/tokens";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
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
 * Sits inside the session so it knows which way to send a tap, and renders
 * nothing.
 */
function NotificationRouting() {
  const { isAdmin } = useSession();
  useNotificationTaps(isAdmin);
  return null;
}
