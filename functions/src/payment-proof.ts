/**
 * The screenshot that proves the money went out.
 *
 * An admin pays by bank transfer or UPI, screenshots the confirmation, and the
 * artist can see it against the payment. That is the whole feature. What makes
 * it worth a file of its own is where the bytes live.
 *
 * **They are not on the payment record.** A payment is kept for a year and read
 * constantly — every total on both sides of the app loads these documents — and
 * a few hundred kilobytes of base64 sitting in one would be paid for on every
 * one of those reads, forever, long after anybody cared to look at the image.
 * So the proof is its own document in its own collection, keyed by the payment
 * id, and it is deleted after thirty days. The payment keeps two small dates
 * saying a proof exists and until when, which is all any screen needs to decide
 * whether to offer the download — nobody loads the bytes until somebody asks.
 *
 * Two dates rather than one flag, because "there was a screenshot and it has
 * expired" and "there was never a screenshot" are different things to say.
 *
 * Deletion is this file's own scheduled job rather than a Firestore TTL policy.
 * A TTL policy would do the same work, but it is configured against the project
 * with gcloud and cannot be declared in this repository — so it would be a step
 * somebody has to remember on a new project, and there would be nothing here to
 * test. The two are compatible: if a TTL policy is attached to
 * `paymentProofs.expiresAt` as well, whichever runs first wins and the other
 * finds nothing to do.
 */

import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";

import { REGION, SCHEDULER_REGION } from "./config";
import { TIME_ZONE } from "./escalation/decide";

/** The collection the bytes live in. One document per payment. */
export const PROOFS = "paymentProofs";

/**
 * How long a screenshot is kept.
 *
 * Thirty days is long enough to settle an argument about last month's payment
 * and short enough that the storage never accumulates. The payment record
 * itself is untouched by this: the amount, the date and the working are kept
 * for a year like everything else.
 */
export const PROOF_TTL_DAYS = 30;

/**
 * The largest base64 payload accepted, in characters.
 *
 * A Firestore document cannot exceed 1 MiB including field names and indexing
 * overhead, and base64 is a third larger than the bytes it encodes — so this
 * is about a 500 KB image, which is a generously large phone screenshot once
 * the app has resized it. Anything bigger is refused here rather than being
 * written and failing on the way in, so the admin gets a sentence instead of a
 * Firestore error.
 */
export const MAX_PROOF_BASE64 = 700_000;

/** What a payment screenshot is allowed to be. */
export const PROOF_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** How many expired proofs one sweep deletes. */
export const MAX_PROOF_DELETES = 500;

/** When a proof attached now stops being available. */
export function expiryFrom(now: Date, days: number = PROOF_TTL_DAYS): Date {
  const safeDays = Math.max(1, Math.trunc(days) || PROOF_TTL_DAYS);
  return new Date(now.getTime() + safeDays * 86_400_000);
}

/**
 * Is this string base64, and nothing but?
 *
 * Checked because the string goes into a data: URI on the other side. A
 * payload with anything else in it is either a bug in the app or somebody
 * being clever, and neither belongs in a document the member's phone will
 * render.
 */
export function isBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/** The size of the image itself, which is what is worth logging. */
export function base64Bytes(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.max(0, (value.length / 4) * 3 - padding);
}

function assertAdmin(auth: { token?: Record<string, unknown> } | undefined): void {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const role = auth.token?.role;
  if ((role !== "admin" && role !== "owner") || auth.token?.status !== "approved") {
    throw new HttpsError("permission-denied", "Only an admin can attach a payment screenshot.");
  }
}

interface AttachRequest {
  paymentId?: string;
  /** The image, base64, without a data: prefix. */
  data?: string;
  contentType?: string;
}

/**
 * Attach a screenshot to a payment, replacing whatever was there.
 *
 * A callable rather than a client write, for the ordinary reason and one more:
 * the expiry has to be set by the server's clock. A phone with the wrong date
 * would otherwise decide for itself when the image disappears — this codebase
 * has already been bitten by a device clock once, on the reminder ladder.
 *
 * Replacing is allowed and resets the thirty days. The old bytes are overwritten
 * in place; there is no history, because a payment has one screenshot the way it
 * has one amount.
 */
