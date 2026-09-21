/**
 * Reviewing work, and paying for it.
 *
 * A member hands a task in — that write they make themselves, because the
 * rules can express it and a round trip would make the button feel dead. What
 * happens next cannot be a client write at any price: accepting work creates
 * a payment record, and a payment record a member could write is not a
 * payment record.
 *
 * Three doors, all admin only:
 *
 *   reviewTask       approve (and open a payment) or send it back with a reason
 *   markPaymentPaid  the money has gone out; this figure is the real one
 *   (rates)          edited directly on the user document, see firestore.rules
 *
 * Rejecting resets the reminder clock rather than the reminder count: the
 * task goes back to open with `rejectedAt` set, which the escalation engine
 * reads as "chase this every other day" instead of climbing the ladder.
 */

import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

import { REGION } from "./config";
import {
  estimateFor,
  PAY_UNITS,
  quantityFor,
  rateFor,
  ratesFrom,
  unitsForTaskType,
  type PayUnit,
} from "./payments";

interface ReviewRequest {
  taskId?: string;
  decision?: "approve" | "reject";
  /** Rejecting: why. Shown to the member and carried in every reminder. */
  note?: string;
  /** Approving. */
  unit?: string;
  recordingMinutes?: number | null;
  wordCount?: number | null;
  comment?: string | null;
  /** Approving on a typed figure, where there is no rate to multiply. */
  amount?: number | null;
}

function assertAdmin(auth: { token?: Record<string, unknown> } | undefined): void {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const role = auth.token?.role;
  if ((role !== "admin" && role !== "owner") || auth.token?.status !== "approved") {
    throw new HttpsError("permission-denied", "Only an admin can review work.");
  }
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export const reviewTask = onCall<ReviewRequest>({ region: REGION }, async (request) => {
  assertAdmin(request.auth);

  const taskId = request.data?.taskId;
  const decision = request.data?.decision;
  if (!taskId || typeof taskId !== "string") {
    throw new HttpsError("invalid-argument", "A task is required.");
  }
  if (decision !== "approve" && decision !== "reject") {
    throw new HttpsError("invalid-argument", "Approve it or send it back.");
  }

  const db = getFirestore();
  const taskRef = db.collection("tasks").doc(taskId);
  const task = await taskRef.get();
  if (!task.exists) throw new HttpsError("not-found", "That task is gone.");

  const data = task.data() ?? {};
  if (data.status !== "submitted") {
    // Two admins looking at the same queue is the ordinary case, so this is a
    // race worth naming rather than a state worth panicking about.
    throw new HttpsError(
      "failed-precondition",
      "That task is not waiting for review — somebody may have got to it first."
    );
  }

  if (decision === "reject") {
    const note = text(request.data?.note, 500);
    if (!note) {
      // The whole point of sending work back is saying what is wrong with it.
      throw new HttpsError("invalid-argument", "Say why it is going back.");
    }

    await taskRef.set(
      {
        status: "open",
        done: false,
        doneAt: null,
        rejectedAt: Timestamp.now(),
        rejectionNote: note,
        rejectedCount: FieldValue.increment(1),
        // The clock restarts, not the ladder: `rejectedAt` is what makes the
        // engine chase this every other day from here.
        remindersSent: 0,
        lastReminderAt: null,
      },
      { merge: true }
    );

    logger.info("Task sent back", { taskId, by: request.auth?.uid });
    return { status: "open" };
  }

  // --- approve ------------------------------------------------------------

  const allowed = unitsForTaskType(String(data.type ?? ""));
  const unit = (request.data?.unit ?? allowed[0]) as PayUnit;
  if (!PAY_UNITS.includes(unit) || !allowed.includes(unit)) {
    throw new HttpsError(
      "invalid-argument",
      `That is not a way this kind of task is paid. Expected one of: ${allowed.join(", ")}.`
    );
  }

  const recordingMinutes = positive(request.data?.recordingMinutes);
  const wordCount = positive(request.data?.wordCount);
  const comment = text(request.data?.comment, 500);
  const typedAmount = positive(request.data?.amount);

  const assigneeUid = String(data.assigneeUid ?? "");
  const assignee = await db.collection("users").doc(assigneeUid).get();
  const rates = ratesFrom(assignee.data()?.rates);

  // Snapshotted on purpose: raising somebody's rate next month must not
  // restate what this work was worth when it was accepted.
  const rateValue = rateFor(rates, unit);
  const quantity = quantityFor(unit, recordingMinutes);
  const estimatedAmount = estimateFor(quantity, rateValue) ?? typedAmount;

  const paymentRef = db.collection("payments").doc();
  const batch = db.batch();

  batch.set(taskRef, {
    status: "approved",
    done: true,
    doneAt: Timestamp.now(),
    rejectionNote: null,
  }, { merge: true });

  batch.set(paymentRef, {
    taskId,
    uid: assigneeUid,
    episodeId: data.episodeId ?? "",
    taskType: data.type ?? "",
    status: "pending",
    unit,
    quantity,
    rate: rateValue,
    estimatedAmount,
    finalAmount: null,
    recordingMinutes,
    wordCount,
    comment,
    approvedAt: FieldValue.serverTimestamp(),
    approvedBy: request.auth?.uid ?? null,
    paidAt: null,
  });

  await batch.commit();

  logger.info("Task approved, payment opened", {
    taskId,
    paymentId: paymentRef.id,
    unit,
    estimatedAmount,
    by: request.auth?.uid,
  });

  return { status: "approved", paymentId: paymentRef.id, estimatedAmount };
});

/**
 * The money has gone out.
 *
 * The amount is required and is not the estimate: an estimate is arithmetic
 * on a rate, and this is what was actually paid. They are allowed to differ —
 * that is the whole reason the app says so wherever it shows an estimate.
 */
export const markPaymentPaid = onCall<{ paymentId?: string; amount?: number }>(
  { region: REGION },
  async (request) => {
    assertAdmin(request.auth);

    const paymentId = request.data?.paymentId;
    if (!paymentId || typeof paymentId !== "string") {
      throw new HttpsError("invalid-argument", "A payment is required.");
    }
    const amount = positive(request.data?.amount);
    if (amount === null) {
      throw new HttpsError("invalid-argument", "Put in what was actually paid.");
    }

    const db = getFirestore();
    const paymentRef = db.collection("payments").doc(paymentId);
    const payment = await paymentRef.get();
    if (!payment.exists) throw new HttpsError("not-found", "That payment is gone.");
    if (payment.data()?.status === "paid") {
      throw new HttpsError("failed-precondition", "That one is already paid.");
    }

    const batch = db.batch();
    batch.set(
      paymentRef,
      {
        status: "paid",
        finalAmount: amount,
        paidAt: FieldValue.serverTimestamp(),
        paidBy: request.auth?.uid ?? null,
      },
      { merge: true }
    );

    const taskId = payment.data()?.taskId;
    if (taskId) {
      batch.set(db.collection("tasks").doc(String(taskId)), { status: "paid" }, { merge: true });
    }

    await batch.commit();

    logger.info("Payment marked paid", { paymentId, amount, by: request.auth?.uid });
    return { amount };
  }
);
