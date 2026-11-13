/**
 * What work is worth, on the server.
 *
 * Deliberately a second implementation of mobile/src/lib/payments.ts rather
 * than a shared package — one of these is bundled into an Android app and the
 * other is a Cloud Function on Node. They must agree, and both are tested
 * against the same examples, exactly as the escalation ladder already is.
 *
 * The server is the one that counts: an estimate shown in the app is a
 * courtesy, but the figure written onto a payment record is the one an admin
 * approves against, so it is calculated here from a rate read here.
 */

export type PayUnit =
  | "voice-character"
  | "voice-narration"
  | "sound-design"
  | "cover"
  | "manual";

export const PAY_UNITS: PayUnit[] = [
  "voice-character",
  "voice-narration",
  "sound-design",
  "cover",
  "manual",
];

export interface Rates {
  voiceCharacter: number | null;
  voiceNarration: number | null;
  soundDesign: number | null;
  cover: number | null;
}

export const EMPTY_RATES: Rates = {
  voiceCharacter: null,
  voiceNarration: null,
  soundDesign: null,
  cover: null,
};

/** A rate is a positive number. Zero is not a rate; it is "unpaid". */
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

/** The units an admin may approve this kind of task under. */
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

export function needsRecordingTime(unit: PayUnit): boolean {
  return unit === "voice-character" || unit === "voice-narration" || unit === "sound-design";
}

/** quantity × rate, to the rupee, or null when there is nothing to multiply. */
export function estimateFor(quantity: number | null, rateValue: number | null): number | null {
  if (quantity === null || rateValue === null) return null;
  if (!Number.isFinite(quantity) || !Number.isFinite(rateValue)) return null;
  if (quantity < 0 || rateValue < 0) return null;
  return Math.round(quantity * rateValue);
}

/**
 * How many units this approval is worth: minutes for audio, one for a cover,
 * and nothing at all where the admin is typing a figure.
 */
export function quantityFor(unit: PayUnit, recordingMinutes: number | null): number | null {
  if (needsRecordingTime(unit)) return recordingMinutes;
  if (unit === "cover") return 1;
  return null;
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
 *
 * The same rule is in mobile/src/lib/payments.ts, tested against the same
 * examples. This one is the one that counts: it decides what is written.
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
