/**
 * Email-and-password sign-in, the parts that need no Firebase: what counts as
 * a usable pair, and what to say when Firebase refuses one. Kept apart from
 * password-sign-in.ts so they can be tested under plain Node.
 */

export type PasswordMode = "signIn" | "create";

/** Firebase's own floor is six. Eight is the least worth calling a password. */
export const MIN_PASSWORD = 8;

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Loose on purpose: one @, something either side, a dot in the domain.
 * Firebase is the real judge; this only stops a request that cannot succeed.
 */
export function isEmailShaped(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normaliseEmail(email));
}

/**
 * Why the form cannot be sent yet, or null when it can. Length is only
 * checked when creating an account: an existing password is whatever it is,
 * and saying "too short" about it would be a guess.
 */
export function credentialsProblem(
  email: string,
  password: string,
  mode: PasswordMode
): string | null {
  if (!isEmailShaped(email)) return "Enter your email address.";
  if (!password) return "Enter your password.";
  if (mode === "create" && password.length < MIN_PASSWORD) {
    return `Use at least ${MIN_PASSWORD} characters for the password.`;
  }
  return null;
}

/**
 * Firebase's error codes, said plainly. A wrong password and an unknown
 * address read the same on purpose: Firebase now reports both as
 * `invalid-credential`, and telling them apart would tell a stranger which
 * addresses have accounts.
 */
export function passwordErrorMessage(code: string | undefined, mode: PasswordMode): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "That email and password do not match. If you joined with Google, use Continue with Google instead.";
    case "auth/email-already-in-use":
      return "There is already an account for this email. Sign in instead — or, if it was made with Google, use Continue with Google.";
    case "auth/invalid-email":
      return "That email address does not look right.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return `Use a longer password — at least ${MIN_PASSWORD} characters.`;
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes, or reset the password.";
    case "auth/network-request-failed":
      return "No connection. Check the internet and try again.";
    case "auth/operation-not-allowed":
      return "Email sign-in is not switched on yet. Use Continue with Google for now.";
    case "auth/user-disabled":
      return "This account has been switched off. Ask the admin.";
    default:
      return mode === "create"
        ? "Could not create the account. Try again."
        : "Sign-in failed. Try again.";
  }
}
