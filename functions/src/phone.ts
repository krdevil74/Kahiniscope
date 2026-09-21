/**
 * The server's own reading of a phone number.
 *
 * Everybody on this team is in India, so ten digits typed on their own are an
 * Indian mobile. Numbers already in E.164 are left exactly as they are,
 * whatever the country: records written before this rule existed carry +880
 * numbers, and re-reading one must not corrupt it.
 *
 * The same rules as the app's mobile/src/lib/phone.ts, and deliberately a
 * second implementation rather than a shared package: a contact's number is
 * the key an account is later matched against, so the server must decide what
 * a number is rather than trusting whatever the client normalised. The two
 * are tested against the same examples.
 */

export const DEFAULT_DIAL_CODE = "+91";

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/** Returns E.164, or null when it is not a phone number yet. */
export function normalisePhone(input: string | null | undefined): string | null {
  const cleaned = (input ?? "").replace(/[\s\-()]/g, "");
  if (!cleaned) return null;

  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;

  // A plus that did not match above is a malformed one. Quietly repairing
  // "++91…" would hide a paste that went wrong.
  if (cleaned.includes("+")) return null;

  const digits = cleaned.replace(/[^\d]/g, "");

  if (digits.length === 12 && digits.startsWith("91") && INDIAN_MOBILE.test(digits.slice(2))) {
    return `+${digits}`;
  }

  const national = digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  if (INDIAN_MOBILE.test(national)) return `${DEFAULT_DIAL_CODE}${national}`;

  return null;
}
