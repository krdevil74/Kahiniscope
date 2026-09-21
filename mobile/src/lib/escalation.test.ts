import test from "node:test";
import assert from "node:assert/strict";

import {
  byChaseOrder,
  cadenceLabel,
  countdownLabel,
  daysBetween,
  daysSinceLastReminder,
  daysUntilDue,
  daysUntilNextReminder,
  dueLabel,
  gapFor,
  isOverdue,
  memberNote,
  rowNote,
  stepOf,
} from "./escalation.ts";

const PLAN = [7, 4, 3, 2, 1];
const NOW = new Date(2026, 8, 14, 9, 0, 0); // 14 September 2026, 09:00

function task(overrides: Partial<import("./model").Task> = {}): import("./model").Task {
  return {
    id: "t1",
    episodeId: "e1",
    assigneeUid: "u1",
    type: "Voice recording",
    dueDate: NOW,
    status: "open",
    done: false,
    submittedAt: null,
    rejectedAt: null,
    rejectionNote: null,
    rejectedCount: 0,
    doneAt: null,
    remindersSent: 0,
    lastReminderAt: null,
    assignedAt: NOW,
    preferredChannel: null,
    ...overrides,
  };
}

function daysFromNow(days: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  return d;
}

test("daysBetween counts calendar days, not elapsed hours", () => {
  assert.equal(daysBetween(new Date(2026, 8, 14, 23, 59), new Date(2026, 8, 15, 0, 1)), 1);
  assert.equal(daysBetween(new Date(2026, 8, 14, 0, 1), new Date(2026, 8, 14, 23, 59)), 0);
  assert.equal(daysBetween(new Date(2026, 8, 15), new Date(2026, 8, 14)), -1);
});

test("daysBetween crosses months and years", () => {
  assert.equal(daysBetween(new Date(2026, 8, 30), new Date(2026, 9, 1)), 1);
  assert.equal(daysBetween(new Date(2026, 11, 31), new Date(2027, 0, 1)), 1);
});

test("the ladder is 7, 4, 3, 2, 1 and then daily forever", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((sent) => gapFor(sent, PLAN)),
    [7, 4, 3, 2, 1]
  );
  // The step index is capped, so the fifth reminder onwards stays at one day.
  for (const sent of [5, 6, 12, 400]) {
    assert.equal(gapFor(sent, PLAN), 1, `after ${sent} reminders`);
    assert.equal(stepOf(sent, PLAN), 4);
  }
});

test("the ladder comes from settings, never from the code", () => {
  const custom = [3, 2];
  assert.equal(gapFor(0, custom), 3);
  assert.equal(gapFor(1, custom), 2);
  assert.equal(gapFor(9, custom), 2, "caps on the last rung of whatever plan is set");
});

test("a task with no reminders yet counts from when it was assigned", () => {
  const t = task({ assignedAt: daysFromNow(-5), lastReminderAt: null });
  assert.equal(daysSinceLastReminder(t, NOW), 5);
  assert.equal(daysUntilNextReminder(t, PLAN, NOW), 2, "7-day gap, 5 days in");
});

test("once a reminder has gone out, the clock runs from that", () => {
  const t = task({ assignedAt: daysFromNow(-30), lastReminderAt: daysFromNow(-1), remindersSent: 3 });
  assert.equal(daysSinceLastReminder(t, NOW), 1);
  assert.equal(daysUntilNextReminder(t, PLAN, NOW), 1, "2-day gap at step 3, one day in");
});

test("a reminder that is due does not go negative", () => {
  const t = task({ lastReminderAt: daysFromNow(-40), remindersSent: 4 });
  assert.equal(daysUntilNextReminder(t, PLAN, NOW), 0);
});

test("due labels read the way the design writes them", () => {
  assert.equal(dueLabel(task({ dueDate: daysFromNow(-4) }), NOW), "4d overdue");
  assert.equal(dueLabel(task({ dueDate: NOW }), NOW), "due today");
  assert.equal(dueLabel(task({ dueDate: daysFromNow(3) }), NOW), "due in 3d");
});

test("overdue means past due and not done", () => {
  assert.equal(isOverdue(task({ dueDate: daysFromNow(-1) }), NOW), true);
  assert.equal(isOverdue(task({ dueDate: daysFromNow(-1), done: true }), NOW), false);
  assert.equal(isOverdue(task({ dueDate: NOW }), NOW), false);
});

test("cadence is spelled out at each rung", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((s) => cadenceLabel(s, PLAN)),
    ["weekly", "every 4 days", "every 3 days", "every 2 days", "daily", "daily"]
  );
});

test("the countdown chip counts the next reminder, not the last", () => {
  const t = task({ remindersSent: 3, lastReminderAt: daysFromNow(-2) });
  assert.equal(countdownLabel(t, PLAN, NOW), "Reminder #4 today · every 2 days");

  const tomorrow = task({ remindersSent: 1, lastReminderAt: daysFromNow(-3) });
  assert.equal(countdownLabel(tomorrow, PLAN, NOW), "Reminder #2 tomorrow · every 4 days");

  const later = task({ remindersSent: 0, lastReminderAt: null, assignedAt: daysFromNow(-2) });
  assert.equal(countdownLabel(later, PLAN, NOW), "Reminder #1 in 5 days · weekly");
});

test("a done task says so instead of counting", () => {
  const t = task({ done: true, remindersSent: 4 });
  assert.equal(countdownLabel(t, PLAN, NOW), "Complete — no further reminders");
  assert.equal(rowNote(t, PLAN, NOW), "closed");
  assert.equal(memberNote(t, PLAN, NOW), "Closed — thanks");
});

test("row and member notes pair the due state with the next reminder", () => {
  const t = task({ dueDate: daysFromNow(-4), remindersSent: 3, lastReminderAt: daysFromNow(-2) });
  assert.equal(rowNote(t, PLAN, NOW), "4d overdue · reminder #4 in 0d");
  assert.equal(memberNote(t, PLAN, NOW), "4d overdue · next reminder today");

  const soon = task({ dueDate: daysFromNow(2), remindersSent: 1, lastReminderAt: daysFromNow(-1) });
  assert.equal(memberNote(soon, PLAN, NOW), "due in 2d · next reminder in 3d");
});

test("needs chasing sorts by escalation, then by how overdue", () => {
  const a = task({ id: "a", remindersSent: 1, dueDate: daysFromNow(-1) });
  const b = task({ id: "b", remindersSent: 4, dueDate: daysFromNow(5) });
  const c = task({ id: "c", remindersSent: 1, dueDate: daysFromNow(-9) });
  const d = task({ id: "d", remindersSent: 0, dueDate: daysFromNow(-20) });

  assert.deepEqual(
    byChaseOrder([a, b, c, d], NOW).map((t) => t.id),
    ["b", "c", "a", "d"]
  );
});

test("chase order does not mutate what it is given", () => {
  const tasks = [task({ id: "a", remindersSent: 0 }), task({ id: "b", remindersSent: 4 })];
  byChaseOrder(tasks, NOW);
  assert.deepEqual(tasks.map((t) => t.id), ["a", "b"]);
});

test("a task with no dates is treated as due today, not as an error", () => {
  const t = task({ dueDate: null, assignedAt: null, lastReminderAt: null });
  assert.equal(daysUntilDue(t, NOW), 0);
  assert.equal(dueLabel(t, NOW), "due today");
  assert.equal(daysSinceLastReminder(t, NOW), 0);
});
