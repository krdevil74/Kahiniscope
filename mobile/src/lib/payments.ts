/**
 * What a piece of work is worth, and what has actually been paid for it.
 *
 * The shape of the money is per person, not per craft: two voice artists on
 * the same episode are not on the same rate, and that is the whole reason
 * rates live on the user record rather than in a price list. A rate is per
 * unit — a minute of audio, a cover — and the unit is decided by the kind of
 * task, except where there isn't one, which is most kinds. For those the
 * admin simply types a figure.
 *
 * Voice work is the awkward one: the same artist is worth a different rate
 * reading narration than performing a character, so they carry two, and the
 * admin says which at the moment of approval.
 *
 * Nothing here is an amount that has been agreed. An estimate is arithmetic
 * on a rate that was true when the work was approved; the admin sets the real
 * figure when they pay. That distinction is the point of the whole module —
 * see `isEstimateOnly`.
 *
 * Pure: no Firebase, no React. Unit tested.
 */

import { CURRENCY, type Rates } from "./model.ts";

export type { Rates };

export type PayUnit =
  | "voice-character"
  | "voice-narration"
  | "sound-design"
  | "cover"
  | "manual";

export type PaymentStatus = "pending" | "paid";

/**
 * Money handed over before the work existed.
 *
 * Kept as its own record rather than as a number that goes up and down,
 * because "where did this balance come from" is a question somebody will ask
 * and a bare total cannot answer.
 */
export interface Advance {
  id: string;
  uid: string;
  amount: number;
  note: string | null;
  createdAt: Date | null;
}

export interface Payment {
  id: string;
  taskId: string;
  /** The person being paid. */
  uid: string;
  episodeId: string;
  taskType: string;
  status: PaymentStatus;
  unit: PayUnit;
  /** Minutes of audio, or covers delivered. Null where the unit has none. */
  quantity: number | null;
  /**
   * The rate as it stood when the work was approved. Snapshotted on purpose:
   * an admin raising somebody's rate must not quietly restate what last
   * month's approved work was worth.
   */
  rate: number | null;
  /** quantity × rate. Null when there is no rate to multiply. */
  estimatedAmount: number | null;
  /** What was actually paid. Null until it is. */
  finalAmount: number | null;
  recordingMinutes: number | null;
  wordCount: number | null;
  comment: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  /**
   * Settled the moment it was approved, out of money already advanced. No
   * admin ever pressed "mark paid" on this one, which is worth saying on
   * screen rather than leaving it looking like an ordinary payment.
   */
  settledFromAdvance: boolean;
}

// ---------------------------------------------------------------------------
// Which unit a kind of work is measured in
// ---------------------------------------------------------------------------

export const UNIT_LABELS: Record<PayUnit, string> = {
  "voice-character": "Character",
  "voice-narration": "Narration",
  "sound-design": "Sound design",
  cover: "Cover",
  manual: "Fixed amount",
};

/** What one unit is, for a sentence like "50 per minute". */
export const UNIT_NOUNS: Record<PayUnit, string> = {
  "voice-character": "minute",
  "voice-narration": "minute",
  "sound-design": "minute",
  cover: "cover",
  manual: "task",
};

/**
 * The units an admin may choose from when approving this kind of task.
 *
 * Voice recording offers two, and the admin has to say which — the rate
 * differs and nothing in the task itself reveals the answer. Everything not
 * named here is paid as a figure the admin types, which is deliberate: a
 * price list that pretends to cover editing and SEO would be a price list
 * nobody trusted.
 */
export function unitsForTaskType(taskType: string): PayUnit[] {
  switch (taskType) {
    case "Voice recording":
      return ["voice-character", "voice-narration"];
    case "Dubbing / mixing":
      return ["sound-design"];
    case "Thumbnail / graphics":
      return ["cover"];
    default:
      return ["manual"];
  }
}

/** Does this kind of work need minutes typed in before it can be priced? */
export function needsRecordingTime(unit: PayUnit): boolean {
  return unit === "voice-character" || unit === "voice-narration" || unit === "sound-design";
}

/** Scripts record a word count. It is context for the admin, not a multiplier. */
export function needsWordCount(taskType: string): boolean {
  return taskType === "Script writing";
}

