import assert from "node:assert/strict";
import test from "node:test";

import { memberSummary, monthlyActivity, peakOf } from "./member-summary.ts";
import type { Task } from "./model.ts";
import type { Payment } from "./payments.ts";

const NOW = new Date("2026-09-22T10:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

function task(overrides: Partial<Task>): Task {
  return {
    id: "t", episodeId: "ep41", assigneeUid: "u1", type: "Voice recording",
    dueDate: null, status: "open", done: false, doneAt: null,
    submittedAt: null, submissionNote: null, rejectedAt: null,
    rejectionNote: null, rejectedCount: 0, remindersSent: 0,
    lastReminderAt: null, assignedAt: null, preferredChannel: null,
    ...overrides,
  };
}

function payment(overrides: Partial<Payment>): Payment {
  return {
    id: "p", taskId: "t", uid: "u1", episodeId: "ep41", taskType: "Voice recording",
    status: "pending", unit: "voice-narration", quantity: null, rate: null,
    estimatedAmount: null, finalAmount: null, recordingMinutes: null,
    wordCount: null, comment: null, approvedAt: null, paidAt: null,
    settledFromAdvance: false,
    ...overrides,
  };
}

test("the three task counts answer three different questions", () => {
  const s = memberSummary(
    [
      task({ status: "open" }),
      task({ status: "open", rejectedAt: ago(1) }),
      task({ status: "submitted" }),
      task({ status: "approved" }),
      task({ status: "paid" }),
    ],
    [],
    NOW
  );
  // Work sent back is still work they owe, so it counts as pending.
  assert.equal(s.pending, 2);
  assert.equal(s.submitted, 1);
  // Paid work was approved first; both count as accepted.
  assert.equal(s.approved, 2);
});

test("paid is counted by window, and the windows nest", () => {
  const s = memberSummary(
    [],
    [
      payment({ status: "paid", finalAmount: 500, paidAt: ago(3) }),
      payment({ status: "paid", finalAmount: 700, paidAt: ago(100) }),
      payment({ status: "paid", finalAmount: 900, paidAt: ago(400) }),
    ],
    NOW
  );
  assert.equal(s.paidLastMonth, 500);
  assert.equal(s.paidLastYear, 1200, "the last month is inside the last year");
  assert.equal(s.paidAllTime, 2100);
});

test("a payment with no date is not counted as recent", () => {
  const s = memberSummary([], [payment({ status: "paid", finalAmount: 500, paidAt: null })], NOW);
  assert.equal(s.paidLastMonth, 0);
  assert.equal(s.paidAllTime, 500, "it was still paid");
});

test("pending is the estimate, and says when it is only part of one", () => {
  const s = memberSummary(
    [],
    [
      payment({ status: "pending", estimatedAmount: 600 }),
      payment({ status: "pending", estimatedAmount: null }),
    ],
    NOW
  );
  assert.equal(s.paymentPending, 600);
  assert.equal(s.paymentPendingPartial, true);
});

test("a new member's screen is zeroes, not blanks", () => {
  const s = memberSummary([], [], NOW);
  assert.equal(s.pending, 0);
  assert.equal(s.paidAllTime, 0);
  assert.equal(s.paymentPendingPartial, false);
});

// --- the chart -------------------------------------------------------------

test("six months, oldest first, ending with this one", () => {
  const months = monthlyActivity([], NOW);
  assert.equal(months.length, 6);
  assert.deepEqual(months.map((m) => m.label), ["Apr", "May", "Jun", "Jul", "Aug", "Sep"]);
});

test("a task counts in the month it was given out and the month it came back", () => {
  const months = monthlyActivity(
    [task({ assignedAt: new Date(2026, 7, 10), submittedAt: new Date(2026, 8, 2) })],
    NOW
  );
  const aug = months.find((m) => m.label === "Aug")!;
  const sep = months.find((m) => m.label === "Sep")!;
  assert.equal(aug.assigned, 1);
  assert.equal(aug.submitted, 0, "it was not handed in that month");
  assert.equal(sep.assigned, 0);
  assert.equal(sep.submitted, 1, "the gap between the two is the point of the chart");
});

test("work older than the window is left out of it", () => {
  const months = monthlyActivity([task({ assignedAt: new Date(2025, 0, 1) })], NOW);
  assert.equal(months.reduce((n, m) => n + m.assigned, 0), 0);
});

test("a quiet month is kept, because a gap is information", () => {
  const months = monthlyActivity([task({ assignedAt: new Date(2026, 8, 1) })], NOW);
  assert.equal(months.length, 6);
  assert.equal(months.filter((m) => m.assigned === 0).length, 5);
});

test("two Septembers a year apart never collapse into one column", () => {
  const months = monthlyActivity(
    [
      task({ assignedAt: new Date(2026, 8, 1) }),
      task({ assignedAt: new Date(2025, 8, 1) }),
    ],
    NOW
  );
  assert.equal(months.find((m) => m.label === "Sep")!.assigned, 1);
});

test("the window crosses a year boundary without losing a month", () => {
  const january = new Date("2026-01-15T10:00:00Z");
  const months = monthlyActivity([], january);
  assert.deepEqual(months.map((m) => m.label), ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan"]);
});

test("the peak is what every bar is drawn against", () => {
  const months = monthlyActivity(
    [
      task({ assignedAt: new Date(2026, 8, 1) }),
      task({ assignedAt: new Date(2026, 8, 2) }),
      task({ assignedAt: new Date(2026, 8, 3), submittedAt: new Date(2026, 8, 4) }),
    ],
    NOW
  );
  assert.equal(peakOf(months), 3);
  // Nothing at all must not become a division by zero in the chart.
  assert.equal(peakOf(monthlyActivity([], NOW)), 0);
});
