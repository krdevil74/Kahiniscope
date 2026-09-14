/**
 * Promotion and demotion.
 *
 * The security rules already stop an admin from editing anybody's `role` —
 * only the owner can. This callable exists anyway, for three reasons the
 * rules cannot cover: it refuses to mint a second owner, it refuses to
 * promote somebody who has not been approved, and on demotion it revokes the
 * refresh tokens immediately rather than letting an hour-old admin token run
 * out on its own.
 */

import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

import { REGION } from "./config";
import { isOwnerEmail } from "./roles";

interface SetRoleRequest {
  uid?: string;
  role?: "admin" | "member";
}

export const setMemberRole = onCall<SetRoleRequest>({ region: REGION }, async (request) => {
  const caller = request.auth;

  if (!caller) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  // The owner claim, and nothing weaker. An admin cannot promote anybody,
  // themselves included.
  if (caller.token?.role !== "owner" || caller.token?.status !== "approved") {
    throw new HttpsError(
      "permission-denied",
      "Only the master admin can promote or demote."
    );
  }

  const { uid, role } = request.data ?? {};

  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "A uid is required.");
  }
  if (role !== "admin" && role !== "member") {
    throw new HttpsError("invalid-argument", "Role must be admin or member.");
  }
  if (uid === caller.uid) {
    throw new HttpsError("failed-precondition", "You cannot change your own role.");
  }

  const db = getFirestore();
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "No such member.");
  }

  const current = snap.data() ?? {};

  // There is exactly one owner account, bound to the address in config.ts.
  // Nobody is promoted into it and nobody is demoted out of it here.
  const authUser = await getAuth().getUser(uid);
  if (isOwnerEmail(authUser.email, authUser.emailVerified) || current.role === "owner") {
    throw new HttpsError(
      "failed-precondition",
      "That is the master admin account. It cannot be changed from inside the app."
    );
  }

  if (role === "admin" && current.status !== "approved") {
    throw new HttpsError(
      "failed-precondition",
      "Approve this registration before making them an admin."
    );
  }

  if (current.role === role) {
    return { name: current.name ?? "They", role, changed: false };
  }

  await ref.set({ role }, { merge: true });

  // syncClaimsOnUserWrite mints the claim from that write. Demotion also
  // revokes what is already out there, so an admin tab left open loses its
  // powers now rather than within the hour.
  if (role === "member") {
    await getAuth().revokeRefreshTokens(uid);
  }

  logger.info("Role changed", { uid, role, by: caller.uid });
  return { name: current.name ?? "They", role, changed: true };
});
