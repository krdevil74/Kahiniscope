/**
 * Project-wide constants.
 *
 * The owner address lives here and nowhere else. It must never reach the app
 * bundle: admin identity is decided on the server, on a Google token we have
 * verified ourselves, and the client is only ever told the outcome.
 */

/**
 * Addresses granted the owner role on sign-in. Exactly one is live today;
 * the array exists because losing the Gmail account means losing admin
 * access, so a second owner address can be added here without a code change
 * anywhere else. Keep 2FA on every address listed.
 *
 * Matching is an exact, case-insensitive comparison against the verified
 * `email` on the Google token. Gmail's dot and plus aliases are deliberately
 * NOT normalised: the rule stays predictable, and the real mailbox is the
 * only one that can hold a Google session for this address anyway.
 */
export const OWNER_EMAILS: readonly string[] = ["owner@kahiniscope.example"];

/**
 * Firestore, and therefore every Firestore trigger, lives in asia-south1
 * (Mumbai) — the closest region to Dhaka.
 */
export const REGION = "asia-south1";

/**
 * Region for the Identity Platform blocking functions (beforeUserCreated /
 * beforeUserSignedIn). These run on the sign-in path, so they want to be near
 * the user, but Identity Platform only accepts blocking functions in the
 * regions it supports. If `firebase deploy` rejects this value with an
 * unsupported-region error, set it to "us-central1" — sign-in then costs one
 * extra round trip and nothing else changes.
 */
export const BLOCKING_REGION = "asia-south1";

/** Default escalation ladder written into settings/global on first run. */
export const DEFAULT_PLAN = [7, 4, 3, 2, 1];

export const DEFAULT_QUIET_HOURS = {
  enabled: true,
  from: 22,
  to: 8,
  sendQueuedAt: 9,
};

/**
 * Only the free channels are on by default.
 *
 * Push and Telegram cost nothing and have no cap. WhatsApp bills per
 * business-initiated template message, and Textbelt's free key allows one SMS
 * a day across the whole key — so both start off and are switched on
 * deliberately, from the Notify screen, by somebody who has decided to pay
 * for them.
 */
export const DEFAULT_CHANNELS = {
  push: true,
  telegram: true,
  whatsapp: false,
  sms: false,
  email: false,
};
