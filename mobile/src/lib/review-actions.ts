/**
 * Handing work in, reviewing it, and paying for it.
 *
 * Submitting is a direct write: the rules can express exactly that
 * transition, and a round trip to a Cloud Function would make the one button
 * a member has feel dead for a second. Everything after it is a callable,
 * because accepting work opens a payment record and a payment record the
 * client could write would not be a payment record.
 */

import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db } from "./firebase";
import type { Rates } from "./model.ts";
import type { PayUnit } from "./payments.ts";
import { appFunctions } from "./region.ts";

/** The one write a member makes to their own task. */
export async function submitTask(taskId: string): Promise<void> {
  await updateDoc(doc(db, "tasks", taskId), {
    status: "submitted",
    submittedAt: serverTimestamp(),
  });
}

export interface ApprovalDetails {
  unit: PayUnit;
  recordingMinutes: number | null;
  wordCount: number | null;
  comment: string | null;
  /** Where there is no rate to multiply, the figure the admin typed. */
  amount: number | null;
}

export async function approveTask(
  taskId: string,
  details: ApprovalDetails
): Promise<{ estimatedAmount: number | null }> {
  const call = httpsCallable<
    { taskId: string; decision: "approve" } & ApprovalDetails,
    { estimatedAmount: number | null }
  >(appFunctions(), "reviewTask");
  const { data } = await call({ taskId, decision: "approve", ...details });
  return data;
}

/** Sending work back. The reason is required: a bare refusal is not feedback. */
export async function rejectTask(taskId: string, note: string): Promise<void> {
  const call = httpsCallable<{ taskId: string; decision: "reject"; note: string }, unknown>(
    appFunctions(),
    "reviewTask"
  );
  await call({ taskId, decision: "reject", note });
}

export async function markPaymentPaid(paymentId: string, amount: number): Promise<void> {
  const call = httpsCallable<{ paymentId: string; amount: number }, { amount: number }>(
    appFunctions(),
    "markPaymentPaid"
  );
  await call({ paymentId, amount });
}

/**
 * A person's rate card. A direct write, like crafts and the pinned channel —
 * the rules allow an admin exactly these fields on somebody else's record,
 * and validate the shape.
 */
export async function setRates(uid: string, rates: Rates): Promise<void> {
  await updateDoc(doc(db, "users", uid), { rates });
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export function submittedToast(type: string): string {
  return `${type} sent for review`;
}

export function approvedToast(name: string, estimate: string): string {
  return `Approved — ${estimate} pending for ${name}`;
}

export function rejectedToast(name: string): string {
  return `Sent back to ${name} with your note`;
}

export function paidToast(name: string, amount: string): string {
  return `${amount} marked paid to ${name}`;
}
