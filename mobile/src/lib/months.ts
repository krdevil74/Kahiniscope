/**
 * Months, as two screens full of filters need them.
 *
 * Lifted out of payment-history.ts when the Episodes screen needed the same
 * year-and-month filter the Payments chart already had. Nothing here knows
 * what is being counted.
 *
 * Months are the device's own months. Whoever reads them is looking at a
 * calendar on a wall in Dhaka, and a boundary drawn in UTC would put the
 * evening of the 31st in the wrong month.
 *
 * Pure: no Firebase, no React. Unit tested.
 */

/** A month, 1-indexed the way people say it: `{ year: 2026, month: 9 }`. */
export interface MonthSlot {
  year: number;
  month: number;
}

/** How many bars the chart shows. Twelve is a year read at a glance. */
export const MONTHS_SHOWN = 12;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export function monthSlotOf(date: Date): MonthSlot {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function sameMonth(a: MonthSlot | null, b: MonthSlot | null): boolean {
  if (!a || !b) return false;
  return a.year === b.year && a.month === b.month;
}

/** Stable key for a slot: "2026-09". Sorts correctly as a string. */
export function monthKey(slot: MonthSlot): string {
  return `${slot.year}-${String(slot.month).padStart(2, "0")}`;
}

/** "Sep" — the axis tick. */
export function monthShort(slot: MonthSlot): string {
  return MONTH_NAMES[slot.month - 1].slice(0, 3);
}

/** "September 2026" — the heading over the month's own list. */
export function monthLong(slot: MonthSlot): string {
  return `${MONTH_NAMES[slot.month - 1]} ${slot.year}`;
}

/**
 * The half-open range a month covers, in the device's own time.
 *
 * Half-open on purpose: `paidAt >= start && paidAt < end`. A payment made at
 * 23:59:59 on the 30th belongs to September, and one made at midnight belongs
 * to October, with no instant claimed by both months or by neither.
 */
export function monthRange(slot: MonthSlot): { start: Date; end: Date } {
  return {
    start: new Date(slot.year, slot.month - 1, 1, 0, 0, 0, 0),
    end: new Date(slot.year, slot.month, 1, 0, 0, 0, 0),
  };
}

/** The last `count` months, oldest first, ending with the one `now` is in. */
export function lastMonths(now: Date, count: number = MONTHS_SHOWN): MonthSlot[] {
  const months: MonthSlot[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    months.push(monthSlotOf(new Date(now.getFullYear(), now.getMonth() - back, 1)));
  }
  return months;
}

/**
 * January to December of one year — but never into the future. Picking this
 * year should not draw eight empty bars for months that have not happened.
 */
export function monthsOfYear(year: number, now: Date): MonthSlot[] {
  const last = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const months: MonthSlot[] = [];
  for (let month = 1; month <= last; month += 1) months.push({ year, month });
  return months;
}

/**
 * The years the filter offers: from the first payment to this one, newest
 * first. The earliest year comes from a single document read — one payment,
 * ordered by date — rather than from loading them all to find out.
 */
export function yearsFrom(earliest: number | null, now: Date): number[] {
  const thisYear = now.getFullYear();
  const first = earliest && earliest <= thisYear ? earliest : thisYear;
  const years: number[] = [];
  for (let year = thisYear; year >= first; year -= 1) years.push(year);
  return years;
}
