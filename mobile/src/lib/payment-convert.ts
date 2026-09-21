/**
 * Reading payment-shaped things back out of Firestore.
 *
 * Kept apart from payments.ts so the arithmetic there stays free of Firestore
 * types and can be tested on its own, and apart from data.ts so the
 * converters for one feature sit together.
 */

import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

import { toDate, toNumber, toStringOrNull } from "./convert.ts";
import { EMPTY_RATES, type Rates, type TaskStatus } from "./model.ts";
import type { Advance, Payment, PaymentStatus, PayUnit } from "./payments.ts";

const UNITS: PayUnit[] = [
  "voice-character",
  "voice-narration",
  "sound-design",
  "cover",
  "manual",
];

/**
 * A task written before the review flow existed carries only `done`. It meant
 * "the work is accepted" then, which is what `approved` means now — so that
 * is what it reads as, and no migration has to be run against live data.
 */
export function taskStatusFrom(status: unknown, done: unknown): TaskStatus {
  if (status === "open" || status === "submitted" || status === "approved" || status === "paid") {
    return status;
  }
  return done === true ? "approved" : "open";
}

/** A number that is a rate, or null. Zero is not a rate; it is "unpaid". */
function rate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function ratesFrom(value: unknown): Rates {
  if (!value || typeof value !== "object") return EMPTY_RATES;
  const d = value as Record<string, unknown>;
  return {
    voiceCharacter: rate(d.voiceCharacter),
    voiceNarration: rate(d.voiceNarration),
    soundDesign: rate(d.soundDesign),
    cover: rate(d.cover),
  };
}

function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function toPayment(snap: QueryDocumentSnapshot<DocumentData>): Payment {
  const d = snap.data();
  const unit = UNITS.includes(d.unit as PayUnit) ? (d.unit as PayUnit) : "manual";
  return {
    id: snap.id,
    taskId: d.taskId ?? "",
    uid: d.uid ?? "",
    episodeId: d.episodeId ?? "",
    taskType: d.taskType ?? "",
    status: (d.status === "paid" ? "paid" : "pending") as PaymentStatus,
    unit,
    quantity: amount(d.quantity),
    rate: rate(d.rate),
    estimatedAmount: amount(d.estimatedAmount),
    finalAmount: amount(d.finalAmount),
    recordingMinutes: amount(d.recordingMinutes),
    wordCount: amount(d.wordCount),
    comment: toStringOrNull(d.comment),
    approvedAt: toDate(d.approvedAt),
    paidAt: toDate(d.paidAt),
    settledFromAdvance: d.settledFromAdvance === true,
  };
}

export function toAdvance(snap: QueryDocumentSnapshot<DocumentData>): Advance {
  const d = snap.data();
  return {
    id: snap.id,
    uid: d.uid ?? "",
    amount: toNumber(d.amount),
    note: toStringOrNull(d.note),
    createdAt: toDate(d.createdAt),
  };
}
