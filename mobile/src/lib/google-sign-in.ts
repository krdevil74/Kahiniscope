/**
 * Google sign-in, the only way into the app.
 *
 * Native sign-in (the account sheet, not a browser round trip) needs a
 * development or production build. In Expo Go the module is absent, so the
 * caller is told plainly rather than crashing — and in a development build
 * pointed at the emulators, a local identity can be minted instead, which is
 * what makes the screens workable before Play signing is set up.
 */

import {
  GoogleAuthProvider,
  signInWithCredential,
  type UserCredential,
} from "firebase/auth";

import { auth, usingEmulators } from "./firebase";

export class SignInUnavailableError extends Error {}

type GoogleSignInModule = typeof import("@react-native-google-signin/google-signin");

function loadGoogleSignIn(): GoogleSignInModule | null {
  try {
    // Absent in Expo Go, present in any dev-client or production build.
    return require("@react-native-google-signin/google-signin");
  } catch {
    return null;
  }
}

let configured = false;

function configure(mod: GoogleSignInModule) {
  if (configured) return;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) {
    throw new SignInUnavailableError(
      "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set. Copy the Web client ID from " +
        "the Firebase console (Authentication → Sign-in method → Google) into .env."
    );
  }
  mod.GoogleSignin.configure({ webClientId, offlineAccess: false });
  configured = true;
}

/**
 * Sign in with a real Google account. Returns the Firebase credential; what
 * the account is allowed to do is decided by the claims the blocking function
 * mints, which the session provider reads.
 */
export async function signInWithGoogle(): Promise<UserCredential> {
  const mod = loadGoogleSignIn();
  if (!mod) {
    throw new SignInUnavailableError(
      "Google sign-in needs a development build — it is not available in Expo Go. " +
        "Run `npm run build:dev`, or set EXPO_PUBLIC_USE_EMULATORS=1 to sign in locally."
    );
  }

  configure(mod);
  await mod.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await mod.GoogleSignin.signIn();

  if (response.type === "cancelled") {
    throw new SignInUnavailableError("Sign-in cancelled.");
  }

  const idToken = response.data?.idToken;
  if (!idToken) {
    throw new Error("Google returned no ID token.");
  }

  return signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}

/**
 * Development only, and only against the emulators. The Auth emulator accepts
 * an unsigned JSON payload where a Google ID token would go, which is how the
 * screens get a signed-in session without Play services or a real account.
 *
 * Guarded by `usingEmulators`, which is itself guarded by __DEV__, so this
 * cannot reach a release build.
 */
export async function signInWithEmulator(
  email: string,
  options: { name?: string; emailVerified?: boolean } = {}
): Promise<UserCredential> {
  if (!usingEmulators) {
    throw new SignInUnavailableError(
      "Emulator sign-in is only available in a development build with " +
        "EXPO_PUBLIC_USE_EMULATORS=1."
    );
  }

  const payload = JSON.stringify({
    sub: `emulator-${email}`,
    email,
    email_verified: options.emailVerified ?? true,
    name: options.name ?? email,
  });

  return signInWithCredential(auth, GoogleAuthProvider.credential(payload));
}

export function isNativeSignInAvailable(): boolean {
  return loadGoogleSignIn() !== null;
}
