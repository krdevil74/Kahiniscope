/**
 * Catching up when the document knows more than the token does.
 *
 * Approving somebody is a one-field write to their user document. A Cloud
 * Function sees that write and re-mints their custom claims — but it is a
 * trigger, so it runs *after*, by some amount nobody controls. Meanwhile the
 * member's app sees the document change instantly, asks for a fresh token,
 * and gets one that still says "pending", because the claim had not been
 * written yet.
 *
 * That was the whole bug: one attempt, no retry, and a member left looking at
 * the holding screen until they force-quit the app — at which point signing
 * in mints a correct token and everything appears to have worked.
 *
 * So the app asks again, a few times, backing off. The delays are here rather
 * than inline so the shape of the retry is something that can be reasoned
 * about and tested: how soon the first one is, how long it keeps trying, and
 * that it does eventually stop.
 *
 * Pure: no React, no Firebase. Unit tested.
 */

/**
 * How long to wait before each re-check, in milliseconds.
 *
 * The first is short because the trigger usually wins the race by a wide
 * margin and the member is watching the screen. The last ones are long
 * because by then something is wrong that waiting will not fix, and a phone
 * spinning on a timer is worse than a screen with a refresh on it.
 */
export const CLAIM_RETRY_DELAYS_MS: readonly number[] = [800, 1500, 2500, 4000, 7000, 12000];

/** Roughly half a minute of trying before it gives up and leaves it to them. */
export function totalRetryWindowMs(delays: readonly number[] = CLAIM_RETRY_DELAYS_MS): number {
  return delays.reduce((sum, ms) => sum + ms, 0);
}

/**
 * Does the token disagree with the record?
 *
 * Only ever used to decide whether to ask for a new token. The record is not
 * the authority on what somebody may do — the claim is, and the rules read
 * the claim — so this is a prompt to go and ask, never a shortcut around it.
 */
export function claimsAreBehind(
  profile: { status: string; role: string } | null,
  claims: { status: string; role: string }
): boolean {
  if (!profile) return false;
  return profile.status !== claims.status || profile.role !== claims.role;
}
