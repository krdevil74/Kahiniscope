import assert from "node:assert/strict";
import test from "node:test";

import {
  addedUpHereNote,
  barsFrom,
  bucketByMonth,
  busiestMonth,
  countOf,
  EMPTY_BAR,
  lastMonths,
  monthKey,
  monthLong,
  monthRange,
  monthShort,
  monthSummary,
  monthsOfYear,
  monthUnreadable,
  paidHeroLabel,
  paidHeroNote,
  pendingSummary,
  rangeLabel,
  sameMonth,
  sumOf,
  yearsFrom,
  type MonthTotal,
} from "./payment-history.ts";

/** 30 September 2026, in the device's own time — which is what months mean here. */
const NOW = new Date(2026, 8, 30, 21, 18);

const month = (year: number, m: number, total: number, count = 1): MonthTotal => ({
  year,
  month: m,
  total,
  count,
});

test("the last twelve months end with this one and run backwards a year", () => {
  const months = lastMonths(NOW);
  assert.equal(months.length, 12);
  assert.deepEqual(months[11], { year: 2026, month: 9 }, "oldest first, newest last");
  assert.deepEqual(months[0], { year: 2025, month: 10 });
});

test("a window that crosses new year counts back through it", () => {
  const months = lastMonths(new Date(2026, 1, 15), 4);
  assert.deepEqual(months, [
    { year: 2025, month: 11 },
    { year: 2025, month: 12 },
    { year: 2026, month: 1 },
    { year: 2026, month: 2 },
  ]);
});

test("a calendar year never runs into the future", () => {
  // Picking this year in September should draw nine bars, not twelve — three
  // of which would be months that have not happened.
  assert.equal(monthsOfYear(2026, NOW).length, 9);
  assert.equal(monthsOfYear(2025, NOW).length, 12);
});

test("a month is half-open, so no payment lands in two of them", () => {
  const { start, end } = monthRange({ year: 2026, month: 9 });
  assert.equal(start.getTime(), new Date(2026, 8, 1).getTime());
  assert.equal(end.getTime(), new Date(2026, 9, 1).getTime());

  // 23:59:59 on the 30th is September; midnight is October. Neither month
  // claims the same instant, and no instant belongs to neither.
  const lastMoment = new Date(2026, 8, 30, 23, 59, 59, 999);
  assert.ok(lastMoment >= start && lastMoment < end);
  assert.ok(end >= monthRange({ year: 2026, month: 10 }).start);
});

test("the year filter runs from the first payment to now, newest first", () => {
  assert.deepEqual(yearsFrom(2024, NOW), [2026, 2025, 2024]);
  // No payments yet, or a date from a phone with a broken clock: offer this
  // year rather than nothing or a thousand.
  assert.deepEqual(yearsFrom(null, NOW), [2026]);
  assert.deepEqual(yearsFrom(2030, NOW), [2026]);
});

// ---------------------------------------------------------------------------
// The bars
// ---------------------------------------------------------------------------

test("bars are scaled against the tallest month in view", () => {
  const bars = barsFrom([month(2026, 7, 500), month(2026, 8, 1000), month(2026, 9, 250)], 100);
  assert.equal(bars[1].height, 100, "the peak reaches the top");
  assert.equal(bars[0].height, 50);
  assert.equal(bars[2].height, 25);
});

test("a month with nothing in it draws a stub, not nothing", () => {
  // A bar of no height is indistinguishable from a month the chart forgot.
  const bars = barsFrom([month(2026, 7, 0, 0), month(2026, 8, 900)], 100);
  assert.equal(bars[0].empty, true);
  assert.equal(bars[0].height, EMPTY_BAR);
  assert.equal(bars[1].empty, false);
});

test("a tiny month stays visible next to a huge one", () => {
  // ₹50 against ₹50,000 rounds to nothing at any sane plot height.
  const bars = barsFrom([month(2026, 8, 50), month(2026, 9, 50_000)], 100);
  assert.ok(bars[0].height >= 4, `expected a floor, got ${bars[0].height}`);
  assert.equal(bars[0].empty, false, "it is small, not absent");
});

test("no money anywhere means no bar pretends otherwise", () => {
  const bars = barsFrom([month(2026, 8, 0, 0), month(2026, 9, 0, 0)], 100);
  assert.deepEqual(bars.map((b) => b.height), [EMPTY_BAR, EMPTY_BAR]);
  assert.equal(busiestMonth([month(2026, 8, 0, 0)]), null);
});

test("the busiest month is the one bar that gets labelled", () => {
  const totals = [month(2026, 7, 500), month(2026, 8, 1200), month(2026, 9, 900)];
  assert.deepEqual(busiestMonth(totals), month(2026, 8, 1200));
});

test("the totals across the window are the sum of the bars", () => {
  const totals = [month(2026, 8, 1200, 3), month(2026, 9, 900, 2)];
  assert.equal(sumOf(totals), 2100);
  assert.equal(countOf(totals), 5);
});

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

