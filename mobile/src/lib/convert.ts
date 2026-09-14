/**
 * Reading what Firestore hands back.
 *
 * Duck-typed on purpose rather than using `instanceof Timestamp`: a document
 * reference is anything with an `id`, and a timestamp is anything that can
 * turn itself into a Date. That survives two copies of the SDK in one bundle,
 * and it makes these rules testable without Firebase.
 */

/** A Firestore Timestamp, a Date, or nothing. */
export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return null;
}

/**
 * The data model calls `episodeId` a reference and the Assign form writes
 * one; hand-seeded documents tend to carry a plain id string. Both are read.
 */
export function toId(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string") return id;
  }
  return "";
}

export function toBool(value: unknown): boolean {
  return value === true;
}

export function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
