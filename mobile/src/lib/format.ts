/**
 * Small formatters. Pure, unit tested.
 */

/**
 * The longest a name may be. The rules enforce the same number, because the
 * field is the one thing on this form that an admin reads on every screen
 * and a 400-character name would wreck all of them.
 */
export const MAX_NAME = 80;

/**
 * Tidy up what was typed: collapse runs of whitespace, trim the ends, and cut
 * to the cap.
 *
 * Names arrive pasted as often as typed — "  Rizu   Ahmed " is what a paste
 * off a chat message looks like — and the admin screens put this straight
 * into a chip.
 */
export function normaliseName(raw: string): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

/**
 * A name is required, because the whole point of asking is that the Google
 * display name is often not what this person is called on the team. Anything
 * that survives normalisation is accepted — one word, a mononym, Bengali
 * script — and only emptiness is refused.
 */
export function isNameValid(raw: string): boolean {
  return normaliseName(raw).length > 0;
}

/** "Rizu Ahmed" → "RA". Two letters, upper case, for the avatar circles. */
export function initials(name: string | null | undefined): string {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/**
 * Month and weekday names are written out rather than taken from Intl.
 * Hermes ships a cut-down ICU, and what it returns varies by device and by
 * Android version — "Sept" on one, "Sep" on another. The interface is
 * English, the design names these exactly, so they are spelled here.
 */
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Air 20 Sep", as the episode cards write it. */
export function airLabel(date: Date | null): string {
  if (!date) return "no air date";
  return `Air ${String(date.getDate()).padStart(2, "0")} ${MONTHS_SHORT[date.getMonth()]}`;
}

/** "Tuesday, 14 September" — the Board's header subtitle. */
export function boardDateLabel(date: Date): string {
  return `${WEEKDAYS_LONG[date.getDay()]}, ${date.getDate()} ${MONTHS_LONG[date.getMonth()]}`;
}

/** "09:02" for today, "Yesterday", then a date. For the reminder feed. */
export function feedTimeLabel(sentAt: Date | null, now: Date): string {
  if (!sentAt) return "—";
  const sameDay =
    sentAt.getFullYear() === now.getFullYear() &&
    sentAt.getMonth() === now.getMonth() &&
    sentAt.getDate() === now.getDate();
  if (sameDay) {
    return `${String(sentAt.getHours()).padStart(2, "0")}:${String(sentAt.getMinutes()).padStart(2, "0")}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    sentAt.getFullYear() === yesterday.getFullYear() &&
    sentAt.getMonth() === yesterday.getMonth() &&
    sentAt.getDate() === yesterday.getDate()
  ) {
    return "Yesterday";
  }
  return `${sentAt.getDate()} ${MONTHS_SHORT[sentAt.getMonth()]}`;
}

/** "2 hours ago", "yesterday", "3 days ago" — registration meta. */
export function relativeTime(then: Date | null, now: Date): string {
  if (!then) return "just now";
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** "+880 17•• ••4192" — enough to recognise, not enough to publish. */
export function maskPhone(phone: string | null | undefined): string {
  const raw = (phone ?? "").replace(/\s+/g, "");
  if (raw.length < 8) return raw || "no number";
  const country = raw.slice(0, 4);
  const lead = raw.slice(4, 6);
  const tail = raw.slice(-4);
  return `${country} ${lead}•• ••${tail}`;
}

/** "4 of 11 tasks closed across 3 episodes" and friends. */
export function pluralise(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
