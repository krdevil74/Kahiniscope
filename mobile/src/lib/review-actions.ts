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

export interface ApprovalOutcome {
  estimatedAmount: number | null;
  /** Paid on the spot out of money already advanced. */
  settledFromAdvance: boolean;
  balanceAfter: number;
}

export async function approveTask(
  taskId: string,
  details: ApprovalDetails
): Promise<ApprovalOutcome> {
  const call = httpsCallable<
    { taskId: string; decision: "approve" } & ApprovalDetails,
    ApprovalOutcome
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

/**
 * Money handed over before the work exists. The balance it creates is spent
 * automatically by the next approval that it covers.
 */
export async function addAdvance(
  uid: string,
  amount: number,
  note: string | null
): Promise<{ balance: number }> {
  const call = httpsCallable<
    { uid: string; amount: number; note: string | null },
    { advanceId: string; balance: number }
  >(appFunctions(), "addAdvance");
  const { data } = await call({ uid, amount, note });
  return { balance: data.balance };
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

export function advancedToast(name: string, amount: string, balance: string): string {
  return `${amount} advanced to ${name} — balance ${balance}`;
}

/** Approving is two different events depending on whether it settled itself. */
export function approvalToast(
  name: string,
  amount: string,
  outcome: { settledFromAdvance: boolean; balanceAfter: number }
): string {
  return outcome.settledFromAdvance
    ? `Approved — ${amount} taken off ${name}'s advance`
    : `Approved — ${amount} pending for ${name}`;
}
