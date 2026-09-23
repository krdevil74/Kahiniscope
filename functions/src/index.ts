/**
 * Cloud Functions for the Kahiniscope production task manager.
 *
 * Build order step 1 ships identity only: Google sign-in, the owner claim and
 * the Firestore rules that read it. The escalation engine, the channel chain
 * and the admin callables arrive in later steps and are exported from here.
 */

import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";

import { REGION } from "./config";

initializeApp();

setGlobalOptions({ region: REGION, maxInstances: 10 });

export { onBeforeCreate, onBeforeSignIn, syncClaimsOnUserWrite } from "./auth";
export { declineRegistration } from "./registrations";
export { setMemberRole } from "./roles-admin";
export { escalateDaily, runEscalationNow } from "./escalation/run";
export { telegramWebhook } from "./telegram-webhook";
export { nudgeTask, nudgeAllOpen } from "./nudge";
export { welcomeOnApproval } from "./welcome";
export { linkTelegram } from "./link-telegram";
export { markPaymentPaid, reviewTask } from "./review";
export { addAdvance } from "./advances";
export {
  addContact,
  approveAndLinkContact,
  contactTelegramLink,
  removeContact,
  updateContact,
} from "./contacts";
export { purgeOldData } from "./retention";
export { syncEpisodeRosterOnTaskWrite } from "./episode-roster";
