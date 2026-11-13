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
 * admin says which at the moment of approval — unless the task itself already
 * says, which is what the Narration type is for.
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
  /**
   * What the whole piece of work came to, on the two records an approval is
   * split into when the advance covered only part of it — one paid from the
   * advance, one pending for the rest. Null on every other payment.
   */
  workAmount: number | null;
  /**
   * The screenshot of the transfer. Two dates rather than the image, because
   * the image is a separate document that is deleted after a month and this
   * record is kept for a year — see lib/payment-proof.ts. `proofAttachedAt`
   * with an expiry in the past means there was one and it has gone, which is a
   * different thing to say from saying nothing.
   */
  proofAttachedAt: Date | null;
  proofExpiresAt: Date | null;
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
    // Narration is what it says it is — one rate, per minute, no question for
    // the admin to answer. "Introduction" and "Special task" are not: an intro
    // read is a few lines and a special is by definition unlike the last one,
    // so both are a figure somebody decides.
    case "Narration":
      return ["voice-narration"];
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
  /** What is still to be paid by transfer. Null when there was no figure to settle. */
  owed: number | null;
  balanceAfter: number;
}

/**
 * How much of this approval is paid out of money already advanced?
 *
 * As much as the balance covers. A balance short of the work is spent to
 * nothing and only the difference is left to pay — making the admin transfer
 * the whole amount while the advance sits there untouched is paying twice for
 * the same work.
 *
 * What it does not do is put both halves on one payment record: a record
 * carrying two amounts and two dates is one nobody can read a month later.
 * The caller writes the advanced part and the owed part as two records, each
 * with one amount and one date.
 */
export function settleFromBalance(amount: number | null, balance: number): Settlement {
  const available = Number.isFinite(balance) && balance > 0 ? balance : 0;
  if (amount === null || !Number.isFinite(amount) || amount <= 0) {
    return { settled: false, spent: 0, owed: null, balanceAfter: available };
  }
  const spent = Math.min(available, amount);
  return {
    settled: spent === amount,
    spent,
    owed: amount - spent,
    balanceAfter: available - spent,
  };
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

// ---------------------------------------------------------------------------
// Showing the working
// ---------------------------------------------------------------------------

export interface Breakdown {
  /** "₹20 per minute", or null where nothing was multiplied. */
  rate: string | null;
  /** "10 minutes", or null. */
  quantity: string | null;
  /** "₹20 × 10 minutes", the sum as written out. */
  working: string | null;
  /** What that came to. */
  total: string;
  /**
   * Why there is no working: not every kind of work has a unit, and a row
   * that shows a total with no explanation reads as though one is missing.
   */
  note: string | null;
}

function plural(count: number, noun: string): string {
  const rounded = Number.isInteger(count) ? count : Math.round(count * 100) / 100;
  return `${rounded} ${noun}${rounded === 1 ? "" : "s"}`;
}

/**
 * How a figure was arrived at.
 *
 * An amount on its own invites the question "why that much", and the answer
 * is arithmetic somebody should be able to check: a rate, a quantity, and the
 * two multiplied. Where there is no rate — script writing, editing, anything
 * the channel does not price by the unit — the honest answer is that an admin
 * decided, and it says so rather than leaving a gap.
 */
export function breakdownOf(payment: Payment): Breakdown {
  const shown = amountToShow(payment);
  const total = money(shown);
  const split = splitNote(payment);

  if (payment.rate === null || payment.quantity === null) {
    return {
      rate: null,
      quantity: null,
      working: null,
      total,
      note: split ?? "No unit rate for this kind of work — the amount was set by the admin.",
    };
  }

  const noun = UNIT_NOUNS[payment.unit];
  const rate = `${money(payment.rate)} per ${noun}`;
  const quantity = plural(payment.quantity, noun);

  return {
    rate,
    quantity,
    working: `${money(payment.rate)} × ${quantity}`,
    total,
    note:
      split ??
      (payment.finalAmount !== null && payment.finalAmount !== payment.estimatedAmount
        ? `Estimated ${money(payment.estimatedAmount)}; the admin paid ${money(payment.finalAmount)}.`
        : null),
  };
}

/**
 * One half of an approval the advance only part covered. Without saying so,
 * the working above it multiplies out to more than the total beside it.
 */
function splitNote(payment: Payment): string | null {
  if (payment.workAmount === null) return null;
  const whole = money(payment.workAmount);
  if (payment.settledFromAdvance) {
    return `${money(payment.finalAmount)} of the ${whole} came off the advance; the rest is a separate payment.`;
  }
  const fromAdvance = payment.workAmount - (payment.estimatedAmount ?? 0);
  return `${money(fromAdvance)} of the ${whole} came off the advance; this is the rest.`;
}

// ---------------------------------------------------------------------------
// One request per person
// ---------------------------------------------------------------------------

export interface PersonOwed {
  uid: string;
  /** Everything approved and not yet paid, oldest first. */
  payments: Payment[];
  /** The estimates added up. Lines with no estimate add nothing. */
  estimated: number;
}

/**
 * The queue as people rather than tasks: one transfer settles everything a
 * person is owed, so that is what the admin should see — a single figure,
 * with the tasks behind it as its breakdown.
 *
 * Groups come out in the order their first payment appears.
 *
 * Pure: no React, no Firebase. Unit tested.
 */
export function owedByPerson(payments: readonly Payment[]): PersonOwed[] {
  const groups = new Map<string, PersonOwed>();
  for (const payment of payments) {
    const group = groups.get(payment.uid) ?? { uid: payment.uid, payments: [], estimated: 0 };
    group.payments.push(payment);
    group.estimated += payment.estimatedAmount ?? 0;
    groups.set(payment.uid, group);
  }
  for (const group of groups.values()) {
    group.payments.sort((a, b) => (a.approvedAt?.getTime() ?? 0) - (b.approvedAt?.getTime() ?? 0));
  }
  return [...groups.values()];
}
