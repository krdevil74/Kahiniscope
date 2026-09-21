/**
 * The escalation rule, tested on its own.
 *
 * Every date here is written in UTC and read back in Dhaka (UTC+6), which is
 * the trap this job would otherwise fall into: a reminder that goes out on
 * the right UTC day and the wrong Bangladeshi one.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  REJECTED_GAP_DAYS,
  chaseGapFor,
  daysBetween,
  daysOverdue,
  decide,
  dhakaParts,
  gapFor,
  isQuietHour,
  sameDhakaDay,
  stepOf,
} from "../lib/escalation/decide.js";

const PLAN = [7, 4, 3, 2, 1];
const QUIET = { enabled: true, from: 22, to: 8, sendQueuedAt: 9 };
const OFF = { enabled: false, from: 22, to: 8, sendQueuedAt: 9 };

/** 09:00 in Dhaka on 14 September 2026 is 03:00 UTC. */
const NINE_AM = new Date("2026-09-14T03:00:00Z");

function task(overrides = {}) {
  return {
    id: "t1",
    assigneeUid: "u1",
    remindersSent: 0,
    lastReminderAt: null,
    assignedAt: NINE_AM,
    ...overrides,
  };
}

function daysBefore(days, from = NINE_AM) {
  return new Date(from.getTime() - days * 86_400_000);
}

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

test("dates are read as the team would read them, in Dhaka", () => {
  assert.deepEqual(dhakaParts(NINE_AM), { year: 2026, month: 9, day: 14, hour: 9 });

  // 20:00 UTC is already tomorrow in Dhaka — 02:00 the next day.
  assert.deepEqual(dhakaParts(new Date("2026-09-14T20:00:00Z")), {
    year: 2026,
    month: 9,
    day: 15,
    hour: 2,
  });

  // And 23:00 UTC on the 13th is still the 14th there.
  assert.deepEqual(dhakaParts(new Date("2026-09-13T23:00:00Z")).day, 14);
});

test("midnight in Dhaka is hour 0, not hour 24", () => {
  assert.equal(dhakaParts(new Date("2026-09-13T18:00:00Z")).hour, 0);
});

test("day counting uses Dhaka's calendar, not UTC's", () => {
  // 23:00 UTC on the 13th and 03:00 UTC on the 14th are the same Dhaka day.
  assert.equal(sameDhakaDay(new Date("2026-09-13T23:00:00Z"), NINE_AM), true);
  assert.equal(daysBetween(new Date("2026-09-13T23:00:00Z"), NINE_AM), 0);

  // But 17:00 UTC on the 13th is the day before.
  assert.equal(daysBetween(new Date("2026-09-13T17:00:00Z"), NINE_AM), 1);
});

test("day counting crosses months and years", () => {
  assert.equal(daysBetween(new Date("2026-09-30T03:00:00Z"), new Date("2026-10-01T03:00:00Z")), 1);
  assert.equal(daysBetween(new Date("2026-12-31T03:00:00Z"), new Date("2027-01-01T03:00:00Z")), 1);
});

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

test("the ladder is 7, 4, 3, 2, 1 and then daily forever", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((s) => gapFor(s, PLAN)), [7, 4, 3, 2, 1]);
  for (const sent of [5, 9, 100]) {
    assert.equal(gapFor(sent, PLAN), 1, `after ${sent} reminders`);
    assert.equal(stepOf(sent, PLAN), 4);
  }
});

test("the gaps come from settings, never from this file", () => {
  assert.equal(gapFor(0, [3, 2]), 3);
  assert.equal(gapFor(5, [3, 2]), 2);
  assert.equal(gapFor(0, []), 1, "an empty plan still means something");
});

// ---------------------------------------------------------------------------
// Deciding
// ---------------------------------------------------------------------------

test("a fresh task waits the first seven days", () => {
  for (const days of [0, 1, 6]) {
    const d = decide(task({ assignedAt: daysBefore(days) }), PLAN, NINE_AM, QUIET);
    assert.equal(d.send, false, `${days} days in`);
    assert.equal(d.reason, "not-due");
  }

  const due = decide(task({ assignedAt: daysBefore(7) }), PLAN, NINE_AM, QUIET);
  assert.equal(due.send, true);
  assert.equal(due.step, 0);
  assert.equal(due.daysSince, 7);
});

test("once chased, the clock runs from the last reminder", () => {
  const chased = task({ remindersSent: 1, assignedAt: daysBefore(40), lastReminderAt: daysBefore(3) });
  assert.equal(decide(chased, PLAN, NINE_AM, QUIET).send, false, "4-day gap, 3 days in");

  const older = task({ remindersSent: 1, assignedAt: daysBefore(40), lastReminderAt: daysBefore(4) });
  assert.equal(decide(older, PLAN, NINE_AM, QUIET).send, true);
});

test("past the fifth reminder it is daily, forever", () => {
  const daily = task({ remindersSent: 12, assignedAt: daysBefore(90), lastReminderAt: daysBefore(1) });
  const d = decide(daily, PLAN, NINE_AM, QUIET);
  assert.equal(d.send, true);
  assert.equal(d.step, 4);
});

test("the job is safe to run twice in a day", () => {
  // Chased this morning already — by this job, or by an admin tapping Nudge.
  const today = task({ remindersSent: 4, assignedAt: daysBefore(40), lastReminderAt: NINE_AM });
  const d = decide(today, PLAN, new Date("2026-09-14T04:30:00Z"), QUIET);
  assert.equal(d.send, false);
  assert.equal(d.reason, "already-sent-today");
});

