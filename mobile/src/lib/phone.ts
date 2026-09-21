/**
 * Phone numbers, as people actually type them.
 *
 * Everybody on this team is in India, so ten digits typed on their own are
 * an Indian mobile — that is the assumption the whole input is built on, and
 * the form shows a fixed +91 rather than asking anybody to type it.
 *
 * Numbers already in E.164 are left exactly as they are, whatever the
 * country. That is not politeness: records written before this rule existed
 * carry +880 numbers, and re-reading one must not corrupt it.
 *
 * Pure: no imports. Unit tested, and mirrored in functions/src/phone.ts.
 */

/** What the form shows, and what a bare ten digits are assumed to be. */
export const DEFAULT_DIAL_CODE = "+91";

/** Indian mobile numbers are ten digits and begin 6, 7, 8 or 9. */
export const NATIONAL_DIGITS = 10;

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

function digitsOnly(input: string | null | undefined): string {
  return (input ?? "").replace(/[^\d]/g, "");
}

/** Returns E.164, or null when it is not a phone number yet. */
export function normalisePhone(input: string | null | undefined): string | null {
  const cleaned = (input ?? "").replace(/[\s\-()]/g, "");
  if (!cleaned) return null;

  // Already international — any country, left alone.
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;

  // A plus that did not match above is a malformed one. Quietly repairing
  // "++91…" would hide a paste that went wrong.
  if (cleaned.includes("+")) return null;

  const digits = digitsOnly(cleaned);

  // Country code typed without the plus.
  if (digits.length === 12 && digits.startsWith("91") && INDIAN_MOBILE.test(digits.slice(2))) {
    return `+${digits}`;
  }

  // The trunk prefix people write in front of a mobile number.
  const national = digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  if (INDIAN_MOBILE.test(national)) return `${DEFAULT_DIAL_CODE}${national}`;

  return null;
}

export function isPhoneValid(input: string | null | undefined): boolean {
  return normalisePhone(input) !== null;
}

/**
 * The ten digits to show in the field, given whatever is on the record.
 *
 * A +91 number goes back to its ten digits so it can be edited. Anything
 * else — an older +880 record — is handed back whole rather than mangled
 * into a shape the field cannot represent.
 */
export function nationalDigits(stored: string | null | undefined): string {
  const value = (stored ?? "").trim();
  if (!value) return "";
  if (value.startsWith(DEFAULT_DIAL_CODE)) return value.slice(DEFAULT_DIAL_CODE.length);
  if (!value.startsWith("+")) return digitsOnly(value).slice(-NATIONAL_DIGITS);
  return value;
}

/** What a ten-digit field should keep as somebody types. */
export function limitNationalInput(input: string): string {
  return digitsOnly(input).slice(0, NATIONAL_DIGITS);
}
