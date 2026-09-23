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

/**
 * The emulators run under their own project id, and so must the app when it
 * is pointed at them.
 *
 * This was the cause of a bug that wasted a great deal of time: the emulator
 * suite, the seed script and every test use `kahiniscope-demo`, while the
 * app's own config names the live project. Both halves connected to the same
 * emulator quite happily and then read two different, equally empty
 * databases inside it — no error, no permission failure, just nothing. An
 * approved member with eleven tasks looked like a brand new account.
 *
 * Fixed by agreeing on one id. It has to be this way round: using the live
 * project's id for local scratch data is a footgun, and the id is what the
 * Firestore and Auth emulators partition on.
 */
const EMULATOR_PROJECT_ID = "kahiniscope-demo";

const options: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

/**
 * A bundle built without the EXPO_PUBLIC_* variables gets an empty config,
 * and the auth initialisation below then dies at module load — which in a
 * release build is an instant crash back to the launcher with nothing to
 * read anywhere. EAS builds from a git archive and .env is gitignored, so
 * this is the shape a remote build fails in when the variables were never
 * set on the project. Say which ones are missing instead.
 */
const REQUIRED = ["apiKey", "authDomain", "projectId", "appId"] as const;
const missing = REQUIRED.filter((key) => !options[key]);
if (missing.length > 0) {
  throw new Error(
    `Firebase config is missing: ${missing.join(", ")}. The EXPO_PUBLIC_FIREBASE_* ` +
      "variables were not present when this bundle was built. Locally they come " +
      "from mobile/.env (see .env.example); for anything built on EAS they have " +
      "to be set on the project with `eas env:set`."
  );
}

/**
 * Emulators are a development-only affordance. Gating on __DEV__ as well as
 * the flag means a release build cannot be pointed at a local backend even if
 * the variable is set at build time.
 */
export const usingEmulators =
  __DEV__ && process.env.EXPO_PUBLIC_USE_EMULATORS === "1";

/** 10.0.2.2 is the host machine as seen from the Android emulator. */
const emulatorHost = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? "10.0.2.2";

const app = getApps().length
  ? getApp()
  : initializeApp(
      usingEmulators ? { ...options, projectId: EMULATOR_PROJECT_ID } : options
    );


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