export const attachPaymentProof = onCall<AttachRequest>(
  { region: REGION },
  async (request) => {
    assertAdmin(request.auth);

    const paymentId = request.data?.paymentId;
    if (!paymentId || typeof paymentId !== "string") {
      throw new HttpsError("invalid-argument", "A payment is required.");
    }

    const contentType = request.data?.contentType;
    if (typeof contentType !== "string" || !PROOF_CONTENT_TYPES.includes(contentType)) {
      throw new HttpsError("invalid-argument", "A screenshot has to be a JPEG, PNG or WebP.");
    }

    const data = request.data?.data;
    if (typeof data !== "string" || !isBase64(data)) {
      throw new HttpsError("invalid-argument", "That image did not arrive in one piece.");
    }
    if (data.length > MAX_PROOF_BASE64) {
      // The app resizes before sending, so this is a guard rather than a
      // workflow — but it has to say something a person can act on.
      throw new HttpsError(
        "invalid-argument",
        "That screenshot is too large. Crop it, or take a fresh one."
      );
    }

    const db = getFirestore();
    const paymentRef = db.collection("payments").doc(paymentId);
    const payment = await paymentRef.get();
    if (!payment.exists) throw new HttpsError("not-found", "That payment is gone.");

    const uid = String(payment.data()?.uid ?? "");
    const expiresAt = expiryFrom(new Date());
    const byteSize = base64Bytes(data);

    // One batch: a proof document nothing points at is invisible, and a payment
    // that advertises a screenshot that was never written offers a download
    // that fails.
    const batch = db.batch();
    batch.set(db.collection(PROOFS).doc(paymentId), {
      paymentId,
      // Copied onto the proof rather than looked up through the payment: it is
      // what the security rule reads, and a rule that has to get() another
      // document to answer "is this yours" pays for that read on every check.
      uid,
      data,
      contentType,
      byteSize,
      uploadedAt: FieldValue.serverTimestamp(),
      uploadedBy: request.auth?.uid ?? null,
      expiresAt: Timestamp.fromDate(expiresAt),
    });
    batch.set(
      paymentRef,
      { proofAttachedAt: FieldValue.serverTimestamp(), proofExpiresAt: Timestamp.fromDate(expiresAt) },
      { merge: true }
    );
    await batch.commit();

    logger.info("Payment screenshot attached", {
      paymentId,
      uid,
      byteSize,
      contentType,
      expiresAt: expiresAt.toISOString(),
      by: request.auth?.uid,
    });

    return { expiresAt: expiresAt.toISOString(), byteSize };
  }
);

/**
 * One sweep of the expired proofs.
 *
 * The payment documents are deliberately left alone. `proofExpiresAt` in the
 * past is exactly what "the screenshot has expired" means, on both sides of the
 * app — clearing the field would cost a write per payment to say the same thing
 * the date already says, and would lose the fact that there was one.
 */
export async function runProofSweep(now: Date = new Date()): Promise<{ deleted: number }> {
  const db = getFirestore();
  const snap = await db
    .collection(PROOFS)
    .where("expiresAt", "<=", Timestamp.fromDate(now))
    .limit(MAX_PROOF_DELETES)
    .get();

  if (snap.empty) {
    logger.info("Proof sweep finished", { deleted: 0 });
    return { deleted: 0 };
  }

  const batch = db.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();

  logger.info("Proof sweep finished", { deleted: snap.size });
  return { deleted: snap.size };
}

/**
 * Daily at 03:30 Dhaka — half an hour behind the weekly retention sweep, so
 * the two never touch the same documents at the same moment, and well clear of
 * the 09:00 escalation pass.
 *
 * Daily rather than weekly, unlike retention: "deleted after a month" should
 * mean a month, and a weekly job would keep some images for thirty-seven days.
 */
export const purgeExpiredProofs = onSchedule(
  {
    schedule: "30 3 * * *",
    timeZone: TIME_ZONE,
    region: SCHEDULER_REGION,
    retryCount: 1,
  },
  async () => {
    await runProofSweep(new Date());
  }
);
