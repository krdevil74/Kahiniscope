/**
 * Project-wide constants.
 *
 * The owner address lives here and nowhere else. It must never reach the app
 * bundle: admin identity is decided on the server, on a Google token we have
 * verified ourselves, and the client is only ever told the outcome.
 */

/**
 * Addresses granted the owner role on sign-in.
 *
 * Read from the environment, never written down here. The address is not a
 * secret in the cryptographic sense — knowing it grants nothing, because
 * access still requires signing into that Google account with a verified
 * email — but it names the single account that controls everything, and a
 * public repository is a poor place to point at it.
 *
 * Set it in functions/.env, which is gitignored:
 *
 *   OWNER_EMAILS=someone@gmail.com
 *
 * Comma-separated for more than one. Losing the Gmail account means losing
 * admin access, so keep 2FA on it and add a second address you control before
 * that becomes urgent — this is the one change that needs no code edit.
 *
 * Matching is an exact, case-insensitive comparison against the verified
 * `email` on the Google token. Gmail's dot and plus aliases are deliberately
 * NOT normalised: the rule stays predictable, and the real mailbox is the
 * only one that can hold a Google session for the address anyway.
 */
export const OWNER_EMAILS: readonly string[] = (process.env.OWNER_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

/**
 * With no owner address configured, nobody is ever granted the owner role.
 * That is the safe direction to fail — an app with no admin beats an app with
 * the wrong one — but it is silent, so it says so loudly in the log.
 */
if (OWNER_EMAILS.length === 0) {
  console.error(
    "OWNER_EMAILS is not set. No account will be granted the owner role. " +
      "Set it in functions/.env and redeploy."
  );
}

/**
 * Where Firestore is, and therefore where every Firestore trigger must be.
 *
 * asia-south2 is Delhi. The database was created there, and a Firestore
 * database's location is fixed at creation — it cannot be moved afterwards,
 * so this follows the database rather than the other way round.
 *
 * Changing this means changing FUNCTIONS_REGION in mobile/src/lib/region.ts
 * to match: callables are addressed by region, and a client calling the wrong
 * one gets a not-found rather than anything useful.
 */
export const REGION = "asia-south2";

/**
 * Region for the Identity Platform blocking functions (beforeUserCreated /
 * beforeUserSignedIn).
 *
 * Deliberately a separate constant from REGION. Firestore triggers have no
 * choice — they must sit with the database — but blocking functions do, and
 * Identity Platform supports a shorter list of regions than Firestore does.
 * asia-south2 is a newer, thinner region than asia-south1.
 *
 * If `firebase deploy` rejects this with an unsupported-region error, set it
 * to "us-central1". Sign-in then costs one extra round trip and nothing else
 * changes — these two functions touch no Firestore data beyond one document
 * read and write.
 */
export const BLOCKING_REGION = "asia-south2";

/**
 * Region for the scheduled escalation pass.
 *
 * Cloud Scheduler does not exist in asia-south2 — the deploy fails there with
 * "Location 'asia-south2' is not a valid location". asia-south1 (Mumbai) is
 * the nearest region that has it.
 *
 * A scheduled job has no reason to sit with the database: it wakes up once a
 * day and talks to Firestore through the Admin SDK, which is region-agnostic.
 * The cross-region hop costs milliseconds on a job that runs at nine in the
 * morning and is measured in seconds. Firestore *triggers* are the ones with
 * no choice, and they stay in REGION.
 */
export const SCHEDULER_REGION = "asia-south1";

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
/**
 * Nothing is kept longer than a year. See functions/src/retention.ts — the
 * floor is 90 days regardless of what is written here.
 */
export const DEFAULT_RETENTION = {
  enabled: true,
  days: 365,
};

export const DEFAULT_CHANNELS = {
  push: true,
  telegram: true,
  whatsapp: false,
  sms: false,
  email: false,
};
