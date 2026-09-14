/**
 * The Firebase client. Auth and Firestore, talked to directly from the app
 * and guarded by security rules — there is no REST layer and no custom
 * server.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth, initializeAuth, type Auth } from "firebase/auth";
// getReactNativePersistence ships in @firebase/auth's React Native entry
// point, which the umbrella package's type definitions do not describe.
// Metro resolves the right entry at runtime; TypeScript cannot see it.
// @ts-expect-error -- present at runtime, absent from the published types
import { getReactNativePersistence } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  getFirestore,
  type Firestore,
} from "firebase/firestore";

const options: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Emulators are a development-only affordance. Gating on __DEV__ as well as
 * the flag means a release build cannot be pointed at a local backend even if
 * the variable is set at build time.
 */
export const usingEmulators =
  __DEV__ && process.env.EXPO_PUBLIC_USE_EMULATORS === "1";

/** 10.0.2.2 is the host machine as seen from the Android emulator. */
const emulatorHost = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? "10.0.2.2";

const app = getApps().length ? getApp() : initializeApp(options);

/**
 * Auth has to be initialised with React Native persistence, or the session is
 * lost on every cold start and the team is asked to sign in again each
 * morning.
 */
export const auth: Auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Already initialised — Fast Refresh re-runs this module.
    return getAuth(app);
  }
})();

/**
 * Long polling is forced because Firestore's streaming transport is
 * unreliable on some Android networks, and a board that silently stops
 * updating is worse than one that polls.
 */
export const db: Firestore = (() => {
  try {
    return initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  } catch {
    return getFirestore(app);
  }
})();

if (usingEmulators) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, 8080);
  console.log(`Firebase: using emulators at ${emulatorHost}`);
}

export { app };
