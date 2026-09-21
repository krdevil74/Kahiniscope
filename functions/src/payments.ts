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