test("the guard is on Dhaka's day, not the last 24 hours", () => {
  // Sent at 23:30 Dhaka last night; it is 09:00 the next morning. That is a
  // new day and under 24 hours, and the reminder is due again.
  const lastNight = new Date("2026-09-13T17:30:00Z");
  const daily = task({ remindersSent: 6, assignedAt: daysBefore(40), lastReminderAt: lastNight });
  assert.equal(decide(daily, PLAN, NINE_AM, QUIET).send, true);
});

test("a task with no dates at all is left alone rather than chased forever", () => {
  const orphan = task({ assignedAt: null, lastReminderAt: null });
  const d = decide(orphan, PLAN, NINE_AM, QUIET);
  assert.equal(d.send, false);
  assert.equal(d.reason, "never-started");
});

// ---------------------------------------------------------------------------
// Quiet hours
// ---------------------------------------------------------------------------

test("the quiet window wraps midnight", () => {
  const at = (iso) => isQuietHour(new Date(iso), QUIET);
  assert.equal(at("2026-09-14T16:30:00Z"), true, "22:30 Dhaka");
  assert.equal(at("2026-09-13T20:00:00Z"), true, "02:00 Dhaka");
  assert.equal(at("2026-09-14T01:30:00Z"), true, "07:30 Dhaka");
  assert.equal(at("2026-09-14T03:00:00Z"), false, "09:00 Dhaka");
  assert.equal(at("2026-09-14T15:30:00Z"), false, "21:30 Dhaka");
});

test("quiet hours can be switched off", () => {
  assert.equal(isQuietHour(new Date("2026-09-14T16:30:00Z"), OFF), false);
});

test("a due reminder inside the quiet window is held, not dropped", () => {
  const due = task({ assignedAt: daysBefore(9) });
  const lateNight = new Date("2026-09-14T16:30:00Z"); // 22:30 Dhaka
  const d = decide(due, PLAN, lateNight, QUIET);
  assert.equal(d.send, false);
  assert.equal(d.reason, "quiet-hours", "still due — it goes out at 9am");

  // Same task, same day, at nine in the morning.
  assert.equal(decide(due, PLAN, NINE_AM, QUIET).send, true);
});

test("overdue days are counted for the message copy", () => {
  assert.equal(daysOverdue(daysBefore(4), NINE_AM), 4);
  assert.equal(daysOverdue(NINE_AM, NINE_AM), 0);
  assert.equal(daysOverdue(new Date(NINE_AM.getTime() + 3 * 86_400_000), NINE_AM), -3);
  assert.equal(daysOverdue(null, NINE_AM), 0);
});

// --- the review flow -------------------------------------------------------

test("work that has been handed in stops the chasing", () => {
  const base = {
    id: "t1",
    assigneeUid: "u1",
    remindersSent: 0,
    lastReminderAt: null,
    assignedAt: new Date("2026-09-01T03:00:00Z"),
  };
  const now = new Date("2026-09-20T03:00:00Z");
  const quiet = { enabled: false, from: 22, to: 8, sendQueuedAt: 9 };

  // Open: long overdue, chased.
  assert.equal(decide({ ...base, status: "open" }, [7, 4, 3, 2, 1], now, quiet).send, true);

  // Submitted: the member has done their part; it is the admin who is late.
  const submitted = decide({ ...base, status: "submitted" }, [7, 4, 3, 2, 1], now, quiet);
  assert.equal(submitted.send, false);
  assert.equal(submitted.reason, "not-open");

  for (const status of ["approved", "paid"]) {
    assert.equal(decide({ ...base, status }, [7, 4, 3, 2, 1], now, quiet).send, false, status);
  }
});

test("a task sent back is chased every other day, not up the ladder", () => {
  const plan = [7, 4, 3, 2, 1];
  const rejected = {
    id: "t1",
    assigneeUid: "u1",
    status: "open",
    rejectedAt: new Date("2026-09-18T03:00:00Z"),
    remindersSent: 0,
    lastReminderAt: new Date("2026-09-18T03:00:00Z"),
    assignedAt: new Date("2026-09-01T03:00:00Z"),
  };
  const quiet = { enabled: false, from: 22, to: 8, sendQueuedAt: 9 };

  // One day later: the ladder's first gap is seven, but this is not the ladder.
  assert.equal(decide(rejected, plan, new Date("2026-09-19T03:00:00Z"), quiet).send, false);
  // Two days later: chased.
  assert.equal(decide(rejected, plan, new Date("2026-09-20T03:00:00Z"), quiet).send, true);

  // And it stays two days however many reminders have gone out.
  const chased = { ...rejected, remindersSent: 9 };
  assert.equal(decide(chased, plan, new Date("2026-09-19T03:00:00Z"), quiet).send, false);
  assert.equal(decide(chased, plan, new Date("2026-09-20T03:00:00Z"), quiet).send, true);
});

test("the two gap rules agree with chaseGapFor", () => {
  const plan = [7, 4, 3, 2, 1];
  assert.equal(chaseGapFor({ id: "t", assigneeUid: "u", remindersSent: 0, lastReminderAt: null, assignedAt: null }, plan), 7);
  assert.equal(
    chaseGapFor(
      { id: "t", assigneeUid: "u", status: "open", rejectedAt: new Date(), remindersSent: 0, lastReminderAt: null, assignedAt: null },
      plan
    ),
    REJECTED_GAP_DAYS
  );
  assert.equal(REJECTED_GAP_DAYS, 2);
});
