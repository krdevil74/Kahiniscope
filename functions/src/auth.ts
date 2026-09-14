/**
 * Identity: who gets in, and what their token says about them.
 *
 * Three functions cover the whole of it:
 *
 *   onBeforeCreate  — first sign-in ever. Writes users/{uid} and decides,
 *                     from the verified Google token, whether this is the
 *                     owner or yet another pending stranger.
 *   onBeforeSignIn  — every sign-in. Re-mints claims from the stored document
 *                     so an approval or a promotion is on the token the next
 *                     time the member opens the app.
 *   syncClaimsOnUserWrite — users/{uid} changed. Mints the matching claims
 *                     immediately, so approving someone unlocks their
 *                     dashboard without waiting for a sign-out.
 */

import { getAuth, UserRecord } from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import {
  AuthBlockingEvent,
  beforeUserCreated,
  beforeUserSignedIn,
} from "firebase-functions/v2/identity";
import { logger } from "firebase-functions/v2";

import { BLOCKING_REGION, REGION } from "./config";
import {
  Access,
  accessChanged,
  displayNameFrom,
  initialAccess,
  reconcileAccess,
} from "./roles";

const db = () => getFirestore();

/** Shape of the claims Firestore rules read off the token. */
function claimsFor(access: Access) {
  return { role: access.role, status: access.status };
}

/**
 * Create users/{uid} for a sign-in we have not seen before.
 *
 * Only the fields we can know from the Google token are filled. Phone, craft
 * and the applicant's note are typed into the registration form afterwards
 * and written by the client onto its own document, which is the one write a
 * pending account is allowed to make.
 */
async function createUserDocument(
  event: AuthBlockingEvent,
  access: Access
): Promise<void> {
  const user = event.data;
  if (!user) return;

  await db()
    .collection("users")
    .doc(user.uid)
    .set(
      {
        name: displayNameFrom(user.displayName, user.email),
        email: (user.email ?? "").toLowerCase(),
        phone: user.phoneNumber ?? null,
        telegramChatId: null,
        craft: null,
        status: access.status,
        role: access.role,
        fcmTokens: [],
        note: null,
        createdAt: FieldValue.serverTimestamp(),
      },
      // merge, so a re-run after a partial failure never clobbers a note or
      // a craft the applicant has already submitted.
      { merge: true }
    );
}

/**
 * First sign-in. Runs inside the sign-up call, so it must be quick and must
 * not throw for anything short of a real denial — throwing here means the
 * user cannot create an account at all.
 */
export const onBeforeCreate = beforeUserCreated(
  { region: BLOCKING_REGION },
  async (event) => {
    const user = event.data;
    if (!user) return;

    const access = initialAccess(user.email, user.emailVerified);

    try {
      await createUserDocument(event, access);
    } catch (err) {
      // Sign-in still succeeds; onBeforeSignIn repairs the missing document
      // on the very next request.
      logger.error("Failed to write user document on create", {
        uid: user.uid,
        err,
      });
    }

    logger.info("New account", {
      uid: user.uid,
      role: access.role,
      status: access.status,
    });

    return { customClaims: claimsFor(access) };
  }
);

/**
 * Every sign-in. The stored document is the source of truth for role and
 * status; the owner list overrides it, so the owner account cannot be locked
 * out by a bad write and nobody else can be written into the owner role.
 */
export const onBeforeSignIn = beforeUserSignedIn(
  { region: BLOCKING_REGION },
  async (event) => {
    const user = event.data;
    if (!user) return;

    let access: Access;
    try {
      const snap = await db().collection("users").doc(user.uid).get();

      if (!snap.exists) {
        access = initialAccess(user.email, user.emailVerified);
        await createUserDocument(event, access);
      } else {
        access = reconcileAccess(
          snap.data() ?? {},
          user.email,
          user.emailVerified
        );

        const stored = snap.data() ?? {};
        if (accessChanged(stored as Partial<Access>, access)) {
          // The document disagreed with the owner list. Put it right.
          await snap.ref.set(
            { role: access.role, status: access.status },
            { merge: true }
          );
          logger.warn("Repaired access on user document", {
            uid: user.uid,
            was: { role: stored.role, status: stored.status },
            now: access,
          });
        }
      }
    } catch (err) {
      logger.error("Failed to resolve access on sign-in", {
        uid: user.uid,
        err,
      });
      // Least privilege on any failure: a pending member sees the holding
      // screen, which is the correct thing to show when we are not sure.
      access = initialAccess(user.email, user.emailVerified);
    }

    return { customClaims: claimsFor(access) };
  }
);

/**
 * Keep the token in step with the document.
 *
 * Approving a registration is a one-field write to users/{uid}.status by an
 * admin. That write lands here, the claim is re-minted, and the member's app
 * — which is already listening to its own user document — calls
 * getIdToken(true) and unlocks. No sign-out, no second visit.
 *
 * The same path enforces the owner invariant on writes that did not come
 * through sign-in: a document that names anyone but an owner-list address as
 * owner is rewritten to admin before any claim is minted.
 */
export const syncClaimsOnUserWrite = onDocumentWritten(
  { document: "users/{uid}", region: REGION },
  async (event) => {
    const uid = event.params.uid;
    const after = event.data?.after as QueryDocumentSnapshot | undefined;

    if (!after?.exists) {
      // Declined or deleted. Nothing to mint; the decline path deletes the
      // auth user itself.
      return;
    }

    let authUser: UserRecord;
    try {
      authUser = await getAuth().getUser(uid);
    } catch (err) {
      logger.warn("No auth user for user document", { uid, err });
      return;
    }

    const stored = after.data() ?? {};
    const access = reconcileAccess(
      stored,
      authUser.email,
      authUser.emailVerified
    );

    if (accessChanged(stored as Partial<Access>, access)) {
      // Repair first. This write re-enters this function once, and the second
      // pass finds the document already correct and stops.
      await after.ref.set(
        { role: access.role, status: access.status },
        { merge: true }
      );
      logger.warn("Rejected an unsupported role on users document", {
        uid,
        attempted: { role: stored.role, status: stored.status },
        applied: access,
      });
      return;
    }

    const current = (authUser.customClaims ?? {}) as Partial<Access>;
    if (!accessChanged(current, access)) return;

    await getAuth().setCustomUserClaims(uid, claimsFor(access));

    // Losing privilege should not wait for an hour-old token to expire.
    // Revoking forces a refresh; note that an ID token already in flight
    // stays valid until it expires, so this narrows the window rather than
    // closing it.
    const lostPrivilege =
      (current.status === "approved" && access.status !== "approved") ||
      (current.role === "owner" && access.role !== "owner") ||
      (current.role === "admin" && access.role === "member");

    if (lostPrivilege) {
      await getAuth().revokeRefreshTokens(uid);
    }

    logger.info("Claims updated", { uid, from: current, to: access });
  }
);
