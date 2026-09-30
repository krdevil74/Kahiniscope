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
import { firstName } from "./format.ts";
import type { Rates, Task } from "./model.ts";
import { money, unitsForTaskType, type PayUnit } from "./payments.ts";
import { appFunctions } from "./region.ts";

/**
 * The one write a member makes to their own task.
 *
 * The note is optional and is replaced rather than appended: what an admin
 * needs beside the work in front of them is what was said about *this*
 * submission, not a thread going back three rejections.
 */
export async function submitTask(taskId: string, note: string | null = null): Promise<void> {
  await updateDoc(doc(db, "tasks", taskId), {
    status: "submitted",
    submittedAt: serverTimestamp(),
    submissionNote: note?.trim() ? note.trim().slice(0, 500) : null,
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

/**
 * The tick on the episode screen, on a task of the admin's own.
 *
 * Accepted outright — there is nobody to hand it to, and an admin has no
 * Submit button — and priced with the unit the kind of work implies and
 * nothing else. The episode screen is not the pricing form and there is no
 * honest place on it to ask for the minutes, so a cover comes out priced off
 * the rate card and a recording comes out with no estimate. That is not a gap:
 * the figure that gets paid is the one the admin types on the Payments queue,
 * which is true of every payment in the app.
 */
export async function approveOwnTask(task: Pick<Task, "id" | "type">): Promise<ApprovalOutcome> {
  return approveTask(task.id, {
    unit: unitsForTaskType(task.type)[0],
    recordingMinutes: null,
    wordCount: null,
    comment: null,
    amount: null,
  });
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

/**
 * Accepting your own work. Three outcomes, because an approval with no minutes
 * behind it has no estimate to quote — and saying "₹— pending" would be worse
 * than saying where the figure gets set.
 */
export function ownApprovalToast(type: string, outcome: ApprovalOutcome): string {
  if (outcome.settledFromAdvance) {
    return `${type} approved — ${money(outcome.estimatedAmount)} taken off your advance`;
  }
  if (outcome.estimatedAmount !== null) {
    return `${type} approved — ${money(outcome.estimatedAmount)} pending for you`;
  }
  return `${type} approved — payment opened, put the amount in on Payments`;
}

/** Ticking somebody else's box: it is in, and it is waiting to be priced. */
export function sentToReviewToast(type: string, name: string): string {
  return `${type} marked in for ${firstName(name)} — price it in Review`;
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
