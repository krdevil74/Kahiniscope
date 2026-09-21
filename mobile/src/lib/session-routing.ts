/**
 * Where somebody belongs when their session changes under them.
 *
 * The gate in app/index.tsx only runs at `/`, which means it cannot help
 * anybody already somewhere else. Three bugs have now come out of that same
 * gap: signing in left you on the sign-in screen, an approval left you on the
 * holding screen, and signing out left you on a dashboard you were no longer
 * entitled to, with no way back to the button.
 *
 * So the rule lives here, as one function, tested — rather than as a
 * condition remembered separately on each screen.
 *
 * Pure: no React, no Firebase. Unit tested.
 */

export interface SessionShape {
  /** True until Firebase has finished restoring a persisted session. */
  loading: boolean;
  signedIn: boolean;
}

/**
 * Should this route be replaced with the sign-in screen?
 *
 * `loading` is the one that matters: on a cold start it is true before
 * Firebase has restored the session, and redirecting then would throw out
 * somebody who is perfectly well signed in.
 */
export function shouldSendToSignIn(session: SessionShape, firstSegment: string | undefined): boolean {
  if (session.loading) return false;
  if (session.signedIn) return false;
  // Already at the door. Redirecting again is a loop.
  return firstSegment !== "sign-in";
}