export function rateFor(rates: Rates, unit: PayUnit): number | null {
  switch (unit) {
    case "voice-character":
      return rates.voiceCharacter;
    case "voice-narration":
      return rates.voiceNarration;
    case "sound-design":
      return rates.soundDesign;
    case "cover":
      return rates.cover;
    case "manual":
      return null;
  }
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

/**
 * quantity × rate, or null when there is nothing to multiply.
 *
 * Rounded to whole rupees: paise in a voice-over invoice is noise, and a
 * running total made of fractions reads as though it were precise.
 */
export function estimateFor(quantity: number | null, rate: number | null): number | null {
  if (quantity === null || rate === null) return null;
  if (!Number.isFinite(quantity) || !Number.isFinite(rate)) return null;
  if (quantity < 0 || rate < 0) return null;
  return Math.round(quantity * rate);
}

/**
 * Is this figure still only arithmetic?
 *
 * Until an admin has paid, the number on a member's screen is a rate times a
 * quantity and nothing more. The app says so, loudly, wherever it shows one —
 * quality is the admin's call and the final figure can differ.
 */
export function isEstimateOnly(payment: Pick<Payment, "status" | "finalAmount">): boolean {
  return payment.status !== "paid" || payment.finalAmount === null;
}

/** What to show for a payment: the real figure if there is one, else the estimate. */
export function amountToShow(payment: Pick<Payment, "finalAmount" | "estimatedAmount">): number | null {
  return payment.finalAmount ?? payment.estimatedAmount;
}

// ---------------------------------------------------------------------------
// Advances
// ---------------------------------------------------------------------------

export interface Settlement {
  /** Whether the balance covered it outright. */
  settled: boolean;
  /** What was taken off the balance. Zero when nothing was. */
  spent: number;
  balanceAfter: number;
}

/**
 * Can this approval be paid out of money already advanced?
 *
 * All or nothing, deliberately. Splitting one approval across an advance and
 * a later transfer would leave a payment record carrying two amounts and two
 * dates, and nobody reading it a month later could say what had actually been
 * handed over. A balance that does not cover the work simply stays where it
 * is, and the admin pays normally.
 */
export function settleFromBalance(amount: number | null, balance: number): Settlement {
  const available = Number.isFinite(balance) && balance > 0 ? balance : 0;
  if (amount === null || !Number.isFinite(amount) || amount <= 0) {
    return { settled: false, spent: 0, balanceAfter: available };
  }
  if (available < amount) return { settled: false, spent: 0, balanceAfter: available };
  return { settled: true, spent: amount, balanceAfter: available - amount };
}

export interface EarningsSummary {
  /** Actually paid, all time. Only ever real figures. */
  paid: number;
  /** Approved but not yet paid, at the rates that applied when approved. */
  pendingEstimate: number;
  pendingCount: number;
  /** True when any pending entry has no rate behind it — the total is partial. */
  pendingIncomplete: boolean;
}

/**
 * What one person has made, and what is still owed.
 *
 * Paid and pending are never added together. One is money that exists; the
 * other is arithmetic that an admin has not yet agreed to.
 */
export function earningsFor(payments: readonly Payment[]): EarningsSummary {
  let paid = 0;
  let pendingEstimate = 0;
  let pendingCount = 0;
  let pendingIncomplete = false;

  for (const payment of payments) {
    if (payment.status === "paid") {
      paid += payment.finalAmount ?? 0;
      continue;
    }
    pendingCount += 1;
    if (payment.estimatedAmount === null) pendingIncomplete = true;
    else pendingEstimate += payment.estimatedAmount;
  }

  return { paid, pendingEstimate, pendingCount, pendingIncomplete };
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export function money(amount: number | null): string {
  if (amount === null) return "—";
  return `${CURRENCY}${amount.toLocaleString("en-IN")}`;
}

/** "₹50 per minute". */
export function rateLabel(rate: number | null, unit: PayUnit): string {
  if (rate === null) return "no rate set";
  return `${money(rate)} per ${UNIT_NOUNS[unit]}`;
}

/**
 * The disclaimer. It is not decoration: a member who reads an estimate as a
 * promise and is paid less has been misled by this app, so it says plainly
 * whose decision the final figure is.
 */
/** What the member's balance line says when there is one. */
export function balanceLabel(balance: number): string {
  if (balance <= 0) return "No advance on your account";
  return `${money(balance)} advanced to you, not yet worked off`;
}

export const ESTIMATE_DISCLAIMER =
  "This is an estimate from your rate. The final amount is set by the admin and can differ depending on what the work needed.";

// ---------------------------------------------------------------------------
// Showing a long history a little at a time
// ---------------------------------------------------------------------------

/** How many entries a member sees before asking for more. */
export const PAGE_SIZE = 5;

export interface Page<T> {
  shown: T[];
  hidden: number;
  hasMore: boolean;
}

/**
 * The most recent `size` of something, and how much is behind them.
 *
 * Somebody thirty episodes in has thirty payment rows, and all thirty at once
 * is a wall with the useful part — what happened lately — at the top and no
 * way to tell where it ends.
 */
export function pageOf<T>(items: readonly T[], size: number = PAGE_SIZE): Page<T> {
  const shown = items.slice(0, Math.max(0, size));
  return { shown, hidden: Math.max(0, items.length - shown.length), hasMore: items.length > shown.length };
}

/** "Show 7 more" — never "Show 0 more". */
export function moreLabel(hidden: number): string {
  return hidden === 1 ? "Show 1 more" : `Show ${hidden} more`;
}
