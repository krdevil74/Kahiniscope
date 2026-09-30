/**
 * The screenshot that proves a payment went out, as the app reads it.
 *
 * The bytes are not on the payment record. They are one document per payment in
 * `paymentProofs`, deleted thirty days after upload — see
 * functions/src/payment-proof.ts for why, which is cost: a payment is loaded by
 * every total on both sides of this app, and nobody should pay to fetch a
 * few hundred kilobytes of JPEG to add up a column.
 *
 * So a payment carries two dates instead, and that is all any screen needs:
 *
 *   proofAttachedAt   there is (or was) a screenshot
 *   proofExpiresAt    until when it can be downloaded
 *
 * Both are set by the server. `isProofAvailable` compares the second against
 * now, which is also what makes the sweep cheap — deleting the image does not
 * have to write to the payment to say the image is gone.
 *
 * The limits below are a second implementation of the ones in
 * functions/src/payment-proof.ts, the same way the rates arithmetic and the
 * escalation ladder are. They must agree: the app resizes to fit them, and the
 * server refuses anything that does not.
 *
 * Pure: no Firebase, no React. Unit tested.
 */

/** Kept for thirty days. The same constant is on the server. */
export const PROOF_TTL_DAYS = 30;

/**
 * The largest base64 payload the server will take, in characters — about a
 * 500 KB image. A Firestore document cannot exceed 1 MiB, and base64 is a
 * third larger than the bytes it encodes.
 */
export const MAX_PROOF_BASE64 = 700_000;

/**
 * What the picked image is resized and re-encoded to before it is sent.
 *
 * A phone screenshot is a tall PNG of a few hundred kilobytes to a couple of
 * megabytes, and the payload limit above is not negotiable — so the app does
 * not hope, it converts: longest edge to 1280, JPEG at 60%. A UPI confirmation
 * is large flat text on a plain ground, which survives that with room to spare,
 * and it lands reliably around 100–200 KB.
 */
export const PROOF_MAX_EDGE = 1280;
export const PROOF_JPEG_QUALITY = 0.6;
export const PROOF_CONTENT_TYPE = "image/jpeg";

/** What the server accepts, for a picker that is handed something else. */
export const PROOF_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** The two dates a payment carries about its screenshot. */
export interface ProofDates {
  proofAttachedAt: Date | null;
  proofExpiresAt: Date | null;
}

/** The document itself, once somebody has asked for it. */
export interface PaymentProof {
  paymentId: string;
  uid: string;
  /** base64, no data: prefix. */
  data: string;
  contentType: string;
  byteSize: number;
  uploadedAt: Date | null;
  expiresAt: Date | null;
}

/** Was a screenshot ever attached to this payment? */
export function hasProof(payment: ProofDates): boolean {
  return payment.proofAttachedAt !== null;
}

/**
 * Can it still be downloaded?
 *
 * The expiry is the thing that is true, not the presence of the document: the
 * sweep runs once a day, so for a few hours a proof can be past its date and
 * still sitting there. Treating it as gone the moment it expires means the app
 * and the sweep never disagree in a way anybody can see.
 */
export function isProofAvailable(payment: ProofDates, now: Date): boolean {
  if (!payment.proofExpiresAt) return false;
  return payment.proofExpiresAt.getTime() > now.getTime();
}

/** Whole days left, floored, never negative. */
export function proofDaysLeft(payment: ProofDates, now: Date): number {
  if (!payment.proofExpiresAt) return 0;
  const ms = payment.proofExpiresAt.getTime() - now.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * What the row says about the screenshot. Three states, and the expired one is
 * the reason a payment keeps `proofAttachedAt` at all — "the screenshot has
 * gone" is a different sentence from saying nothing.
 */
export function proofLabel(payment: ProofDates, now: Date): string | null {
  if (!hasProof(payment)) return null;
  if (!isProofAvailable(payment, now)) return "Screenshot expired";
  const days = proofDaysLeft(payment, now);
  if (days === 0) return "Screenshot · last day";
  return `Screenshot · ${days} day${days === 1 ? "" : "s"} left`;
}

/** Why it will not be there forever, said once, where it matters. */
export const PROOF_RETENTION_NOTE =
  `Payment screenshots are kept for ${PROOF_TTL_DAYS} days and then deleted. ` +
  `The payment itself — the amount, the date and the working — is kept.`;

/**
 * The file a download lands in.
 *
 * Named after the payment rather than the image, because the file leaves the
 * app and has to mean something in a downloads folder six months later.
 */
export function proofFileName(
  payment: { id: string; taskType: string },
  contentType: string = PROOF_CONTENT_TYPE
): string {
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const slug = payment.taskType
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `payment-${slug || "task"}-${payment.id.slice(0, 6)}.${extension}`;
}

/** What an <Image> source needs. */
export function proofDataUri(proof: Pick<PaymentProof, "data" | "contentType">): string {
  return `data:${proof.contentType};base64,${proof.data}`;
}

/** Is this small enough to send? The server refuses the same figure. */
export function fitsProofLimit(base64: string): boolean {
  return base64.length > 0 && base64.length <= MAX_PROOF_BASE64;
}
