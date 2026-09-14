/**
 * Phone numbers, as people actually type them.
 *
 * The data model wants E.164 (+8801712344192) because that is what WhatsApp
 * and the SMS gateway need. What gets typed is +880 1712 344192, or
 * 01712-344192, or 8801712344192. All three are the same number.
 *
 * Pure: no imports. Unit tested.
 */

/** Returns E.164, or null when it is not a phone number yet. */
export function normalisePhone(input: string): string | null {
  const cleaned = (input ?? "").replace(/[\s\-()]/g, "");
  if (!cleaned) return null;

  // Already international.
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;
  // Bangladeshi local form: the leading 0 is the trunk prefix.
  if (/^0\d{9,10}$/.test(cleaned)) return `+880${cleaned.slice(1)}`;
  // Country code without the plus.
  if (/^880\d{8,11}$/.test(cleaned)) return `+${cleaned}`;
  return null;
}

export function isPhoneValid(input: string): boolean {
  return normalisePhone(input) !== null;
}
