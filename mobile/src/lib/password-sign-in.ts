/**
 * Email and password, the second way in.
 *
 * Google is still the main one. This exists for people whose Google sign-in
 * keeps stopping at "Verify it's you" on a new phone — Play's reviewers among
 * them — and for anybody without a Google account they want to use here.
 *
 * It grants nothing by itself. A new account lands pending exactly as a
 * Google one does, and an address typed here is unverified, so it can never
 * match the owner rule (functions/src/roles.ts).
 */

import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  type UserCredential,
} from "firebase/auth";

import { auth } from "./firebase";
import {
  credentialsProblem,
  normaliseEmail,
  passwordErrorMessage,
  type PasswordMode,
} from "./password-rules";

/** Thrown with a sentence fit to show the person, never a Firebase code. */
export class PasswordSignInError extends Error {}

function codeOf(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : undefined;
}

export async function signInWithPassword(
  email: string,
  password: string,
  mode: PasswordMode
): Promise<UserCredential> {
  const problem = credentialsProblem(email, password, mode);
  if (problem) throw new PasswordSignInError(problem);

  const address = normaliseEmail(email);
  try {
    return mode === "create"
      ? await createUserWithEmailAndPassword(auth, address, password)
      : await signInWithEmailAndPassword(auth, address, password);
  } catch (err) {
    throw new PasswordSignInError(passwordErrorMessage(codeOf(err), mode));
  }
}

/**
 * Send the reset link. Firebase answers the same whether or not the address
 * has an account, so the caller says the same thing either way.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  if (credentialsProblem(email, "-", "signIn")) {
    throw new PasswordSignInError("Enter your email address first, then tap Forgot password.");
  }
  try {
    await sendPasswordResetEmail(auth, normaliseEmail(email));
  } catch (err) {
    const code = codeOf(err);
    // An unknown address is not news worth telling a stranger.
    if (code === "auth/user-not-found") return;
    throw new PasswordSignInError(passwordErrorMessage(code, "signIn"));
  }
}