test("labels name the month rather than a key", () => {
  assert.equal(monthKey({ year: 2026, month: 9 }), "2026-09");
  assert.equal(monthShort({ year: 2026, month: 9 }), "Sep");
  assert.equal(monthLong({ year: 2026, month: 9 }), "September 2026");
  assert.equal(sameMonth({ year: 2026, month: 9 }, { year: 2026, month: 9 }), true);
  assert.equal(sameMonth({ year: 2025, month: 9 }, { year: 2026, month: 9 }), false);
  assert.equal(sameMonth(null, { year: 2026, month: 9 }), false);
});

test("the panel counts payments, not rupees, and says so", () => {
  assert.equal(pendingSummary(0, "₹0"), "Nothing waiting to be paid");
  assert.equal(pendingSummary(1, "₹500"), "1 payment waiting · ₹500 estimated");
  assert.equal(pendingSummary(4, "₹3,120"), "4 payments waiting · ₹3,120 estimated");
});

test("the chart says which months it is showing", () => {
  assert.equal(
    rangeLabel(lastMonths(NOW, 3)),
    "Jul 2026 — Sep 2026"
  );
  assert.equal(rangeLabel([{ year: 2026, month: 9 }]), "September 2026");
  assert.equal(rangeLabel([]), "No months to show");
});

test("an opened month says what is in it", () => {
  const september = { year: 2026, month: 9 };
  assert.equal(monthSummary(september, 0, "₹0"), "September 2026 · nothing paid");
  assert.equal(monthSummary(september, 1, "₹500"), "September 2026 · 1 payment · ₹500");
  assert.equal(monthSummary(september, 4, "₹3,120"), "September 2026 · 4 payments · ₹3,120");
});

// ---------------------------------------------------------------------------
// Adding up on the phone, when the index will not
// ---------------------------------------------------------------------------

const paid = (at: Date | null, finalAmount: number | null) => ({ paidAt: at, finalAmount });

test("payments land in the month they were paid in, and nowhere else", () => {
  const months = lastMonths(NOW, 3); // Jul, Aug, Sep 2026
  const totals = bucketByMonth(months, [
    paid(new Date(2026, 8, 30, 23, 59, 59), 500),
    paid(new Date(2026, 8, 1, 0, 0, 0), 300),
    paid(new Date(2026, 7, 14), 200),
  ]);

  assert.deepEqual(totals, [
    { year: 2026, month: 7, total: 0, count: 0 },
    { year: 2026, month: 8, total: 200, count: 1 },
    { year: 2026, month: 9, total: 800, count: 2 },
  ]);
});

test("every month asked for comes back, so the chart draws the same columns either way", () => {
  const months = lastMonths(NOW);
  assert.equal(bucketByMonth(months, []).length, 12);
  assert.deepEqual(
    bucketByMonth(months, []).map((t) => t.total),
    new Array(12).fill(0)
  );
});

test("a payment outside the window, or with no date, is in no month", () => {
  const months = lastMonths(NOW, 2); // Aug, Sep 2026
  const totals = bucketByMonth(months, [
    paid(new Date(2025, 2, 4), 900), // long before the window
    paid(new Date(2026, 11, 4), 900), // after it
    paid(null, 900), // never paid, or paid before paidAt existed
    paid(new Date(2026, 8, 9), 150),
  ]);
  assert.equal(sumOf(totals), 150);
  assert.equal(countOf(totals), 1);
});

test("a payment counts even with no amount on it, because it happened", () => {
  // The count is how many payments went out; the total is what they came to.
  // A payment with no finalAmount is one of the former and none of the latter.
  const totals = bucketByMonth([{ year: 2026, month: 9 }], [paid(new Date(2026, 8, 9), null)]);
  assert.deepEqual(totals, [{ year: 2026, month: 9, total: 0, count: 1 }]);
});

test("not being able to add the months up does not read as nothing being paid", () => {
  const months = lastMonths(NOW, 3);
  assert.equal(paidHeroLabel(months), "Paid · Jul 2026 — Sep 2026");
  assert.equal(paidHeroNote(4), "4 payments");
  assert.equal(paidHeroNote(1), "1 payment");
  assert.equal(paidHeroNote(0), "Nothing paid in these months");
  // The failure says so, rather than claiming a figure of zero.
  assert.equal(paidHeroNote(0, true), "Could not be added up");
  assert.equal(monthUnreadable({ year: 2026, month: 9 }), "September 2026 · could not be read");
});

test("the fallback says where its figures came from, and when they may be short", () => {
  assert.match(addedUpHereNote(false, 500), /Added up on this phone/);
  assert.doesNotMatch(addedUpHereNote(false, 500), /500/);
  assert.match(addedUpHereNote(true, 500), /most recent 500 payments/);
  assert.match(addedUpHereNote(true, 500), /may be short/);
});
