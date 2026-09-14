/**
 * Privileged parts of the approval queue.
 *
 * Approving and revoking are plain Firestore writes — the security rules let
 * an admin change `status` and nothing else, and the claim-sync trigger does
 * the rest. Declining is different: it deletes the Firebase Auth user, which
 * no security rule can do, so it comes through here.
 */

import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

import { REGION } from "./config";

interface DeclineRequest {
  uid?: string;
}

/**
 * Decline a registration: the user document goes, and so does the account.
 *
 * Only a pending registration can be declined. Removing somebody who has
 * already been approved is Revoke — which puts them back in this queue rather
 * than destroying their account — and routing both through one call would
 * make an accidental tap unrecoverable.
 */
export const declineRegistration = onCall<DeclineRequest>(
  { region: REGION },
  async (request) => {
    const caller = request.auth;
    const role = caller?.token?.role;
    const status = caller?.token?.status;

    if (!caller) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }
    if ((role !== "admin" && role !== "owner") || status !== "approved") {
      throw new HttpsError("permission-denied", "Only an admin can decline a registration.");
    }

    const uid = request.data?.uid;
    if (!uid || typeof uid !== "string") {
      throw new HttpsError("invalid-argument", "A uid is required.");
    }
    if (uid === caller.uid) {
      throw new HttpsError("failed-precondition", "You cannot decline your own account.");
    }

    const db = getFirestore();
    const ref = db.collection("users").doc(uid);
    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError("not-found", "That registration is already gone.");
    }
    if (snap.data()?.status !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        "That account has been approved. Revoke it instead — declining would delete it."
      );
    }

    const name = snap.data()?.name ?? "The applicant";

    // Document first: if deleting the auth user fails, the next sign-in
    // recreates a clean pending document rather than leaving a stranded one
    // that nobody can see.
    await ref.delete();

    try {
      await getAuth().deleteUser(uid);
    } catch (err) {
      logger.warn("Declined registration, but the auth user could not be deleted", { uid, err });
    }

    logger.info("Registration declined", { uid, by: caller.uid });
    return { name };
  }
);
