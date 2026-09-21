/**
 * Phone numbers, as people actually type them.
 *
 * The same rules as the app's mobile/src/lib/phone.ts, and deliberately a
 * second implementation rather than a shared package: a contact's number is
 * the key an account is later matched against, so the server must decide
 * what a number is rather than trusting whatever the client normalised.
 * The two are tested against the same examples.
 */

/** Returns E.164, or null when it is not a phone number yet. */
export function normalisePhone(input: string | null | undefined): string | null {
  const cleaned = (input ?? "").replace(/[\s\-()]/g, "");
  if (!cleaned) return null;

  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;
  // Bangladeshi local form: the leading 0 is the trunk prefix.
  if (/^0\d{9,10}$/.test(cleaned)) return `+880${cleaned.slice(1)}`;
  // Country code without the plus.
  if (/^880\d{8,11}$/.test(cleaned)) return `+${cleaned}`;
  return null;
}
