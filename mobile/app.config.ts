import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ExpoConfig } from "expo/config";

/**
 * Kahiniscope Production — Expo app configuration.
 *
 * The product is Android. iOS keys are absent on purpose: the prototype was
 * drawn in an iOS frame only because that was the available preview shell.
 */

/**
 * google-services.json arrives from the Firebase console (Project settings →
 * Android app → com.kahiniscope.production) and is not in the repository: it
 * is per-project, and EAS supplies it as a secret file at build time. Until
 * it is present, referencing it would break `expo prebuild`, so it is wired up
 * only once it exists.
 */
const googleServicesFile =
  process.env.GOOGLE_SERVICES_JSON ??
  (existsSync(resolve(__dirname, "google-services.json"))
    ? "./google-services.json"
    : undefined);

const config: ExpoConfig = {
  name: "Kahiniscope",
  slug: "kahiniscope-production",
  scheme: "kahiniscope",
  version: "1.0.0",
  orientation: "portrait",
  // The design is a light design. Following the system into dark mode would
  // repaint every surface token, so the app opts out.
  userInterfaceStyle: "light",
  icon: "./assets/icon.png",
  backgroundColor: "#f7f5f0",
  primaryColor: "#ffc20a",
  assetBundlePatterns: ["**/*"],

  android: {
    package: "com.kahiniscope.production",
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
      backgroundColor: "#1b1a17",
    },
    googleServicesFile,
    predictiveBackGestureEnabled: false,
    permissions: [
      // Reminders. Android 13+ requires this to be asked for at runtime.
      "android.permission.POST_NOTIFICATIONS",
      // A reminder that arrives silently is not a reminder.
      "android.permission.VIBRATE",
    ],
    /**
     * Stripped from the merged manifest.
     *
     * expo-dev-client contributes SYSTEM_ALERT_WINDOW ("draw over other
     * apps") for its debug overlay, and the notification tooling contributes
     * the legacy external-storage pair. This app does none of those things,
     * and every permission in a listing is something the Play data-safety
     * review — and the team installing it — will reasonably ask about.
     */
    blockedPermissions: [
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
  },

  plugins: [
    "expo-router",
    "expo-font",
    [
      "expo-splash-screen",
      {
        // The pending screen's own ground, so launching into it has no seam.
        image: "./assets/splash-icon.png",
        backgroundColor: "#f7f5f0",
        imageWidth: 200,
        resizeMode: "contain",
      },
    ],
    "@react-native-google-signin/google-signin",
  ],

  // Web is not a shipping target. Static output exists so `expo export
  // --platform web` renders every route at build time, which is the only way
  // to prove the screens mount without a device attached.
  web: {
    output: "static",
    favicon: "./assets/favicon.png",
  },

  experiments: {
    typedRoutes: true,
  },

  extra: {
    router: {},
    eas: {
      // Filled in by `eas init`.
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
};

export default config;
